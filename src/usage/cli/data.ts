// 使用情况 CLI（data）：自 commands.ts 按子命令组拆分，文案与顺序逐字未改
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import type { Command } from "commander"
import { assertJsonFormat } from "../../json-output"
import { AGENT_ADAPTERS } from "../adapters"
import { processHookEvent } from "../ingest"
import { parseTranscript } from "../transcript"
import { buildEvent, resolveSkillMeta } from "../event"
import { shouldRecord } from "../filter"
import { loadUsageConfig } from "../config"
import { flushQueue } from "../flush"
import { hasRecordableSkills, recordSkills } from "../record"
import { usageGlobalRule } from "../rule"
import { eventsToCsv, eventsToJsonl, filterEvents, summarize, unusedSkills } from "../stats"
import { appendEvent, dedupeStore, purgeEvents, readAllEvents, readIndex, rebuildIndex } from "../store"
import { createContext, parseImportFile, parseOlderThanDays, parseSinceOption, parseSource, printJson, printSkillSummary, printTriggers, splitNames } from "./context"


export function registerUsageDataCommands(usage: Command): void {
    // 统计：按技能 / 会话 / 触发词三种视图聚合
    usage
      .command("stats")
      .description("技能使用统计（默认按技能聚合）")
      .option("--by <view>", "聚合视图：skill / session / trigger（默认 skill）")
      .option("--limit <count>", "显示条数（默认 20）")
      .option("--since <value>", "起始时间：30d / 24h / 60m / YYYY-MM-DD")
      .option("--agent <name>", "按 Agent 过滤")
      .option("--source <source>", "按来源过滤：toolkit-first-party / toolkit-third-party / unmanaged / unknown")
      .option("--skill <name>", "按技能过滤")
      .option("--unused", "列出零使用技能（仅 --by skill 有效）")
      .option("--dir <path>", "本次使用的数据目录")
      .option("--format <format>", "输出格式（json）")
      .action((options: { by?: string; limit?: string; since?: string; agent?: string; source?: string; skill?: string; unused?: boolean; dir?: string; format?: string }) => {
        if (!assertJsonFormat(options.format)) return
        const by = options.by ?? "skill"
        if (!["skill", "session", "trigger"].includes(by)) {
          console.error("⚠️ --by 取值须为 skill / session / trigger")
          process.exitCode = 1
          return
        }
        const limit = Number(options.limit ?? 20)
        if (!Number.isInteger(limit) || limit <= 0) {
          console.error("⚠️ --limit 须为正整数")
          process.exitCode = 1
          return
        }
        if (options.unused && by !== "skill") console.warn("⚠️ --unused 仅 --by skill 有效，已忽略")
        const since = parseSinceOption(options.since)
        if (since === null) return
        const source = parseSource(options.source)
        if (source === null && options.source !== undefined) return
        const { config, dir, paths } = createContext(options.dir)
        const all = readAllEvents(paths)
        const events = filterEvents(all, { since, agent: options.agent, source: source ?? undefined, skill: options.skill })
        const summary = summarize(events)
        const unused = options.unused && by === "skill" ? unusedSkills(all) : undefined
        if (options.format === "json") {
          printJson({ ...summary, unused, dataDir: dir, by })
          return
        }
        if (by === "session") {
          if (summary.sessions.length === 0) {
            console.log("暂无记录")
            return
          }
          for (const item of summary.sessions.slice(0, limit)) {
            console.log(`${item.sessionId}  ${item.agent}  ${item.count} 次  ${item.skills.join("、")}`)
          }
          return
        }
        if (by === "trigger") {
          printTriggers(events, options.skill, limit)
          return
        }
        printSkillSummary(events, limit)
        if (unused) console.log(`零使用技能：${unused.length > 0 ? unused.join("、") : "无"}`)
        if (!config.enabled) console.log("提示：技能使用情况当前处于关闭状态")
      })

    // 导出：CSV / JSON / JSONL
    usage
      .command("export")
      .description("导出事件（csv / json / jsonl）")
      .option("--type <format>", "导出格式：csv / json / jsonl（默认 json）")
      .option("--out <path>", "输出文件（缺省打印到 stdout）")
      .option("--since <value>", "起始时间")
      .option("--dir <path>", "本次使用的数据目录")
      .action((options: { type?: string; out?: string; since?: string; dir?: string }) => {
        const format = options.type ?? "json"
        if (!["csv", "json", "jsonl"].includes(format)) {
          console.error("⚠️ --type 取值须为 csv / json / jsonl")
          process.exitCode = 1
          return
        }
        const since = parseSinceOption(options.since)
        if (since === null) return
        const { paths } = createContext(options.dir)
        const events = filterEvents(readAllEvents(paths), { since })
        const content = format === "csv" ? eventsToCsv(events) : format === "jsonl" ? eventsToJsonl(events) : `${JSON.stringify({ schemaVersion: 1, events }, null, 2)}\n`
        if (!options.out) {
          process.stdout.write(content)
          return
        }
        const out = resolve(options.out)
        mkdirSync(dirname(out), { recursive: true })
        writeFileSync(out, content, "utf8")
        console.log(`已导出 ${events.length} 条 → ${out}`)
      })

    // 导入：JSON / JSONL / transcript；transcript 从 Claude 或通用会话记录提取 tool_use
    usage
      .command("import")
      .description("导入事件（json / jsonl / transcript）")
      .option("--type <format>", "导入格式：json / jsonl / transcript（默认 jsonl）")
      .option("--file <path>", "导入文件")
      .option("--agent <name>", "transcript 归属 Agent（默认 claude）")
      .option("--dir <path>", "本次使用的数据目录")
      .option("--dry-run", "只预览，不写入")
      .action((options: { type?: string; file?: string; agent?: string; dir?: string; dryRun?: boolean }) => {
        const format = options.type ?? "jsonl"
        if (!["json", "jsonl", "transcript"].includes(format)) {
          console.error("⚠️ --type 取值须为 json / jsonl / transcript")
          process.exitCode = 1
          return
        }
        if (!options.file) {
          console.error("⚠️ 缺少 --file")
          process.exitCode = 1
          return
        }
        const { config, paths } = createContext(options.dir)
        if (format === "transcript") {
          const file = resolve(options.file)
          if (!existsSync(file)) {
            console.error(`⚠️ 导入文件不存在：${file}`)
            process.exitCode = 1
            return
          }
          const parsed = parseTranscript(readFileSync(file, "utf8"), { agent: options.agent ?? "claude" })
          let written = 0
          let skipped = 0
          for (const event of parsed) {
            if (options.dryRun) {
              written += 1
              continue
            }
            const result = processHookEvent(event, config, paths)
            if (result.status === "written") written += 1
            else if (result.status !== "cached") skipped += 1
          }
          console.log(`${options.dryRun ? "预演" : "导入"}：${written} 条，跳过 ${skipped} 条`)
          return
        }
        const events = parseImportFile(resolve(options.file), format)
        if (!events) return
        let written = 0
        let duplicate = 0
        for (const event of events) {
          if (options.dryRun) {
            written += 1
            continue
          }
          const result = appendEvent(paths, event, config)
          if (result.written) written += 1
          else duplicate += 1
        }
        console.log(`${options.dryRun ? "预演" : "导入"}：${written} 条，重复 ${duplicate} 条`)
      })

    // 内部命令：消费队列并补齐明细，供后台 worker 与惰性兜底调用
    usage
      .command("flush", { hidden: true })
      .description("内部命令：消费上报队列并写入事件")
      .option("--dir <path>", "本次使用的数据目录")
      .option("--limit <count>", "单次处理的批次数")
      .action((options: { dir?: string; limit?: string }) => {
        const limit = options.limit === undefined ? undefined : Number(options.limit)
        try {
          flushQueue({
            dir: options.dir,
            maxBatches: Number.isInteger(limit) && (limit as number) > 0 ? limit : undefined,
          })
        } catch {
          // worker 失败保持静默，队列留给下次消费
        }
        process.exitCode = 0
      })

    // 规则上报：由全局规则在每批工具调用后合并调用；入队即返回，成功静默、失败也只走 stderr
    usage
      .command("record")
      .description("按全局规则上报一批技能调用（入队即返回，静默执行，失败不阻断任务）")
      .option(
        "--skill <names>",
        "技能名，可重复或用逗号分隔",
        (value: string, previous: string[] = []) => [...previous, ...splitNames(value)],
        [] as string[],
      )
      .option("--session <id>", "会话标识（缺省按环境变量或日期兜底）")
      .option("--dir <path>", "本次使用的数据目录")
      .action((options: { skill: string[]; session?: string; dir?: string }) => {
        try {
          recordSkills({ skills: options.skill ?? [], session: options.session, dir: options.dir })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          console.error(`⚠️ 技能使用上报失败（不影响当前任务）：${message}`)
        }
        // 无论成败都以 0 退出：规则路径不得阻断 Agent 的当前任务
        process.exitCode = 0
      })

    // 手工补录：没有 Hook 的 Agent 使用
    usage
      .command("log")
      .description("手工补录一次技能使用")
      .requiredOption("--skill <name>", "技能名")
      .requiredOption("--session <id>", "会话 id")
      .option("--agent <name>", "Agent 名（默认 manual）")
      .option("--tool-use <id>", "工具调用 id")
      .option("--prompt <text>", "触发词")
      .option("--args <text>", "技能参数")
      .option("--outcome <result>", "结果：success / failure / unknown")
      .option("--dir <path>", "本次使用的数据目录")
      .option("--dry-run", "只预览，不写入")
      .action((options: { skill: string; session: string; agent?: string; toolUse?: string; prompt?: string; args?: string; outcome?: string; dir?: string; dryRun?: boolean }) => {
        const { config, paths } = createContext(options.dir)
        if (!config.enabled) {
          console.error("⚠️ 技能使用情况未启用，未写入；先执行 toolkit usage enable")
          process.exitCode = 1
          return
        }
        const outcome = options.outcome === "success" || options.outcome === "failure" || options.outcome === "unknown" ? options.outcome : undefined
        if (options.outcome && !outcome) {
          console.error("⚠️ --outcome 取值须为 success / failure / unknown")
          process.exitCode = 1
          return
        }
        const event = buildEvent(
          {
            agent: options.agent ?? "manual",
            sessionId: options.session,
            toolUseId: options.toolUse,
            skill: options.skill,
            triggerPrompt: options.prompt,
            skillArgs: options.args,
            outcome,
            originAdapter: "manual",
          },
          config,
        )
        const meta = resolveSkillMeta(event.skill)
        if (!shouldRecord(config, event.agent, meta)) {
          console.error("⚠️ 该技能不在当前统计范围内，未写入")
          process.exitCode = 1
          return
        }
        if (options.dryRun) {
          console.log(JSON.stringify(event, null, 2))
          return
        }
        const result = appendEvent(paths, event, config)
        console.log(result.written ? `已补录 ${event.skill}` : "重复事件，未写入")
      })

    // 去重：压缩历史重复行并重建索引
    usage
      .command("dedupe")
      .description("压缩历史重复事件并重建索引")
      .option("--dir <path>", "本次使用的数据目录")
      .action((options: { dir?: string }) => {
        const { paths } = createContext(options.dir)
        const removed = dedupeStore(paths)
        console.log(`去重完成：删除 ${removed} 条重复记录`)
      })

    // 清理：按保留期或全部删除
    usage
      .command("purge")
      .description("清理本地事件（按保留期或全部）")
      .option("--older-than <duration>", "删除早于指定时长的记录，如 30d / 24h / 60m（缺省用配置保留期）")
      .option("--all", "删除全部事件")
      .option("--dry-run", "只预览将删除的记录数，不写盘")
      .option("--dir <path>", "本次使用的数据目录")
      .action((options: { olderThan?: string; all?: boolean; dryRun?: boolean; dir?: string }) => {
        const { config, paths } = createContext(options.dir)
        const days = options.olderThan !== undefined ? parseOlderThanDays(options.olderThan) : config.storage.retentionDays
        if (days === null) {
          console.error("⚠️ --older-than 取值须为 30d / 24h / 60m")
          process.exitCode = 1
          return
        }
        if (options.dryRun) {
          const events = readAllEvents(paths)
          const cutoff = Date.now() - days * 86_400_000
          const count = options.all ? events.length : events.filter((event) => new Date(event.occurredAt).getTime() < cutoff).length
          console.log(`[预演] 将删除 ${count} 条记录`)
          return
        }
        const removed = purgeEvents(paths, options.all ? { all: true } : { olderThanDays: days })
        console.log(options.all ? `已删除全部 ${removed} 条记录` : `已删除 ${removed} 条早于 ${options.olderThan} 的记录`)
      })

    // 诊断：目录、索引、重复与配置边界
    usage
      .command("doctor")
      .description("诊断技能使用情况目录、索引与重复事件")
      .option("--dir <path>", "本次使用的数据目录")
      .option("--format <format>", "输出格式（json）")
      .action((options: { dir?: string; format?: string }) => {
        if (!assertJsonFormat(options.format)) return
        const { config, dir, paths } = createContext(options.dir)
        // 诊断项：code 供脚本断言，level 区分必须处理与提示，message 保持人类可读
        const items: Array<{ code: string; level: "warn" | "info"; message: string }> = []
        const add = (code: string, level: "warn" | "info", message: string) => items.push({ code, level, message })
        if (!existsSync(dir)) add("data-dir-missing", "warn", `数据目录尚未创建：${dir}`)
        const events = readAllEvents(paths)
        const index = readIndex(paths)
        const unique = new Set(events.map((event) => event.eventId))
        const keyAgents = new Map<string, Set<string>>()
        for (const event of events) {
          if (!event.toolUseId) continue
          const key = `${event.sessionId}\u0000${event.toolUseId}`
          const agents = keyAgents.get(key) ?? new Set<string>()
          agents.add(event.agent)
          keyAgents.set(key, agents)
        }
        const crossAdapters = [...keyAgents.values()].filter((agents) => agents.size > 1).length
        if (index.eventIds.length !== unique.size) {
          add("index-mismatch", "warn", `索引与事件数不一致：索引 ${index.eventIds.length} / 去重后 ${unique.size}，可执行 rebuild`)
        }
        if (events.length !== unique.size) add("duplicate-events", "warn", `存在 ${events.length - unique.size} 条重复事件，可执行 dedupe`)
        if (crossAdapters > 0) add("cross-adapter-duplicates", "warn", `存在 ${crossAdapters} 组跨适配器重复调用，可执行 dedupe`)
        if (!config.enabled) add("disabled", "info", "技能使用情况总开关处于关闭状态")
        const installedHooks: string[] = []
        for (const adapter of AGENT_ADAPTERS) {
          try {
            const status = adapter.status()
            if (status.installed) installedHooks.push(adapter.id)
            if (status.legacyCommand) {
              add("hook-legacy", "warn", `${adapter.displayName} 的 Hook 仍指向旧命令 telemetry，已失效，请重跑 toolkit usage hooks install --agent ${adapter.id}`)
            }
            if (status.outdatedCommand) {
              add("hook-outdated", "warn", `${adapter.displayName} 的 Hook 命令平台形态已过期，在所在系统上无法执行，请重跑 toolkit usage hooks install --agent ${adapter.id}`)
            }
            if (status.missingPaths) {
              add("hook-path-missing", "warn", `${adapter.displayName} 的 Hook 命令路径已失效（${status.missingPaths.join("、")}），请重跑 toolkit usage hooks install --agent ${adapter.id}`)
            }
            for (const warning of status.warnings ?? []) add("adapter-warning", "warn", `${adapter.displayName}：${warning}`)
          } catch {
            // 配置读取失败由 usage hooks status 展示，doctor 不重复报错
          }
        }
        if (config.channel === "rule" && installedHooks.length > 0) {
          add("rule-channel-with-hooks", "warn", `采集通道为 rule，但本机仍有 Hook（${installedHooks.join("、")}）：执行 toolkit usage hooks remove 清理，避免重复采集`)
        }
        if (config.channel === "hook" && installedHooks.length === 0) {
          add("hook-channel-without-hooks", "warn", "采集通道为 hook，但未安装任何 Hook：执行 toolkit usage hooks install，或切换为 rule（toolkit usage channel rule）")
        }
        const report = { dataDir: dir, events: events.length, unique: unique.size, indexed: index.eventIds.length, crossAdapters, items }
        if (options.format === "json") {
          printJson(report)
          return
        }
        console.log(`数据目录：${dir}`)
        console.log(`事件：${events.length} 条 / 去重后 ${unique.size} 条 / 索引 ${index.eventIds.length} 条`)
        if (items.length === 0) console.log("未发现问题")
        else for (const item of items) console.log(`${item.level === "warn" ? "⚠️" : "ℹ️"} ${item.message}`)
      })

    // 规则文案：供用户复制到全局规则；配置不会统计任何技能时先提示空转
    usage
      .command("rule")
      .description("输出可复制的全局规则文案")
      .action(() => {
        const config = loadUsageConfig()
        if (!hasRecordableSkills(config)) {
          console.error("⚠️ 当前配置不会统计任何技能（总开关关闭 / 技能模式为 none / include 为空 / 来源全关），规则执行也不会产生记录")
        }
        try {
          console.log(usageGlobalRule())
        } catch (error) {
          console.error(`⚠️ ${(error as Error).message}`)
          process.exitCode = 1
        }
      })

    // 索引重建：doctor 提示后使用
    usage
      .command("rebuild")
      .description("从事件文件重建索引")
      .option("--dir <path>", "本次使用的数据目录")
      .action((options: { dir?: string }) => {
        const { paths } = createContext(options.dir)
        const count = rebuildIndex(paths)
        console.log(`索引已重建：${count} 条事件`)
      })
}
