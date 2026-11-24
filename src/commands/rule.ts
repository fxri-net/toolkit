// rules 命令：全局规则模块的组合、复制与缓存管理的注册入口
import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import type { Command } from "commander"
import { composeRules, listRules, loadRuleset, type Ruleset } from "../rules"
import { clearRulesSelection, readRulesSelection, writeRulesSelection } from "../rules/cache"
import { copyToClipboard } from "../rules/clipboard"
import { buildPresetChoices, CUSTOM_PRESET, normalizePickedModules } from "../rules/select"
import { exitOnPromptCancel, exitWithCancel, isInteractive } from "../prompts"
import { askCheckbox, askSelect, fail, reportWrite } from "../cli-ui"
import { assertJsonFormat, jsonEnvelope } from "../json-output"
import { printJson } from "./shared"
import { line, style } from "../term-style"
import { writeFileAtomic } from "../write-atomic"

// 交互式选择：自定义步骤 ESC 回到预设，预设步骤 ESC 取消整个命令；取消不写缓存
async function selectInteractively(ruleset: Ruleset, cached: string[] | null): Promise<string[]> {
  const fallback = cached ?? ruleset.presets.recommended?.modules ?? []
  for (;;) {
    const choice = await askSelect({
      message: "选择规则组合",
      default: cached ? CUSTOM_PRESET : "recommended",
      choices: buildPresetChoices(ruleset.presets),
    })
    if (choice === null) exitWithCancel()
    if (choice !== CUSTOM_PRESET) return ruleset.presets[choice]?.modules ?? []
    const picked = await askCheckbox({
      message: "选择要包含的规则模块（空格切换，回车确认）",
      choices: ruleset.modules.map((mod) => ({
        name: `${mod.id}｜${mod.title}`,
        value: mod.id,
        checked: fallback.includes(mod.id),
      })),
      pageSize: 10,
    })
    if (picked === null) continue
    return normalizePickedModules(
      ruleset.modules.map((mod) => mod.id),
      picked,
    )
  }
}

// 规则锚点格式：模块首行与规则页 fenced 块首行共用
const ANCHOR_RE = /^> 规则更新时间 (\d{4}-\d{2}-\d{2} \d{2}:\d{2})$/

// 锚点校验结果
interface RuleCheckIssue {
  level: "error"
  file: string
  message: string
}

// 读取文件首个非空行并校验锚点格式
function readAnchor(file: string): { anchor: string | null; issue?: string } {
  if (!existsSync(file)) return { anchor: null, issue: "文件不存在" }
  const first = readFileSync(file, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).find((line) => line.trim() !== "")?.trim() ?? ""
  const matched = ANCHOR_RE.exec(first)
  return matched ? { anchor: matched[1]! } : { anchor: null, issue: "首行缺少合法锚点（> 规则更新时间 YYYY-MM-DD HH:mm）" }
}

// 读取规则页 fenced 块内的锚点：取文件内首个锚点行
function readPageAnchor(file: string): { anchor: string | null; issue?: string } {
  if (!existsSync(file)) return { anchor: null, issue: "文件不存在" }
  const content = readFileSync(file, "utf8").replace(/^\uFEFF/, "")
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed.startsWith("> 规则更新时间")) {
      const matched = ANCHOR_RE.exec(trimmed)
      return matched ? { anchor: matched[1]! } : { anchor: null, issue: "锚点格式非法（须为 YYYY-MM-DD HH:mm）" }
    }
  }
  return { anchor: null, issue: "缺少 > 规则更新时间 锚点行" }
}

// 校验规则模块与规则页锚点同源：页面锚点须等于所含模块的最大值
export function checkRuleAnchors(cwd: string): {
  ok: boolean
  modules: Array<{ id: string; file: string; anchor: string | null }>
  pages: Array<{ page: string; anchor: string | null; expected: string | null }>
  issues: RuleCheckIssue[]
} {
  const templatesDir = join(cwd, "templates", "rules")
  const rulesetFile = join(templatesDir, "ruleset.json")
  const issues: RuleCheckIssue[] = []
  if (!existsSync(rulesetFile)) {
    return { ok: false, modules: [], pages: [], issues: [{ level: "error", file: "templates/rules/ruleset.json", message: "未找到规则集定义" }] }
  }
  const ruleset = JSON.parse(readFileSync(rulesetFile, "utf8")) as {
    modules: Array<{ id: string; file: string }>
    pages: Array<{ page: string; modules: string[] }>
  }
  const modules = ruleset.modules.map((mod) => {
    const rel = `templates/rules/${mod.file}`
    const read = readAnchor(join(templatesDir, mod.file))
    if (read.issue) issues.push({ level: "error", file: rel, message: read.issue })
    return { id: mod.id, file: rel, anchor: read.anchor }
  })
  const anchorById = new Map(modules.map((mod) => [mod.id, mod.anchor]))
  const pages = ruleset.pages.map((page) => {
    const rel = `docs/rules/${page.page}.md`
    const read = readPageAnchor(join(cwd, "docs", "rules", `${page.page}.md`))
    if (read.issue) issues.push({ level: "error", file: rel, message: read.issue })
    const anchors = page.modules.map((id) => anchorById.get(id)).filter((value): value is string => Boolean(value))
    const expected = anchors.length === page.modules.length ? [...anchors].sort().at(-1) ?? null : null
    if (read.anchor && expected && read.anchor !== expected) {
      issues.push({ level: "error", file: rel, message: `锚点 ${read.anchor} 与所含模块最大值 ${expected} 不一致` })
    }
    return { page: rel, anchor: read.anchor, expected }
  })
  return { ok: issues.length === 0, modules, pages, issues }
}

