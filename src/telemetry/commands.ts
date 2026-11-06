// 遥测 CLI：配置开关、统计查询、导出导入、初始化向导与 Hook 管理
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import type { Command } from "commander"
import { assertJsonFormat, toJsonText } from "../json-output"
import { redactText, resolveRedactEnabled } from "../privacy/redact"
import { resolveAdapters } from "./adapters"
import { ingestFromStdin, processHookEvent } from "./ingest"
import { parseTranscript } from "./transcript"
import { runUploadSetup, uploadOnce, uploadStatus } from "./upload"
import { installHooks, runTelemetryInitWizard, runTelemetryMenu } from "./wizard"
import { buildEvent, resolveSkillMeta } from "./event"
import { shouldRecord } from "./filter"
import { loadTelemetryConfig, resolveTelemetryDir, telemetryConfigPath, updateTelemetryConfig } from "./config"
import { TELEMETRY_GLOBAL_RULE } from "./rule"
import { eventsToCsv, eventsToJsonl, filterEvents, parseSince, summarize, unusedSkills } from "./stats"
import {
  appendEvent,
  dedupeStore,
  listEventFiles,
  purgeEvents,
  readAllEvents,
  readIndex,
  rebuildIndex,
  telemetryPaths,
} from "./store"
import type { SkillUsageEvent, TelemetryConfig, TelemetrySkillSource } from "./types"

// 合法来源枚举：CLI 过滤与导入校验共用
const SOURCE_VALUES: TelemetrySkillSource[] = ["toolkit-first-party", "toolkit-third-party", "unmanaged", "unknown"]

// 运行时上下文：配置、数据目录与路径集合一次算好，避免各命令重复解析
interface TelemetryContext {
  config: TelemetryConfig
  dir: string
  paths: ReturnType<typeof telemetryPaths>
}

// 取当前上下文：--dir 只影响本次运行，不写配置
function createContext(cliDir?: string): TelemetryContext {
  const config = loadTelemetryConfig()
  const dir = resolveTelemetryDir(cliDir, config)
  return { config, dir, paths: telemetryPaths(dir) }
}

// 打印 JSON：沿用仓库统一的 schemaVersion 锚点
function printJson(payload: object): void {
  console.log(toJsonText(payload))
}

// 解析 on/off：非法取值置退出码并返回 null
function parseOnOff(value: string | undefined, flag: string): boolean | null {
  if (value === undefined) return null
  if (value === "on" || value === "true") return true
  if (value === "off" || value === "false") return false
  console.error(`⚠️ ${flag} 取值须为 on 或 off`)
  process.exitCode = 1
  return null
}

// 解析来源过滤：非法取值置退出码并返回 null
function parseSource(value: string | undefined): TelemetrySkillSource | null {
  if (value === undefined) return null
  if ((SOURCE_VALUES as string[]).includes(value)) return value as TelemetrySkillSource
  console.error(`⚠️ --source 取值须为 ${SOURCE_VALUES.join(" / ")}`)
  process.exitCode = 1
  return null
}

// 解析 since：非法取值置退出码并返回 null
function parseSinceOption(value: string | undefined): Date | null | undefined {
  const parsed = parseSince(value)
  if (parsed === null) {
    console.error("⚠️ --since 取值须为 30d / 24h / 60m 或 YYYY-MM-DD")
    process.exitCode = 1
  }
  return parsed
}

// 逗号分隔的名单：去空、去重
function splitNames(value: string | undefined): string[] {
  if (!value) return []
  return [...new Set(value.split(/[,，]/).map((item) => item.trim()).filter(Boolean))]
}

