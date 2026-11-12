// changelog 命令：多语言 CHANGELOG 的注册入口、changesets 透传与打印
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import { join } from "node:path"
import type { Command } from "commander"
import { DEFAULT_LANG, resolveLang, type ChangelogLanguage } from "../changelog/languages"
import { countUntypedEntries, formatChangelogs, localDate } from "../changelog/format"
import { auditChangesets, formatAuditReport } from "../changelog/audit"
import { checkDoc, resolveDocOptions, syncDoc, syncDocAfterVersion } from "../changelog/doc"
import { resolveRedactEnabled } from "../privacy/redact"
import { resolveEnabled } from "../switch"
import { listTaskFiles } from "../tasks/scan"
import { getCheckWarnings, resolveLanguages } from "./shared"

const require = createRequire(import.meta.url)
// 解析 @changesets/cli 的 bin 绝对路径（pnpm 下 bin 不提升到使用方，需显式定位）
const changesetBin = require.resolve("@changesets/cli/bin.js")

// 调用 changesets（子进程执行，继承 stdio）
const runChangeset = (cmd: string[]) => {
  const res = spawnSync(process.execPath, [changesetBin, ...cmd], { stdio: "inherit" })
  if (res.status !== 0) process.exit(res.status ?? 1)
}

// 检测 active 是否有未归档任务
function hasActiveTasks(dir = ".tasks"): boolean {
  return listTaskFiles(join(dir, "active")).length > 0
}

// changelog 软告警：提示缺类型前缀的变更集条目（须在归类前取数，归类后前缀缺失信息即丢失）
// 传全部配置语言，前缀识别与 tasks check 侧 changesetPrefixIssues 同一并集口径
function warnUntypedEntries(langs: ChangelogLanguage[]) {
  const count = countUntypedEntries(".", langs)
  if (count > 0) {
    console.warn(`⚠️ ${count} 条变更集条目缺类型前缀，建议按「类型：描述」撰写`)
  }
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
      .option("--lang <lang>", "语言 zh/en", DEFAULT_LANG)
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
      warn: resolveEnabled(options.warn, "FX_CHECK_WARN", getCheckWarnings(), true),
    }
  }

  // 版本：消费变更集 → 归类格式化 → 同步文档镜像
  function runChangelogVersion(options: ChangelogOptions & { history?: boolean; syncDoc?: boolean }): void {
    const ctx = resolveChangelogContext(options)
    // 软告警：发版前存在未归档任务
    if (ctx.warn && hasActiveTasks()) {
      console.warn("⚠️ 存在未归档的 active 任务，建议先归档再发版")
    }
    runChangeset(["version"])
    // 软告警须前置于归类（须待 changesets 写入新块后再取数，否则无英文源标题块可扫）；
    // 归类后无前缀条目即并入兜底组，前缀缺失无从统计
    if (ctx.warn) warnUntypedEntries(Object.values(ctx.merged))
    formatChangelogs(".", localDate(), ctx.lang, ctx.redact, Boolean(options.history))
    // 发版后自动同步文档站镜像：失败只告警，不阻断发版（镜像不是发版必需产物）
    if (options.syncDoc !== false) syncDocAfterVersion(ctx.docLang)
  }

  // 格式化：按语言与类型归类重排，不消费变更集
  function runChangelogFormat(options: ChangelogOptions & { history?: boolean }): void {
    const ctx = resolveChangelogContext(options)
    if (ctx.warn) warnUntypedEntries(Object.values(ctx.merged))
    formatChangelogs(".", localDate(), ctx.lang, ctx.redact, Boolean(options.history))
  }

  // 文档镜像：默认从根 CHANGELOG.md 生成，--check 只比对不写
  function runChangelogDoc(
    options: ChangelogOptions & { check?: boolean; from?: string; to?: string; title?: string; outline?: string; frontmatter?: boolean },
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
        if (!result.ok) {
          console.error(`⚠️ CHANGELOG 镜像不一致：第 ${result.line} 行`)
          if (result.expected !== undefined) console.error(`  期望：${result.expected}`)
          if (result.actual !== undefined) console.error(`  实际：${result.actual}`)
          process.exitCode = 1
          return
        }
        console.log(`CHANGELOG 镜像一致：${docOptions.target}`)
        return
      }
      const result = syncDoc(docOptions)
      console.log(result.changed ? `CHANGELOG 镜像已更新：${docOptions.target}` : `CHANGELOG 镜像无变化：${docOptions.target}`)
    } catch (e) {
      console.error(`⚠️ ${(e as Error).message}`)
      process.exitCode = 1
    }
  }

  // 审计：只列出同对象净变更候选，不改写
  function runChangelogAudit(): void {
    console.log(formatAuditReport(auditChangesets(".changeset")))
  }

  const changelogCmd = program.command("changelog").description("多语言 CHANGELOG（封装 changesets）")
  changelogCmd.enablePositionalOptions(true)

  addChangelogCommonOptions(changelogCmd.command("version").description("消费变更集并生成新版本块，随后同步文档镜像"))
    .option("--history", "追溯改写历史版本块（默认保留）")
    .option("--no-sync-doc", "不自动同步文档站镜像")
    .action((options: ChangelogOptions & { history?: boolean; syncDoc?: boolean }) => {
      runChangelogVersion(options)
    })

  addChangelogCommonOptions(changelogCmd.command("format").description("按语言与类型归类重排 CHANGELOG 条目"))
    .option("--history", "追溯改写历史版本块（默认保留）")
    .action((options: ChangelogOptions & { history?: boolean }) => {
      runChangelogFormat(options)
    })

  addChangelogCommonOptions(changelogCmd.command("doc").description("生成或校验文档站 CHANGELOG 镜像页"))
    .option("--check", "只比对镜像页与根 CHANGELOG，不写文件")
    .option("--from <path>", "根 CHANGELOG 路径")
    .option("--to <path>", "镜像页路径")
    .option("--title <text>", "镜像页标题")
    .option("--outline <value>", "frontmatter outline")
    .option("--no-frontmatter", "不写 frontmatter")
    .action((options: ChangelogOptions & { check?: boolean; from?: string; to?: string; title?: string; outline?: string; frontmatter?: boolean }) => {
      runChangelogDoc(options)
    })

  addChangelogCommonOptions(changelogCmd.command("audit").description("审计待发布变更集，列出需要合并的候选（只提示不改写）"))
    .action(() => {
      runChangelogAudit()
    })

  // 裸 changelog：仍透传给 changesets（无参数时按其默认行为）
  changelogCmd.action(() => {
    runChangeset([])
  })

  // changesets 原生子命令：参数原样透传
  const CHANGESET_PASSTHROUGH: Array<[string, string]> = [
    ["add", "新增变更集（透传给 changesets）"],
    ["status", "查看待发布变更集状态（透传给 changesets）"],
    ["pre", "进入或退出预发布模式（透传给 changesets）"],
    ["tag", "为已发布版本打标签（透传给 changesets）"],
    ["init", "初始化 .changeset 配置（透传给 changesets）"],
    ["publish", "发布变更集（透传给 changesets）"],
  ]
  for (const [name, description] of CHANGESET_PASSTHROUGH) {
    changelogCmd
      .command(name)
      .description(description)
      .allowUnknownOption(true)
      .allowExcessArguments(true)
      .argument("[args...]", "透传给 changesets 的参数")
      .action((args: string[]) => {
        runChangeset([name, ...(args ?? [])])
      })
  }
}