// --preset 的帮助文案：从清单派生，避免与 ruleset.json 的预设漂移
function presetHint(): string {
  try {
    const presets = loadRuleset().presets
    return `预设：${Object.entries(presets).map(([id, preset]) => `${preset.label}（${id}）`).join(" / ")}`
  } catch {
    return "预设：见 toolkit rule list"
  }
}

// 注册 rules 命令：装配点只负责按序调用
export function registerRulesCommands(program: Command): void {
  // 规则域：全局规则模块的自由组合、复制与缓存管理
  const rulesCmd = program.command("rule").description("全局规则：列出模块、组合输出与缓存管理")
  rulesCmd.action(() => {
    rulesCmd.help()
  })

  rulesCmd
    .command("list")
    .description("列出规则模块、预设与当前缓存选择")
    .option("--format <format>", "输出格式（json，输出到 stdout）")
    .action((options: { format?: string }) => {
      try {
        if (!assertJsonFormat(options.format)) return
        const listed = listRules()
        const selection = readRulesSelection(listed.modules.map((mod) => mod.id))
        if (options.format === "json") {
          printJson(jsonEnvelope({ command: "rule list", data: { ...listed, selection: selection?.modules ?? null } }))
          return
        }
        console.log("规则模块：")
        for (const mod of listed.modules) {
          const mark = selection?.modules.includes(mod.id) ? "●" : " "
          console.log(`  ${mark} ${mod.id.padEnd(8)} ${mod.anchor}  ${mod.title}（${mod.presets.join(" / ") || "无预设"}）`)
        }
        console.log(`预设：${Object.entries(listed.presets).map(([name, preset]) => `${name}=${preset.modules.join("+")}`).join("；")}`)
        console.log(`当前缓存：${selection ? selection.modules.join(" → ") : "无（默认推荐组合 recommended）"}`)
      } catch (error) {
        console.error(`⚠️ ${(error as Error).message}`)
        process.exitCode = 1
      }
    })

  rulesCmd
    .command("compose")
    .description("组合规则模块并输出（TTY 无参时交互选择；非 TTY 按缓存 > 推荐组合 recommended）")
    .option("--preset <name>", presetHint())
    .option("--module <id...>", "模块 id（可重复，也可逗号分隔）")
    .option("--no-anchor", "不输出首行更新时间锚点")
    .option("--out <file>", "写入文件（stdout 为空）")
    .option("--copy", "写入系统剪贴板（stdout 为空）")
    .option("--no-cache", "不读取也不写入组合缓存")
    .option("--dry-run", "只预览组合与缓存写入，不写文件 / 剪贴板 / 缓存")
    .action(async (options: { preset?: string; module?: string[]; anchor?: boolean; out?: string; copy?: boolean; cache?: boolean; dryRun?: boolean }) => {
      try {
        const dryRun = Boolean(options.dryRun)
        if (options.copy && options.out) {
          fail("--copy 与 --out 不能同时使用")
          return
        }
        const rawModules = options.module ?? []
        const modules = rawModules
          .flatMap((item) => item.split(/[,，]/))
          .map((item) => item.trim())
          .filter(Boolean)
        if (rawModules.length > 0 && modules.length === 0) {
          fail("--module 不能为空")
          return
        }
        if (options.preset && modules.length > 0) {
          fail("--preset 与 --module 不能同时使用")
          return
        }
        const ruleset = loadRuleset()
        const cached = options.cache === false ? null : readRulesSelection(ruleset.modules.map((mod) => mod.id))
        // 无显式选择且处于 TTY 时进入交互，与 skills / usage 等命令保持一致
        const interactive = isInteractive() && !options.preset && modules.length === 0
        let ids: string[]
        let explicit = false
        if (modules.length > 0) {
          ids = modules
          explicit = true
        } else if (options.preset) {
          const preset = ruleset.presets[options.preset]
          if (!preset) {
            fail(`未知预设「${options.preset}」，可选：${Object.keys(ruleset.presets).join(" / ")}`)
            return
          }
          ids = preset.modules
          explicit = true
        } else if (interactive) {
          ids = await selectInteractively(ruleset, cached?.modules ?? null)
          explicit = true
        } else if (cached) {
          ids = cached.modules
        } else {
          ids = ruleset.presets.recommended?.modules ?? []
        }
        const text = composeRules(ids, { anchor: options.anchor !== false })
        if (explicit && options.cache !== false) {
          // 导出 / 复制属一次性动作，不改变「下次裸跑 compose」的默认组合
          if (options.out || options.copy) {
            console.error(line.hint("已跳过组合缓存写入（--out / --copy 不改变默认组合）"))
          } else if (dryRun) {
            console.error(line.hint(`将记住本次组合（${ids.join(" → ")}）；--dry-run 未写入缓存`))
          } else {
            writeRulesSelection(ids)
            console.error(`${line.ok(`已记住本次组合（${ids.join(" → ")}）`)}，${style.hint("下次 rules compose 会作为默认勾选")}`)
          }
        }
        if (options.copy) {
          if (dryRun) {
            console.error(line.hint(`[预演] 将复制到剪贴板（${text.length} 字符）`))
            return
          }
          const result = copyToClipboard(text)
          if (!result.ok) {
            fail(`写入剪贴板失败：${result.error}`)
            return
          }
          console.error(`✔ ${style.ok(`已复制到剪贴板（${result.label}）`)}`)
          return
        }
        if (options.out) {
          if (dryRun) {
            console.error(line.hint(`[预演] 将写入：${style.accent(options.out)}`))
            return
          }
          mkdirSync(dirname(resolve(options.out)), { recursive: true })
          writeFileAtomic(options.out, `${text}\n`)
          reportWrite({ file: options.out, added: ids })
          return
        }
        console.log(text)
        // 交互模式：输出后尽量直接送剪贴板，少一步手动复制；失败只提示，不影响退出码
        if (interactive && !dryRun) {
          const copied = copyToClipboard(text)
          console.error(
            copied.ok
              ? `✔ ${style.ok(`已复制到剪贴板（${copied.label}）`)}，${style.hint("可直接粘贴到 Agent 的全局规则入口")}`
              : style.hint("未检测到可用剪贴板，已输出到 stdout，可手动复制"),
          )
        }
      } catch (error) {
        if (exitOnPromptCancel(error)) return
        console.error(`⚠️ ${(error as Error).message}`)
        process.exitCode = 1
      }
    })

  rulesCmd
    .command("check")
    .description("校验规则模块与规则页的更新锚点是否同源（只报不改）")
    .option("--cwd <path>", "仓库根目录（缺省当前工作目录）")
    .option("--format <format>", "输出格式（json，输出到 stdout）")
    .action((options: { cwd?: string; format?: string }) => {
      try {
        if (!assertJsonFormat(options.format)) return
        const report = checkRuleAnchors(resolve(options.cwd ?? process.cwd()))
        if (options.format === "json") {
          printJson(
            jsonEnvelope({
              command: "rule check",
              data: report,
              issues: report.issues.map((issue) => ({ level: issue.level, scope: issue.file, message: issue.message })),
              exitCode: report.ok ? 0 : 1,
            }),
          )
        } else {
          for (const mod of report.modules) console.log(`${mod.anchor ? "✔" : "✖"} ${mod.file}：${mod.anchor ?? "缺少锚点"}`)
          for (const page of report.pages) console.log(`${page.anchor === page.expected ? "✔" : "✖"} ${page.page}：${page.anchor ?? "缺少锚点"}（期望 ${page.expected ?? "未知"}）`)
          for (const issue of report.issues) console.error(`✖ ${issue.file}：${issue.message}`)
          if (report.ok) console.log(line.ok("规则锚点一致"))
        }
        if (!report.ok) process.exitCode = 1
      } catch (e) {
        console.error(`⚠️ ${(e as Error).message}`)
        process.exitCode = 1
      }
    })

  rulesCmd
    .command("reset")
    .description("清除规则组合缓存")
    .action(() => {
      console.log(clearRulesSelection() ? line.ok("已清除规则组合缓存") : line.hint("无规则组合缓存可清除"))
    })

}