// 打印配置当前值：无参数时供各子命令回显
function printConfig(config: TelemetryConfig, dir: string): void {
  console.log(`遥测：${config.enabled ? "已开启" : "已关闭"}`)
  console.log(`配置：${telemetryConfigPath()}`)
  console.log(`数据目录：${dir}`)
  const agents = Object.entries(config.agents).filter(([, enabled]) => enabled).map(([name]) => name)
  console.log(`Agent：${agents.length > 0 ? agents.join("、") : "未开启"}`)
  console.log(
    `来源：一方 ${config.sources.firstParty ? "开" : "关"} / 第三方 ${config.sources.thirdParty ? "开" : "关"} / 未托管 ${config.sources.unmanaged ? "开" : "关"}`,
  )
  console.log(`技能模式：${config.skills.mode}`)
  console.log(
    `字段：触发词 ${config.capture.triggerPrompt ? "开" : "关"} / 参数 ${config.capture.skillArgs ? "开" : "关"} / 结果 ${config.capture.outcome ? "开" : "关"}`,
  )
  console.log(`存储：${config.storage.rotation} / 保留 ${config.storage.retentionDays} 天 / 单文件 ${config.storage.maxFileBytes} 字节`)
  console.log(`上传：${config.upload.enabled ? "已开启" : "已关闭"}`)
}

// 打印技能统计：按次数降序，最多显示 limit 条
function printSkillSummary(events: SkillUsageEvent[], limit = 20): void {
  const summary = summarize(events)
  console.log(`技能使用统计：共 ${summary.total} 条`)
  if (summary.bySkill.length === 0) {
    console.log("暂无记录")
    return
  }
  for (const item of summary.bySkill.slice(0, limit)) {
    console.log(`  ${item.skill}  ${item.count} 次 / ${item.sessions} 会话  ${item.source}`)
  }
}

// 打印触发词：默认脱敏，避免终端泄露敏感信息
function printTriggers(events: SkillUsageEvent[], skill: string | undefined, limit: number): void {
  const summary = summarize(events)
  const rows = skill ? summary.triggers.filter((item) => item.skills.includes(skill)) : summary.triggers
  if (rows.length === 0) {
    console.log("暂无触发词记录（触发词采集默认关闭，可用 capture --trigger on 开启）")
    return
  }
  const redact = resolveRedactEnabled(undefined)
  for (const item of rows.slice(0, limit)) {
    console.log(`  ${item.count} 次｜${redactText(item.prompt, redact)}｜${item.skills.join("、")}`)
  }
}

// 导入事件归一：补齐缺省字段，拒绝缺少必要标识的记录
function normalizeImportedEvent(raw: unknown): SkillUsageEvent | null {
  if (typeof raw !== "object" || raw === null) return null
  const item = raw as Partial<SkillUsageEvent>
  if (typeof item.eventId !== "string" || typeof item.skill !== "string" || typeof item.agent !== "string") return null
  if (typeof item.sessionId !== "string" || typeof item.occurredAt !== "string") return null
  const meta = resolveSkillMeta(item.skill)
  const source = SOURCE_VALUES.includes(item.skillSource as TelemetrySkillSource)
    ? (item.skillSource as TelemetrySkillSource)
    : meta.source
  const event: SkillUsageEvent = {
    schemaVersion: 1,
    eventId: item.eventId,
    occurredAt: item.occurredAt,
    agent: item.agent,
    sessionId: item.sessionId,
    skill: item.skill,
    skillSource: source,
    managedBy: item.managedBy ?? (source === "unmanaged" ? "unknown" : "toolkit"),
    originAdapter: item.originAdapter ?? "import",
    toolkitVersion: item.toolkitVersion ?? "unknown",
  }
  if (item.toolUseId) event.toolUseId = item.toolUseId
  if (item.project) event.project = item.project
  if (item.skillVersion) event.skillVersion = item.skillVersion
  if (item.triggerPrompt) event.triggerPrompt = item.triggerPrompt
  if (item.skillArgs) event.skillArgs = item.skillArgs
  if (item.outcome) event.outcome = item.outcome
  if (item.durationMs !== undefined) event.durationMs = item.durationMs
  return event
}

