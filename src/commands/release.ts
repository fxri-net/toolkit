// changelog 命令：多语言 CHANGELOG 的注册入口、changesets 透传与打印
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import { join } from "node:path"
import type { Command } from "commander"
import { DEFAULT_LANG, resolveLang, type ChangelogLanguage } from "../changelog/languages"
import { countUntypedEntries, formatChangelogs, localDate } from "../changelog/format"
import type { CollectOptions } from "../changelog/collect"
import { auditChangesets, formatAuditReport, formatChangesetSummaries, readChangesetSummaries } from "../changelog/audit"
import { checkDoc, resolveDocOptions, syncDoc, syncDocAfterVersion } from "../changelog/doc"
import { childExitCode, EXIT } from "../exit-codes"
import { resolveRedactEnabled } from "../privacy/redact"
import { resolveEnabled } from "../switch"
import { listTaskFiles } from "../tasks/scan"
import { getCheckWarnings, printJson, resolveLanguages } from "./shared"
import { assertJsonFormat, jsonEnvelope } from "../json-output"
import { line, style } from "../term-style"
import { ENV_CHECK_WARN } from "../env"

const require = createRequire(import.meta.url)
// 解析 @changesets/cli 的 bin 绝对路径（pnpm 下 bin 不提升到使用方，需显式定位）
// 该解析要遍历 node_modules 并取真实路径，实测约 90ms；只有透传子命令需要，故延迟到首次执行时并缓存
let changesetBin: string | null = null
function resolveChangesetBin(): string {
  if (changesetBin === null) changesetBin = require.resolve("@changesets/cli/bin.js")
  return changesetBin
}

// 调用 changesets（子进程执行，继承 stdio）：退出码原样透出，子进程被信号终止时按 128 + 信号编号
const runChangeset = (cmd: string[]) => {
  const res = spawnSync(process.execPath, [resolveChangesetBin(), ...cmd], { stdio: "inherit" })
  const code = childExitCode(res)
  if (code !== EXIT.OK) process.exit(code)
}

// 检测 active 是否有未归档任务
function hasActiveTasks(dir = ".tasks"): boolean {
  return listTaskFiles(join(dir, "active")).length > 0
}

// changelog 软告警：提示缺类型前缀的变更集条目（须在归类前取数，归类后前缀缺失信息即丢失）
// 传全部配置语言，前缀识别与 tasks check 侧 changesetPrefixIssues 同一并集口径
function warnUntypedEntries(langs: ChangelogLanguage[], collect: CollectOptions) {
  const count = countUntypedEntries(".", langs, collect)
  if (count > 0) {
    console.warn(`⚠️ ${count} 条变更集条目缺类型前缀，建议按「类型：描述」撰写`)
  }
}

