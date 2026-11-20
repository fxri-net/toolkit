// rules 命令：全局规则模块的组合、复制与缓存管理的注册入口
import { mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import type { Command } from "commander"
import { composeRules, listRules, loadRuleset, type Ruleset } from "../rules"
import { clearRulesSelection, readRulesSelection, writeRulesSelection } from "../rules/cache"
import { copyToClipboard } from "../rules/clipboard"
import { buildPresetChoices, CUSTOM_PRESET, normalizePickedModules } from "../rules/select"
import { exitOnPromptCancel, isInteractive, loadPrompts } from "../prompts"
import { style } from "../term-style"
import { writeFileAtomic } from "../write-atomic"

// 交互式选择：返回模块 id 顺序；用户取消向调用方冒泡，由命令层以 130 收口
async function selectInteractively(ruleset: Ruleset, cached: string[] | null): Promise<string[]> {
  const { select, checkbox } = await loadPrompts()
  const fallback = cached ?? ruleset.presets.recommended ?? []
  const choice = await select<string>({
    message: "选择规则组合",
    default: cached ? CUSTOM_PRESET : "recommended",
    choices: buildPresetChoices(ruleset.presets),
  })
  if (choice !== CUSTOM_PRESET) return ruleset.presets[choice] ?? []
  const picked = await checkbox({
    message: "选择要包含的规则模块（空格切换，回车确认）",
    choices: ruleset.modules.map((mod) => ({
      name: `${mod.id}｜${mod.title}`,
      value: mod.id,
      checked: fallback.includes(mod.id),
    })),
    pageSize: 10,
    required: false,
  })
  return normalizePickedModules(
    ruleset.modules.map((mod) => mod.id),
    picked,
  )
}

// 注册 rules 命令：装配点只负责按序调用
export function registerRulesCommands(program: Command): void {
  // 规则域：全局规则模块的自由组合、复制与缓存管理
  const rulesCmd = program.command("rules").description("全局规则：列出模块、组合输出与缓存管理")
  rulesCmd.action(() => {
    rulesCmd.help()
  })

  rulesCmd
    .command("list")
    .description("列出规则模块、预设与当前缓存选择")
    .option("--format <format>", "输出格式（json）")
    .action((options: { format?: string }) => {
      try {
        if (options.format && options.format !== "json") console.error("⚠️ --format 仅支持 json，已回落文本输出")
        const listed = listRules()
        const selection = readRulesSelection(listed.modules.map((mod) => mod.id))
        if (options.format === "json") {
          console.log(JSON.stringify({ ...listed, selection: selection?.modules ?? null }, null, 2))
          return
        }
        console.log("规则模块：")
        for (const mod of listed.modules) {
          const mark = selection?.modules.includes(mod.id) ? "●" : " "
          console.log(`  ${mark} ${mod.id.padEnd(8)} ${mod.anchor}  ${mod.title}（${mod.presets.join(" / ") || "无预设"}）`)
        }
        console.log(`预设：${Object.entries(listed.presets).map(([name, ids]) => `${name}=${ids.join("+")}`).join("；")}`)
        console.log(`当前缓存：${selection ? selection.modules.join(" → ") : "无（默认 recommended）"}`)
      } catch (error) {
        console.error(`⚠️ ${(error as Error).message}`)
        process.exitCode = 1
      }
    })

  rulesCmd
    .command("compose")
    .description("组合规则模块并输出（TTY 无参时交互选择；非 TTY 按缓存 > recommended）")
    .option("--preset <name>", "预设：minimal / recommended / complete / full")
    .option("--module <id...>", "模块 id（可重复，也可逗号分隔）")
    .option("--no-anchor", "不输出首行更新时间锚点")
    .option("--out <file>", "写入文件（stdout 为空）")
    .option("--copy", "写入系统剪贴板（stdout 为空）")
    .option("--no-cache", "不读取也不写入组合缓存")
    .action(async (options: { preset?: string; module?: string[]; anchor?: boolean; out?: string; copy?: boolean; cache?: boolean }) => {
      try {
        if (options.copy && options.out) {
          console.error("⚠️ --copy 与 --out 不能同时使用")
          process.exitCode = 1
          return
        }
        const rawModules = options.module ?? []
        const modules = rawModules
          .flatMap((item) => item.split(/[,，]/))
          .map((item) => item.trim())
          .filter(Boolean)
        if (rawModules.length > 0 && modules.length === 0) {
          console.error("⚠️ --module 不能为空")
          process.exitCode = 1
          return
        }
        if (options.preset && modules.length > 0) {
          console.error("⚠️ --preset 与 --module 不能同时使用")
          process.exitCode = 1
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
            console.error(`⚠️ 未知预设「${options.preset}」，可选：${Object.keys(ruleset.presets).join(" / ")}`)
            process.exitCode = 1
            return
          }
          ids = preset
          explicit = true
        } else if (interactive) {
          ids = await selectInteractively(ruleset, cached?.modules ?? null)
          explicit = true
        } else if (cached) {
          ids = cached.modules
        } else {
          ids = ruleset.presets.recommended ?? []
        }
        const text = composeRules(ids, { anchor: options.anchor !== false })
        if (explicit && options.cache !== false) {
          // 导出 / 复制属一次性动作，不改变「下次裸跑 compose」的默认组合
          if (options.out || options.copy) {
            console.error("已跳过组合缓存写入（--out / --copy 不改变默认组合）")
          } else {
            writeRulesSelection(ids)
            console.error(`已记住本次组合（${ids.join(" → ")}），下次 rules compose 会作为默认勾选`)
          }
        }
        if (options.copy) {
          const result = copyToClipboard(text)
          if (!result.ok) {
            console.error(`⚠️ 写入剪贴板失败：${result.error}`)
            process.exitCode = 1
            return
          }
          console.error(`✔ ${style.ok(`已复制到剪贴板（${result.label}）`)}`)
          return
        }
        if (options.out) {
          mkdirSync(dirname(resolve(options.out)), { recursive: true })
          writeFileAtomic(options.out, `${text}\n`)
          console.error(`✔ ${style.ok("已写入")}：${style.accent(options.out)}`)
          return
        }
        console.log(text)
        // 交互模式：输出后尽量直接送剪贴板，少一步手动复制；失败只提示，不影响退出码
        if (interactive) {
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
    .command("reset")
    .description("清除规则组合缓存")
    .action(() => {
      console.log(clearRulesSelection() ? "已清除规则组合缓存" : "无规则组合缓存可清除")
    })

}