// 解析导入文件：JSON 数组 / { events } 与 JSONL 两种形态
function parseImportFile(file: string, format: string): SkillUsageEvent[] | null {
  if (!existsSync(file)) {
    console.error(`⚠️ 导入文件不存在：${file}`)
    process.exitCode = 1
    return null
  }
  const content = readFileSync(file, "utf8")
  const rawItems: unknown[] = []
  if (format === "jsonl") {
    for (const line of content.split(/\r?\n/)) {
      const text = line.trim()
      if (!text) continue
      try {
        rawItems.push(JSON.parse(text))
      } catch {
        console.warn(`⚠️ 跳过无法解析的行：${text.slice(0, 80)}`)
      }
    }
  } else {
    try {
      const parsed: unknown = JSON.parse(content)
      if (Array.isArray(parsed)) rawItems.push(...parsed)
      else if (typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { events?: unknown[] }).events)) {
        rawItems.push(...((parsed as { events: unknown[] }).events))
      } else {
        console.error("⚠️ JSON 导入文件须为事件数组或 { events: [...] }")
        process.exitCode = 1
        return null
      }
    } catch {
      console.error("⚠️ JSON 导入文件解析失败")
      process.exitCode = 1
      return null
    }
  }
  const events: SkillUsageEvent[] = []
  for (const raw of rawItems) {
    const event = normalizeImportedEvent(raw)
    if (event) events.push(event)
    else console.warn("⚠️ 跳过缺少必要字段的事件记录")
  }
  return events
}