// 把逗号分隔的目录列表解析为数组：空值与空白项丢弃，保持用户书写顺序
function splitDirs(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

// 注册 changelog 命令：装配点只负责按序调用
export function registerChangelogCommands(program: Command): void {
  // changelog 域：doc / version / format / audit 自处理，其余子命令透传给 changesets

  // 语言与开关选项：自处理子命令共用
  interface ChangelogOptions {
    lang?: string
    redact?: boolean
    warn?: boolean
  }

  // 自处理子命令公共选项
  function addChangelogCommonOptions(command: Command): Command {
    return command
      .option("--lang <lang>", "语言（内置 zh/en，可配置扩展）", DEFAULT_LANG)
      .option("--redact", "开启隐私脱敏")
      .option("--no-redact", "关闭隐私脱敏")
      .option("--warn", "开启软告警")
      .option("--no-warn", "关闭软告警")
  }

  // 解析语言与开关：未知语言回落默认并告警
  function resolveChangelogContext(options: ChangelogOptions): {
    merged: ReturnType<typeof resolveLanguages>
    lang: ChangelogLanguage
    docLang: string
    redact: boolean
    warn: boolean
  } {
    const merged = resolveLanguages()
    const { lang, unknown } = resolveLang(merged, options.lang ?? DEFAULT_LANG, DEFAULT_LANG)
    if (unknown) console.warn(`⚠️ 未知语言「${unknown}」，已回落 ${DEFAULT_LANG}`)
    return {
      merged,
      lang,
      docLang: unknown ? DEFAULT_LANG : (options.lang ?? DEFAULT_LANG),
      redact: resolveRedactEnabled(options.redact),
      warn: resolveEnabled(options.warn, ENV_CHECK_WARN, getCheckWarnings(), true),
    }
  }

  // 版本：消费变更集 → 归类格式化 → 同步文档镜像
  function runChangelogBump(options: ChangelogOptions & { history?: boolean; syncDoc?: boolean; exclude?: string; include?: string }): void {
    const ctx = resolveChangelogContext(options)
    const collect: CollectOptions = { exclude: splitDirs(options.exclude), include: splitDirs(options.include) }
    // 软告警：发版前存在未归档任务
    if (ctx.warn && hasActiveTasks()) {
      console.warn("⚠️ 存在未归档的 active 任务，建议先归档再发版")
    }
    runChangeset(["version"])
    // 软告警须前置于归类（须待 changesets 写入新块后再取数，否则无英文源标题块可扫）；
    // 归类后无前缀条目即并入兜底组，前缀缺失无从统计
    if (ctx.warn) warnUntypedEntries(Object.values(ctx.merged), collect)
    formatChangelogs(".", localDate(), ctx.lang, ctx.redact, Boolean(options.history), collect)
    // 发版后自动同步文档站镜像：失败只告警，不阻断发版（镜像不是发版必需产物）
    if (options.syncDoc !== false) syncDocAfterVersion(ctx.docLang)
  }

  // 格式化：按语言与类型归类重排，不消费变更集
  function runChangelogRewrite(options: ChangelogOptions & { history?: boolean; exclude?: string; include?: string }): void {
    const ctx = resolveChangelogContext(options)
    const collect: CollectOptions = { exclude: splitDirs(options.exclude), include: splitDirs(options.include) }
    if (ctx.warn) warnUntypedEntries(Object.values(ctx.merged), collect)
    formatChangelogs(".", localDate(), ctx.lang, ctx.redact, Boolean(options.history), collect)
  }

  // 文档镜像：默认从根 CHANGELOG.md 生成；--check 逐页比对，--dry-run 只列清单不写盘
  function runChangelogMirror(
    options: ChangelogOptions & {
      check?: boolean
      dryRun?: boolean
      from?: string
      to?: string
      title?: string
      outline?: string
      frontmatter?: boolean
    },
  ): void {
    const ctx = resolveChangelogContext(options)
    try {
      const docOptions = resolveDocOptions({
        from: options.from,
        to: options.to,
        title: options.title,
        outline: options.outline,
        // --no-frontmatter 未传时 commander 给 true，视为未传，交由配置决定
        frontmatter: options.frontmatter === false ? false : undefined,
        lang: ctx.docLang,
      })
      if (options.check) {
        const result = checkDoc(docOptions)
        const first = result.problems[0]
        if (!result.ok && first) {
          const reason = first.kind === "missing" ? "缺少该页" : first.kind === "extra" ? "多余的归档页" : `第 ${first.line} 行`
          console.error(`⚠️ CHANGELOG 镜像不一致：${first.file}（${reason}）`)
          if (first.kind === "diff") {
            console.error(`  期望：${first.expected}`)
            console.error(`  实际：${first.actual}`)
          }
          const counts = { missing: 0, extra: 0, diff: 0 }
          for (const problem of result.problems) counts[problem.kind] += 1
          console.error(`  缺页 ${counts.missing} 个、多页 ${counts.extra} 个、内容差异 ${counts.diff} 个`)
          process.exitCode = 1
          return
        }
        console.log(line.ok(`CHANGELOG 镜像一致：${style.accent(docOptions.target)}`))
        return
      }
      const result = syncDoc(docOptions, { dryRun: options.dryRun })
      if (!result.changed) {
        console.log(line.hint(`CHANGELOG 镜像无变化：${docOptions.target}`))
        return
      }
      // 摘要列出本次生成与清理的全部页面，dry-run 用将来时措辞区分
      console.log(`${options.dryRun ? "CHANGELOG 镜像（dry-run）" : line.ok("CHANGELOG 镜像已同步")}：${style.accent(docOptions.target)}`)
      for (const file of result.written) console.log(`  ${options.dryRun ? "将写入" : "写入"}：${file}`)
      for (const file of result.removed) console.log(`  ${options.dryRun ? "将清理" : "清理"}：${file}`)
      for (const file of result.kept) console.warn(`⚠️ 归档目录存在无生成标记的页面，已保留待人工处理：${file}`)
    } catch (e) {
      console.error(`⚠️ ${(e as Error).message}`)
      process.exitCode = 1
    }
  }

  // 审计：只列出同对象净变更候选，不改写
  function runChangelogAudit(): void {
    console.log(formatAuditReport(auditChangesets(".changeset")))
  }

  // 概览：只读待发布变更集（默认命令），文本与 JSON 同源；command 由调用点给出，区分 status 与 changeset list
  function runChangelogStatus(options: { format?: string }, command: string): void {
    if (!assertJsonFormat(options.format)) return
    const rows = readChangesetSummaries(".changeset")
    if (options.format === "json") {
      printJson(jsonEnvelope(command, true, { total: rows.length, changesets: rows }))
      return
    }
    console.log(formatChangesetSummaries(rows))
  }

  const changelogCmd = program.command("release").description("多语言更新日志与发版（默认 status；封装 changesets）")
  changelogCmd.enablePositionalOptions(true)

  // 裸命令与 status 等价：只读概览，不消费变更集
  changelogCmd
    .command("status")
    .description("待发布变更集概览（只读，不消费）")
    .option("--format <format>", "输出格式（json，输出到 stdout）")
    .action((options: { format?: string }) => {
      runChangelogStatus(options, "release status")
    })
  changelogCmd.action(() => {
    runChangelogStatus({}, "release")
  })

  addChangelogCommonOptions(changelogCmd.command("bump").description("消费变更集并生成新版本块，随后同步文档镜像"))
    .option("--history", "追溯改写历史版本块（默认保留）")
    .option("--no-sync-doc", "不自动同步文档站镜像")
    .option("--exclude <dirs>", "额外跳过的目录，逗号分隔（默认已跳过依赖、产物与 gitignore 目录）")
    .option("--include <dirs>", "强制处理的目录，逗号分隔（覆盖默认跳过名单）")
    .action((options: ChangelogOptions & { history?: boolean; syncDoc?: boolean; exclude?: string; include?: string }) => {
      runChangelogBump(options)
    })

  addChangelogCommonOptions(changelogCmd.command("changelog").description("按语言与类型归类重排 CHANGELOG 条目"))
    .option("--history", "追溯改写历史版本块（默认保留）")
    .option("--exclude <dirs>", "额外跳过的目录，逗号分隔（默认已跳过依赖、产物与 gitignore 目录）")
    .option("--include <dirs>", "强制处理的目录，逗号分隔（覆盖默认跳过名单）")
    .action((options: ChangelogOptions & { history?: boolean; exclude?: string; include?: string }) => {
      runChangelogRewrite(options)
    })

  addChangelogCommonOptions(changelogCmd.command("mirror").description("生成或校验文档站 CHANGELOG 镜像页"))
    .option("--check", "逐页比对镜像页与根 CHANGELOG，不写文件")
    .option("--dry-run", "只列出将写入与清理的文件，不写盘")
    .option("--from <path>", "根 CHANGELOG 路径")
    .option("--to <path>", "镜像页路径")
    .option("--title <text>", "镜像页标题")
    .option("--outline <value>", "frontmatter outline")
    .option("--no-frontmatter", "不写 frontmatter")
    .action((options: ChangelogOptions & { check?: boolean; dryRun?: boolean; from?: string; to?: string; title?: string; outline?: string; frontmatter?: boolean }) => {
      runChangelogMirror(options)
    })

  // 发布：显式命令即授权，参数原样透传 changesets
  changelogCmd
    .command("publish")
    .description("发布已升版产物（透传给 changesets publish）")
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .argument("[args...]", "透传给 changesets 的参数")
    .action((args: string[]) => {
      runChangeset(["publish", ...(args ?? [])])
    })

  addChangelogCommonOptions(changelogCmd.command("audit").description("审计待发布变更集，列出需要合并的候选（只提示不改写）"))
    .action(() => {
      runChangelogAudit()
    })

  // 变更集组：add / status 透传给 changesets，list 为只读简表
  const changesetCmd = changelogCmd.command("changeset").description("变更集：add / list / status（底层 changesets）")

  changesetCmd
    .command("list")
    .description("列出待发布变更集（只读简表）")
    .option("--format <format>", "输出格式（json，输出到 stdout）")
    .action((options: { format?: string }) => {
      runChangelogStatus(options, "release changeset list")
    })

  const CHANGESET_PASSTHROUGH: Array<[string, string, boolean]> = [
    ["add", "新增变更集（透传给 changesets）", false],
    ["status", "查看待发布变更集状态（透传给 changesets）", false],
    ["pre", "进入或退出预发布模式（透传给 changesets）", true],
    ["tag", "为已发布版本打标签（透传给 changesets）", true],
    ["init", "初始化 .changeset 配置（透传给 changesets）", true],
  ]
  for (const [name, description, hidden] of CHANGESET_PASSTHROUGH) {
    changesetCmd
      .command(name, hidden ? { hidden: true } : undefined)
      .description(description)
      .allowUnknownOption(true)
      .allowExcessArguments(true)
      .argument("[args...]", "透传给 changesets 的参数")
      .action((args: string[]) => {
        runChangeset([name, ...(args ?? [])])
      })
  }
}
