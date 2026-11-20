// 作用域向导：状态查看、范围设置、目录增删与批量挂载；只写全局配置，挂载需显式确认
import { existsSync } from "node:fs"
import { dirname } from "node:path"
import { getHomeDir } from "../config"
import { isPromptCancel, loadPrompts } from "../prompts"
import { installProjectSkills, listPackageSkills } from "../skills"
import { globalConfigPath, readGlobalConfig, writeGlobalConfig } from "./config-file"
import { formatStatus } from "./print"
import { resolveScope } from "./load"
import { dedupe, mergeActivation, scanRepositories } from "./plan"
import type { ActivationMode } from "./types"

// 读取全局配置里的 activation 字段（仅用于编辑，不参与判定）
function currentActivation(config: Record<string, unknown>): Record<string, unknown> {
  const value = config.activation
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

// 字符串数组字段
function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

// 候选目录：当前目录、父目录、home 与已有条目
function dirCandidates(existing: string[]): string[] {
  const cwd = process.cwd()
  return dedupe([cwd, dirname(cwd), getHomeDir(), ...existing])
}

// 取消统一处理：内存态不变
function cancelled(error: unknown): boolean {
  return isPromptCancel(error)
}

// 交互前置：非 TTY 时给出可执行替代，不静默失败
function requireTty(action: string, hint: string): void {
  if (process.stdin.isTTY && process.stdout.isTTY) return
  throw new Error(`当前环境不支持交互（${action}）：${hint}`)
}

// 查看当前判定
export function printScopeStatus(): void {
  const report = resolveScope()
  for (const warning of report.warnings) console.error(`⚠️ ${warning}`)
  for (const line of formatStatus(report)) console.log(line)
}

// 设置生效范围：全部 / 白名单 / 黑名单
export async function runScopeSetScope(): Promise<void> {
  requireTty("设置生效范围", "请直接编辑全局配置的 activation 段；交互终端下可重跑 toolkit scope")
  const { select, checkbox, input, confirm } = await loadPrompts()
  const config = readGlobalConfig()
  const activation = currentActivation(config)
  const include = stringList(activation.include)
  const exclude = stringList(activation.exclude)
  try {
    const mode = await select<ActivationMode>({
      message: "生效范围",
      default: (activation.mode as ActivationMode) ?? "all",
      choices: [
        { name: "全部项目（默认，与历史一致）", value: "all" },
        { name: "只在我选的目录生效", value: "allowlist" },
        { name: "除了我选的目录都生效", value: "denylist" },
      ],
    })
    if (mode === "all") {
      writeGlobalConfig(mergeActivation(config, { mode, include: [], exclude: [] }))
      console.log(`已写入 ${globalConfigPath()}：全部项目生效`)
      return
    }
    const existing = mode === "allowlist" ? include : exclude
    const candidates = dirCandidates([...include, ...exclude])
    const picked = await checkbox({
      message: "选择目录（空格切换，回车确认）",
      choices: candidates.map((dir) => ({ name: dir, value: dir, checked: existing.includes(dir) })),
      pageSize: 15,
      required: false,
    })
    const manual = await input({ message: "补充目录（绝对路径，可留空）", default: "" })
    const dirs = dedupe([...picked, manual].filter(Boolean))
    if (dirs.length === 0) {
      console.error("⚠️ 未选择任何目录：该模式下所有目录都不会生效，已取消写入")
      return
    }
    const confirmed = await confirm({ message: `将更新 ${globalConfigPath()}（${dirs.length} 条目录规则），继续？` })
    if (!confirmed) return
    writeGlobalConfig(
      mergeActivation(config, mode === "allowlist" ? { mode, include: dirs, exclude } : { mode, include, exclude: dirs }),
    )
    console.log(`已写入 ${globalConfigPath()}；运行 toolkit scope status 查看当前目录判定`)
  } catch (error) {
    if (!cancelled(error)) throw error
  }
}

// 添加目录：带参数直接写，否则交互选择
export async function runScopeAdd(dir?: string): Promise<void> {
  if (!dir) requireTty("添加目录", "请改用 toolkit scope add <dir> 直接指定目录")
  const { input } = await loadPrompts()
  const config = readGlobalConfig()
  const activation = currentActivation(config)
  const include = stringList(activation.include)
  let target = dir
  if (!target) {
    try {
      target = await input({ message: "要加入白名单的目录", default: process.cwd() })
    } catch (error) {
      if (cancelled(error)) return
      throw error
    }
  }
  if (!target?.trim()) {
    console.error("⚠️ 目录不能为空")
    process.exitCode = 1
    return
  }
  writeGlobalConfig(mergeActivation(config, { mode: "allowlist", include: [...include, target], exclude: stringList(activation.exclude) }))
  console.log(`已加入白名单：${target}（模式已切换为 allowlist）`)
}

// 移除目录：带参数从两列表移除，否则交互多选
export async function runScopeRemove(dir?: string): Promise<void> {
  if (!dir) requireTty("移除目录", "请改用 toolkit scope remove <dir> 直接指定目录")
  const { checkbox } = await loadPrompts()
  const config = readGlobalConfig()
  const activation = currentActivation(config)
  const include = stringList(activation.include)
  const exclude = stringList(activation.exclude)
  let targets: string[]
  if (dir) {
    targets = [dir]
  } else {
    try {
      targets = await checkbox({
        message: "选择要移除的目录",
        choices: [...new Set([...include, ...exclude])].map((item) => ({ name: item, value: item })),
        pageSize: 15,
        required: false,
      })
    } catch (error) {
      if (cancelled(error)) return
      throw error
    }
  }
  if (targets.length === 0) {
    console.log("未选择任何目录")
    return
  }
  const keptInclude = include.filter((item) => !targets.includes(item))
  const keptExclude = exclude.filter((item) => !targets.includes(item))
  writeGlobalConfig({ ...config, activation: { ...activation, include: keptInclude, exclude: keptExclude } })
  console.log(`已移除 ${targets.length} 条目录规则`)
}

// 批量挂载：扫描父目录一层、多选仓库、显式确认后逐仓安装（会向项目写文件）
export async function runScopeMount(parent?: string, dryRun = false): Promise<void> {
  requireTty("批量挂载", "请在交互终端运行；挂载需要逐个项目确认")
  const { checkbox, confirm } = await loadPrompts()
  const root = parent ?? process.cwd()
  if (!existsSync(root)) {
    console.error(`⚠️ 目录不存在：${root}`)
    process.exitCode = 1
    return
  }
  const repos = scanRepositories(root)
  if (repos.length === 0) {
    console.log("未发现仓库（按 .git / package.json / .tasks 识别）")
    return
  }
  try {
    const picked = await checkbox({
      message: "选择要安装技能的项目（会把技能文件写入这些项目）",
      choices: repos.map((repo) => ({ name: repo.name, value: repo.path })),
      pageSize: 15,
      required: false,
    })
    if (picked.length === 0) {
      console.log("未选择项目，已取消")
      return
    }
    if (!dryRun) {
      const confirmed = await confirm({
        message: `将向 ${picked.length} 个项目写入技能真源 / 薄壳 / 状态账（可能含项目配置），继续？`,
        default: false,
      })
      if (!confirmed) return
    }
    const skills = listPackageSkills()
      .filter((skill) => skill.tier === "core")
      .map((skill) => skill.name)
    for (const repo of picked) {
      if (dryRun) {
        console.log(`[预演] 将安装到 ${repo}（技能 ${skills.length} 个）`)
        continue
      }
      try {
        const report = installProjectSkills({ cwd: repo, skills, mode: "skills", saveSelection: true, saveTargets: true })
        console.log(`✓ ${report.root}：技能 ${report.selection.length} 个，薄壳 ${report.shells.length} 个`)
      } catch (error) {
        console.error(`⚠️ ${repo}：${(error as Error).message}`)
      }
    }
  } catch (error) {
    if (!cancelled(error)) throw error
  }
}

// 无参入口：交互菜单，循环直到退出
export async function runScopeWizard(): Promise<void> {
  const { select } = await loadPrompts()
  for (;;) {
    let action: string
    try {
      action = await select<string>({
        message: "作用域",
        choices: [
          { name: "查看当前状态", value: "status" },
          { name: "设置生效范围", value: "scope" },
          { name: "添加 / 移除目录", value: "dirs" },
          { name: "在项目里批量安装技能（会写项目文件）", value: "mount" },
          { name: "退出", value: "exit" },
        ],
      })
    } catch (error) {
      if (cancelled(error)) return
      throw error
    }
    if (action === "exit") return
    if (action === "status") printScopeStatus()
    if (action === "scope") await runScopeSetScope()
    if (action === "dirs") {
      try {
        const { select: selectDir } = await loadPrompts()
        const choice = await selectDir<string>({
          message: "目录管理",
          choices: [
            { name: "添加目录到白名单", value: "add" },
            { name: "移除目录", value: "remove" },
          ],
        })
        if (choice === "add") await runScopeAdd()
        else await runScopeRemove()
      } catch (error) {
        if (!cancelled(error)) throw error
      }
    }
    if (action === "mount") await runScopeMount()
  }
}