// 注册 telemetry 命令域：所有子命令默认只读或显式写全局配置
export function registerTelemetryCommands(program: Command): void {
  const telemetry = program
    .command("telemetry")
    .description("技能使用遥测：本地统计、开关与导出（默认关闭，数据只留在本机）")

  // 无参数：进入交互菜单；非 TTY 打印帮助并以退出码 2 结束
  telemetry.action(async () => {
    await runTelemetryMenu()
  })

  // 初始化向导：默认保持关闭，所有选择都有默认值
  telemetry
    .command("init")
    .description("初始化遥测：选择 Agent、来源、字段与存储（默认保持关闭）")
    .action(async () => {
      await runTelemetryInitWizard()
    })

  // Hook 内部入口：从 stdin 读取事件；stdout 保持为空，避免干扰 Agent
  telemetry
    .command("ingest")
    .description("内部命令：从 stdin 读取 Hook 事件")
    .requiredOption("--agent <id>", "Agent 适配器 id")
    .action(async (options: { agent: string }) => {
      await ingestFromStdin(options.agent)
      process.exitCode = 0
    })

  // Hook 管理：安装 / 状态 / 卸载
  const hooks = telemetry
    .command("hooks")
    .description("管理 Agent Hook（安装 / 状态 / 卸载）")

  hooks
    .command("install")
    .description("安装 Hook（只写配置，不开启采集）")
    .option("--agent <names>", "只处理指定 Agent（逗号分隔）")
    .option("--dry-run", "只预览，不写文件")
    .action((options: { agent?: string; dryRun?: boolean }) => {
      const { adapters, invalid } = resolveAdapters(splitNames(options.agent))
      if (invalid.length > 0) {
        console.error(`⚠️ 未知 Agent：${invalid.join("、")}`)
        process.exitCode = 1
        return
      }
      if (adapters.length === 0) {
        console.error("⚠️ 未检测到可接入的 Agent，可用 --agent 显式指定")
        process.exitCode = 1
        return
      }
      installHooks(adapters, Boolean(options.dryRun))
      console.log("Hook 安装不等于开启采集；用 toolkit telemetry enable 打开总开关")
    })

  hooks
    .command("status")
    .description("查看 Hook 安装状态")
    .option("--agent <names>", "只查看指定 Agent（逗号分隔）")
    .action((options: { agent?: string }) => {
      const { adapters, invalid } = resolveAdapters(splitNames(options.agent))
      if (invalid.length > 0) {
        console.error(`⚠️ 未知 Agent：${invalid.join("、")}`)
        process.exitCode = 1
        return
      }
      if (adapters.length === 0) {
        console.log("未检测到可接入的 Agent")
        return
      }
      for (const adapter of adapters) {
        const status = adapter.status()
        console.log(`${adapter.displayName}：${status.installed ? "已安装" : "未安装"}｜${status.file}`)
        if (status.command) console.log(`  命令：${status.command}`)
        if (status.lastError) console.log(`  ⚠️ ${status.lastError}`)
      }
    })

  hooks
    .command("uninstall")
    .description("卸载 Hook（只移除本包命令，不影响其它 Hook）")
    .option("--agent <names>", "只处理指定 Agent（逗号分隔）")
    .action((options: { agent?: string }) => {
      const { adapters, invalid } = resolveAdapters(splitNames(options.agent))
      if (invalid.length > 0) {
        console.error(`⚠️ 未知 Agent：${invalid.join("、")}`)
        process.exitCode = 1
        return
      }
      for (const adapter of adapters) {
        const result = adapter.uninstallHooks()
        console.log(`${adapter.displayName}：${result.changed ? "已移除 Hook" : "未发现本包 Hook"}｜${result.file}`)
      }
    })

  // 状态：配置、目录与事件计数
  telemetry
    .command("status")
    .description("查看遥测状态：开关、数据目录与事件计数")
    .option("--dir <path>", "本次使用的数据目录")
    .option("--format <format>", "输出格式（json）")
    .action((options: { dir?: string; format?: string }) => {
      if (!assertJsonFormat(options.format)) return
      const { config, dir, paths } = createContext(options.dir)
      const index = readIndex(paths)
      const files = listEventFiles(paths)
      const events = readAllEvents(paths)
      const last = events.reduce<string | undefined>((acc, event) => (!acc || event.occurredAt > acc ? event.occurredAt : acc), undefined)
      const report = {
        enabled: config.enabled,
        configFile: telemetryConfigPath(),
        dataDir: dir,
        eventFiles: files.length,
        events: events.length,
        indexed: index.eventIds.length,
        lastEventAt: last ?? null,
      }
      if (options.format === "json") {
        printJson(report)
        return
      }
      printConfig(config, dir)
      console.log(`事件：${report.events} 条（索引 ${report.indexed} 条，文件 ${report.eventFiles} 个）`)
      console.log(`最近：${report.lastEventAt ?? "暂无"}`)
    })

  // 总开关：开启前必须已有 Agent 与来源配置，否则记录仍为零
  telemetry
    .command("enable")
    .description("开启遥测总开关（仍需配置 Agent、来源与技能范围）")
    .action(() => {
      updateTelemetryConfig({ enabled: true })
      console.log("遥测已开启；用 telemetry sources / skills / hooks 配置采集范围")
    })

  telemetry
    .command("disable")
    .description("关闭遥测总开关（已记录数据保留）")
    .action(() => {
      updateTelemetryConfig({ enabled: false })
      console.log("遥测已关闭")
    })

  // 来源开关：一方 / 第三方 / 未托管分别独立
  telemetry
    .command("sources")
    .description("查看或设置来源开关（first-party / third-party / unmanaged）")
    .option("--first-party <state>", "一方技能开关（on / off）")
    .option("--third-party <state>", "第三方技能开关（on / off）")
    .option("--unmanaged <state>", "未托管技能开关（on / off）")
    .option("--format <format>", "输出格式（json）")
    .action((options: { firstParty?: string; thirdParty?: string; unmanaged?: string; format?: string }) => {
      if (!assertJsonFormat(options.format)) return
      const first = parseOnOff(options.firstParty, "--first-party")
      const third = parseOnOff(options.thirdParty, "--third-party")
      const unmanaged = parseOnOff(options.unmanaged, "--unmanaged")
      if (first === null && options.firstParty !== undefined) return
      if (third === null && options.thirdParty !== undefined) return
      if (unmanaged === null && options.unmanaged !== undefined) return
      const patch: Record<string, unknown> = {}
      if (first !== null) patch.firstParty = first
      if (third !== null) patch.thirdParty = third
      if (unmanaged !== null) patch.unmanaged = unmanaged
      if (Object.keys(patch).length > 0) updateTelemetryConfig({ sources: patch })
      const { config, dir } = createContext()
      if (options.format === "json") printJson({ sources: config.sources })
      else printConfig(config, dir)
    })

  // 技能范围：none / all / include / exclude
  telemetry
    .command("skills")
    .description("查看或设置技能统计范围（none / all / include / exclude）")
    .option("--mode <mode>", "统计模式：none / all / include / exclude")
    .option("--add <names>", "加入 include / exclude 名单（逗号分隔）")
    .option("--remove <names>", "从 include / exclude 名单移除（逗号分隔）")
    .option("--format <format>", "输出格式（json）")
    .action((options: { mode?: string; add?: string; remove?: string; format?: string }) => {
      if (!assertJsonFormat(options.format)) return
      const config = loadTelemetryConfig()
      const mode = options.mode ?? config.skills.mode
      if (!["none", "all", "include", "exclude"].includes(mode)) {
        console.error("⚠️ --mode 取值须为 none / all / include / exclude")
        process.exitCode = 1
        return
      }
      const add = splitNames(options.add)
      const remove = new Set(splitNames(options.remove))
      const base = mode === "exclude" ? config.skills.exclude : config.skills.include
      const list = [...new Set([...base.filter((name) => !remove.has(name)), ...add])].sort()
      if (options.mode !== undefined || options.add !== undefined || options.remove !== undefined) {
        updateTelemetryConfig({ skills: mode === "exclude" ? { mode, exclude: list } : { mode, include: list } })
      }
      const next = loadTelemetryConfig()
      if (options.format === "json") printJson({ skills: next.skills })
      else {
        const names = next.skills.mode === "exclude" ? next.skills.exclude : next.skills.include
        console.log(`技能模式：${next.skills.mode}；名单：${names.join("、") || "空"}`)
      }
    })

  // 字段开关：触发词 / 参数 / 结果默认全部关闭
  telemetry
    .command("capture")
    .description("查看或设置采集字段（trigger / args / outcome）")
    .option("--trigger <state>", "触发词采集（on / off）")
    .option("--args <state>", "技能参数采集（on / off）")
    .option("--outcome <state>", "执行结果采集（on / off）")
    .option("--format <format>", "输出格式（json）")
    .action((options: { trigger?: string; args?: string; outcome?: string; format?: string }) => {
      if (!assertJsonFormat(options.format)) return
      const trigger = parseOnOff(options.trigger, "--trigger")
      const args = parseOnOff(options.args, "--args")
      const outcome = parseOnOff(options.outcome, "--outcome")
      if (trigger === null && options.trigger !== undefined) return
      if (args === null && options.args !== undefined) return
      if (outcome === null && options.outcome !== undefined) return
      const patch: Record<string, unknown> = {}
      if (trigger !== null) patch.triggerPrompt = trigger
      if (args !== null) patch.skillArgs = args
      if (outcome !== null) patch.outcome = outcome
      if (Object.keys(patch).length > 0) updateTelemetryConfig({ capture: patch })
      const config = loadTelemetryConfig()
      if (options.format === "json") printJson({ capture: config.capture })
      else console.log(`触发词：${config.capture.triggerPrompt ? "开" : "关"}；参数：${config.capture.skillArgs ? "开" : "关"}；结果：${config.capture.outcome ? "开" : "关"}`)
    })

  // 存储：目录 / 轮转 / 保留期 / 单文件上限
  telemetry
    .command("storage")
    .description("查看或设置本地存储（目录 / 轮转 / 保留期 / 单文件上限）")
    .option("--dir <path>", "数据目录")
    .option("--rotation <mode>", "轮转：monthly / size / none")
    .option("--retention <days>", "保留天数")
    .option("--max-size <bytes>", "单文件大小上限（字节）")
    .option("--format <format>", "输出格式（json）")
    .action((options: { dir?: string; rotation?: string; retention?: string; maxSize?: string; format?: string }) => {
      if (!assertJsonFormat(options.format)) return
      const patch: Record<string, unknown> = {}
      if (options.dir !== undefined) patch.dir = resolve(options.dir)
      if (options.rotation !== undefined) {
        if (!["monthly", "size", "none"].includes(options.rotation)) {
          console.error("⚠️ --rotation 取值须为 monthly / size / none")
          process.exitCode = 1
          return
        }
        patch.rotation = options.rotation
      }
      if (options.retention !== undefined) {
        const days = Number(options.retention)
        if (!Number.isInteger(days) || days <= 0) {
          console.error("⚠️ --retention 须为正整数")
          process.exitCode = 1
          return
        }
        patch.retentionDays = days
      }
      if (options.maxSize !== undefined) {
        const bytes = Number(options.maxSize)
        if (!Number.isInteger(bytes) || bytes <= 0) {
          console.error("⚠️ --max-size 须为正整数")
          process.exitCode = 1
          return
        }
        patch.maxFileBytes = bytes
      }
      if (Object.keys(patch).length > 0) updateTelemetryConfig({ storage: patch })
      const config = loadTelemetryConfig()
      if (options.format === "json") printJson({ storage: config.storage })
      else printConfig(config, resolveTelemetryDir(undefined, config))
    })

  // 可选上传：默认关闭；配置向导、状态与手工发送
  const upload = telemetry.command("upload").description("可选上传（默认关闭；需显式配置端点）")
  upload
    .command("setup")
    .description("上传配置向导：协议、端点、请求头与启用确认")
    .action(async () => {
      await runUploadSetup()
    })
  upload
    .command("status")
    .description("查看上传开关、端点与待上传数量")
    .option("--format <format>", "输出格式（json）")
    .action((options: { format?: string }) => {
      if (!assertJsonFormat(options.format)) return
      const report = uploadStatus()
      if (options.format === "json") printJson(report)
      else {
        console.log(`上传：${report.enabled ? "已开启" : "已关闭"}`)
        console.log(`协议：${report.protocol}｜端点：${report.endpoint || "未配置"}`)
        console.log(`已发送：${report.sent} 条｜待上传：${report.pending} 条`)
      }
    })
  upload
    .option("--dry-run", "只预览批次与载荷，不发送")
    .option("--once", "手工发送一批")
    .option("--limit <count>", "单批条数（默认取配置 batchSize）")
    .action(async (options: { dryRun?: boolean; once?: boolean; limit?: string }) => {
      if (!options.dryRun && !options.once) {
        const report = uploadStatus()
        console.log(`上传：${report.enabled ? "已开启" : "已关闭"}；待上传 ${report.pending} 条`)
        console.log("使用 upload --dry-run 预览，upload --once 发送，upload setup 配置")
        return
      }
      let limit: number | undefined
      if (options.limit !== undefined) {
        limit = Number(options.limit)
        if (!Number.isInteger(limit) || limit <= 0) {
          console.error("⚠️ --limit 须为正整数")
          process.exitCode = 1
          return
        }
      }
      try {
        const result = await uploadOnce({ dryRun: Boolean(options.dryRun), limit })
        if (result.dryRun) {
          console.log(`预演：待上传 ${result.pending} 条 → ${result.endpoint}`)
          const preview = result.preview as { events?: unknown[] }
          if (Array.isArray(preview.events) && preview.events[0]) console.log(JSON.stringify(preview.events[0], null, 2))
        } else {
          console.log(`已上传 ${result.sent} 条，剩余 ${result.pending} 条`)
        }
      } catch (error) {
        console.error(`⚠️ ${(error as Error).message}`)
        process.exitCode = 1
      }
    })

  // 统计：按技能 / Agent / 来源聚合
  telemetry
    .command("stats")
    .description("技能使用统计（默认全部事件）")
    .option("--since <value>", "起始时间：30d / 24h / 60m / YYYY-MM-DD")
    .option("--agent <name>", "按 Agent 过滤")
    .option("--source <source>", "按来源过滤：toolkit-first-party / toolkit-third-party / unmanaged / unknown")
    .option("--skill <name>", "按技能过滤")
    .option("--unused", "列出零使用技能")
    .option("--dir <path>", "本次使用的数据目录")
    .option("--format <format>", "输出格式（json）")
    .action((options: { since?: string; agent?: string; source?: string; skill?: string; unused?: boolean; dir?: string; format?: string }) => {
      if (!assertJsonFormat(options.format)) return
      const since = parseSinceOption(options.since)
      if (since === null) return
      const source = parseSource(options.source)
      if (source === null && options.source !== undefined) return
      const { config, dir, paths } = createContext(options.dir)
      const all = readAllEvents(paths)
      const events = filterEvents(all, { since, agent: options.agent, source: source ?? undefined, skill: options.skill })
      const summary = summarize(events)
      const unused = options.unused ? unusedSkills(all) : undefined
      if (options.format === "json") {
        printJson({ ...summary, unused, dataDir: dir })
        return
      }
      printSkillSummary(events)
      if (unused) console.log(`零使用技能：${unused.length > 0 ? unused.join("、") : "无"}`)
      if (!config.enabled) console.log("提示：遥测当前处于关闭状态")
    })

  // Top：只输出技能排行
  telemetry
    .command("top")
    .description("按使用次数列出技能排行")
    .option("--limit <count>", "显示条数（默认 10）")
    .option("--since <value>", "起始时间")
    .option("--dir <path>", "本次使用的数据目录")
    .action((options: { limit?: string; since?: string; dir?: string }) => {
      const since = parseSinceOption(options.since)
      if (since === null) return
      const limit = Number(options.limit ?? 10)
      if (!Number.isInteger(limit) || limit <= 0) {
        console.error("⚠️ --limit 须为正整数")
        process.exitCode = 1
        return
      }
      const { paths } = createContext(options.dir)
      const events = filterEvents(readAllEvents(paths), { since })
      const summary = summarize(events)
      summary.bySkill.slice(0, limit).forEach((item, index) => {
        console.log(`${index + 1}. ${item.skill}  ${item.count} 次 / ${item.sessions} 会话`)
      })
      if (summary.bySkill.length === 0) console.log("暂无记录")
    })

  // 会话：列出使用技能的会话
  telemetry
    .command("sessions")
    .description("按会话列出技能使用情况")
    .option("--since <value>", "起始时间")
    .option("--limit <count>", "显示条数（默认 20）")
    .option("--dir <path>", "本次使用的数据目录")
    .action((options: { since?: string; limit?: string; dir?: string }) => {
      const since = parseSinceOption(options.since)
      if (since === null) return
      const limit = Number(options.limit ?? 20)
      if (!Number.isInteger(limit) || limit <= 0) {
        console.error("⚠️ --limit 须为正整数")
        process.exitCode = 1
        return
      }
      const { paths } = createContext(options.dir)
      const summary = summarize(filterEvents(readAllEvents(paths), { since }))
      if (summary.sessions.length === 0) {
        console.log("暂无记录")
        return
      }
      for (const item of summary.sessions.slice(0, limit)) {
        console.log(`${item.sessionId}  ${item.agent}  ${item.count} 次  ${item.skills.join("、")}`)
      }
    })

  // 触发词：默认脱敏展示
  telemetry
    .command("triggers")
    .description("按触发词查看技能使用（需开启 capture.triggerPrompt）")
    .option("--skill <name>", "按技能过滤")
    .option("--limit <count>", "显示条数（默认 20）")
    .option("--since <value>", "起始时间")
    .option("--dir <path>", "本次使用的数据目录")
    .action((options: { skill?: string; limit?: string; since?: string; dir?: string }) => {
      const since = parseSinceOption(options.since)
      if (since === null) return
      const limit = Number(options.limit ?? 20)
      if (!Number.isInteger(limit) || limit <= 0) {
        console.error("⚠️ --limit 须为正整数")
        process.exitCode = 1
        return
      }
      const { paths } = createContext(options.dir)
      printTriggers(filterEvents(readAllEvents(paths), { since, skill: options.skill }), options.skill, limit)
    })

  // 导出：CSV / JSON / JSONL
  telemetry
    .command("export")
    .description("导出事件（csv / json / jsonl）")
    .option("--format <format>", "导出格式：csv / json / jsonl（默认 json）")
    .option("--out <path>", "输出文件（缺省打印到 stdout）")
    .option("--since <value>", "起始时间")
    .option("--dir <path>", "本次使用的数据目录")
    .action((options: { format?: string; out?: string; since?: string; dir?: string }) => {
      const format = options.format ?? "json"
      if (!["csv", "json", "jsonl"].includes(format)) {
        console.error("⚠️ --format 取值须为 csv / json / jsonl")
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
  telemetry
    .command("import")
    .description("导入事件（json / jsonl / transcript）")
    .option("--format <format>", "导入格式：json / jsonl / transcript（默认 jsonl）")
    .option("--file <path>", "导入文件")
    .option("--agent <name>", "transcript 归属 Agent（默认 claude）")
    .option("--dir <path>", "本次使用的数据目录")
    .option("--dry-run", "只预览，不写入")
    .action((options: { format?: string; file?: string; agent?: string; dir?: string; dryRun?: boolean }) => {
      const format = options.format ?? "jsonl"
      if (!["json", "jsonl", "transcript"].includes(format)) {
        console.error("⚠️ --format 取值须为 json / jsonl / transcript")
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

  // 手工补录：没有 Hook 的 Agent 使用
  telemetry
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
        console.error("⚠️ 遥测未启用，未写入；先执行 toolkit telemetry enable")
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
  telemetry
    .command("dedupe")
    .description("压缩历史重复事件并重建索引")
    .option("--dir <path>", "本次使用的数据目录")
    .action((options: { dir?: string }) => {
      const { paths } = createContext(options.dir)
      const removed = dedupeStore(paths)
      console.log(`去重完成：删除 ${removed} 条重复记录`)
    })

  // 清理：按保留期或全部删除
  telemetry
    .command("purge")
    .description("清理本地事件（按保留期或全部）")
    .option("--older-than <days>", "删除早于指定天数的记录（缺省用配置保留期）")
    .option("--all", "删除全部事件")
    .option("--dir <path>", "本次使用的数据目录")
    .action((options: { olderThan?: string; all?: boolean; dir?: string }) => {
      const { config, paths } = createContext(options.dir)
      if (!options.all && options.olderThan !== undefined) {
        const days = Number(options.olderThan)
        if (!Number.isInteger(days) || days <= 0) {
          console.error("⚠️ --older-than 须为正整数")
          process.exitCode = 1
          return
        }
      }
      const days = options.olderThan !== undefined ? Number(options.olderThan) : config.storage.retentionDays
      const removed = purgeEvents(paths, options.all ? { all: true } : { olderThanDays: days })
      console.log(options.all ? `已删除全部 ${removed} 条记录` : `已删除 ${removed} 条早于 ${days} 天的记录`)
    })

  // 诊断：目录、索引、重复与配置边界
  telemetry
    .command("doctor")
    .description("诊断遥测目录、索引与重复事件")
    .option("--dir <path>", "本次使用的数据目录")
    .option("--format <format>", "输出格式（json）")
    .action((options: { dir?: string; format?: string }) => {
      if (!assertJsonFormat(options.format)) return
      const { config, dir, paths } = createContext(options.dir)
      const issues: string[] = []
      if (!existsSync(dir)) issues.push(`数据目录尚未创建：${dir}`)
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
        issues.push(`索引与事件数不一致：索引 ${index.eventIds.length} / 去重后 ${unique.size}，可执行 rebuild`)
      }
      if (events.length !== unique.size) issues.push(`存在 ${events.length - unique.size} 条重复事件，可执行 dedupe`)
      if (crossAdapters > 0) issues.push(`存在 ${crossAdapters} 组跨适配器重复调用，可执行 dedupe`)
      if (!config.enabled) issues.push("遥测总开关处于关闭状态")
      const report = { dataDir: dir, events: events.length, unique: unique.size, indexed: index.eventIds.length, crossAdapters, issues }
      if (options.format === "json") {
        printJson(report)
        return
      }
      console.log(`数据目录：${dir}`)
      console.log(`事件：${events.length} 条 / 去重后 ${unique.size} 条 / 索引 ${index.eventIds.length} 条`)
      if (issues.length === 0) console.log("未发现问题")
      else for (const issue of issues) console.log(`⚠️ ${issue}`)
    })

  // 规则文案：供用户复制到全局规则
  telemetry
    .command("rule")
    .description("输出可复制的全局规则文案")
    .argument("[action]", "动作：print", "print")
    .action((action: string) => {
      if (action !== "print") {
        console.error("⚠️ 仅支持 telemetry rule print")
        process.exitCode = 1
        return
      }
      console.log(TELEMETRY_GLOBAL_RULE)
    })

  // 索引重建：doctor 提示后使用
  telemetry
    .command("rebuild")
    .description("从事件文件重建索引")
    .option("--dir <path>", "本次使用的数据目录")
    .action((options: { dir?: string }) => {
      const { paths } = createContext(options.dir)
      const count = rebuildIndex(paths)
      console.log(`索引已重建：${count} 条事件`)
    })
}
