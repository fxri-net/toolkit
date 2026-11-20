// 作用域向导：状态查看、扫描选目录、规则归属（全局 / 项目 / 本地）、目录增删与批量挂载
import { existsSync } from "node:fs"
import { relative } from "node:path"
import { canonicalPath, normalizePathForCompare } from "../git-ignore"
import { isPromptCancel, loadPrompts } from "../prompts"
import { BUILTIN_SOURCE, installProjectSkills, installSkills, listPackageSkills, readSkillsInstallConfig, writeSkillsInstallConfig } from "../skills"
import { globalConfigPath, layerConfigTarget, readLayerConfig, writeLayerConfig, type ConfigLayer, type LayerConfigTarget } from "./config-file"
import { formatStatus } from "./print"
import { resolveScope } from "./load"
import { scanRepositories, scanRepositoryTree, type ScanOptions } from "./plan"
import { matchPathPattern } from "./pattern"
import { resolveComparablePath } from "./paths"
import type { ActivationMode } from "./types"

// 读取配置里的 activation 字段（仅用于编辑，不参与判定）
function currentActivation(config: Record<string, unknown>): Record<string, unknown> {
  const value = config.activation
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

// 字符串数组字段
function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

// 去空、按真实路径去重并保持顺序
function appendUnique(list: string[], additions: string[]): string[] {
  const seen = new Set(list.map(pathKey))
  const result = [...list]
  for (const item of additions) {
    const key = pathKey(item)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}

// 路径比较键：真实形态 + 统一分隔符与大小写
function pathKey(input: string): string {
  return normalizePathForCompare(canonicalPath(input))
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
  if (report.migrationHint) console.error(`⚠️ ${report.migrationHint}`)
  for (const line of formatStatus(report)) console.log(line)
}

// 选择规则归属：项目层 / 本地层在当前目录无法定位项目根时置灰并说明原因
async function selectLayer(select: Awaited<ReturnType<typeof loadPrompts>>["select"]): Promise<ConfigLayer | null> {
  const project = layerConfigTarget("project")
  const local = layerConfigTarget("local")
  const chosen = await select<ConfigLayer>({
    message: "这套规则作用于",
    choices: [
      { name: `我所有的项目（全局 ${globalConfigPath()}）`, value: "global" },
      {
        name: `仅当前项目（${project.file}，随仓库共享）`,
        value: "project",
        disabled: project.available ? false : project.reason,
      },
      {
        name: `仅当前项目的本机（${local.file}，不入库）`,
        value: "local",
        disabled: local.available ? false : local.reason,
      },
    ],
  })
  return chosen ?? null
}

// 扫描父目录并多选项目：0 结果时就地提供下探 / 隐藏 / 嵌套选项
async function pickFromScan(
  input: Awaited<ReturnType<typeof loadPrompts>>["input"],
  checkbox: Awaited<ReturnType<typeof loadPrompts>>["checkbox"],
  select: Awaited<ReturnType<typeof loadPrompts>>["select"],
): Promise<string[]> {
  const answer = await input({ message: "要扫描的父目录（多个用逗号或换行分隔）", default: process.cwd() })
  const requested = (answer ?? "")
    .split(/[,，;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
  const parents = (requested.length > 0 ? requested : [process.cwd()]).filter((parent) => {
    if (existsSync(parent)) return true
    console.error(`⚠️ 目录不存在：${parent}`)
    return false
  })
  if (parents.length === 0) return []
  let options: ScanOptions = {}
  for (;;) {
    const results = parents.map((parent) => scanRepositoryTree(parent, options))
    const truncated = results.find((result) => result.truncated)?.truncated
    if (truncated) console.warn(`⚠️ 扫描未完成：${truncated}；可缩小范围或继续下探`)
    const seen = new Set<string>()
    let repos = results
      .flatMap((result) => result.repos)
      .filter((repo) => {
        const key = pathKey(repo.path)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    if (repos.length === 0) {
      const next = await select<string>({
        message: "未发现仓库，下一步",
        choices: [
          { name: "下探更深", value: "deeper" },
          { name: "包含隐藏目录", value: "hidden" },
          { name: "包含嵌套仓库", value: "nested" },
          { name: "取消", value: "cancel" },
        ],
      })
      if (next === "cancel" || next === undefined) return []
      if (next === "deeper") options = { ...options, maxDepth: (options.maxDepth ?? 8) + 8 }
      if (next === "hidden") options = { ...options, hidden: true }
      if (next === "nested") options = { ...options, nested: true }
      continue
    }
    if (repos.length > 30) {
      const keyword = (await input({ message: `发现 ${repos.length} 个项目，可输入关键字过滤（留空不过滤）`, default: "" })) ?? ""
      const needle = keyword.trim().toLowerCase()
      if (needle) repos = repos.filter((repo) => repo.name.toLowerCase().includes(needle) || repo.path.toLowerCase().includes(needle))
    }
    const picked = await checkbox<string>({
      message: `选择项目（共 ${repos.length} 个，空格切换，回车确认）`,
      choices: repos.map((repo) => ({
        name: `${repo.name} · ${relativeToParents(parents, repo.path)}${repo.kind === "npm" ? " · 非 git" : ""}`,
        value: repo.path,
        checked: false,
      })),
      pageSize: 15,
      required: false,
    })
    return picked ?? []
  }
}

// 展示用相对路径：取包含该仓库的最短父目录前缀
function relativeToParents(parents: string[], target: string): string {
  const matched = parents
    .map((parent) => relative(parent, target))
    .filter((item) => item && !item.startsWith(".."))
    .sort((left, right) => left.length - right.length)[0]
  return matched || target
}

// 手动输入目录：支持逗号 / 分号 / 换行分隔与 ~ 展开
async function pickManual(input: Awaited<ReturnType<typeof loadPrompts>>["input"]): Promise<string[]> {
  const answer = await input({ message: "输入目录（绝对路径或 ~，多个用逗号分隔）", default: "" })
  return (answer ?? "")
    .split(/[,，;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

// 写入前预览：把将要落盘的模式与两列表原样展示
function describeChange(target: LayerConfigTarget, mode: ActivationMode, include: string[], exclude: string[]): string {
  return [
    `写入：${target.file}`,
    `模式：${mode}${mode === "allowlist" ? "（未列出的项目将不生效）" : ""}`,
    `白名单：${include.length > 0 ? include.join("、") : "空"}`,
    `黑名单：${exclude.length > 0 ? exclude.join("、") : "空"}`,
  ].join("\n")
}

// 去向选择：加入白 / 黑名单、移除或不动；冲突就地互转后再预览写入
async function applyDestinations(
  layer: ConfigLayer,
  target: LayerConfigTarget,
  config: Record<string, unknown>,
  activation: Record<string, unknown>,
  dirs: string[],
  select: Awaited<ReturnType<typeof loadPrompts>>["select"],
  confirm: Awaited<ReturnType<typeof loadPrompts>>["confirm"],
): Promise<void> {
  const destination = await select<string>({
    message: "处理方式",
    choices: [
      { name: "加入白名单", value: "include" },
      { name: "加入黑名单", value: "exclude" },
      { name: "从名单移除", value: "remove" },
      { name: "保持不动", value: "keep" },
    ],
  })
  if (destination === "keep" || destination === undefined) return
  const include = stringList(activation.include)
  const exclude = stringList(activation.exclude)
  const keys = new Set(dirs.map(pathKey))
  let nextInclude = include
  let nextExclude = exclude
  let mode = (activation.mode as ActivationMode) ?? "all"
  if (destination === "include") {
    const conflicts = exclude.filter((item) => keys.has(pathKey(item)))
    if (conflicts.length > 0) {
      const move = await confirm({
        message: `${conflicts.length} 个目录已在黑名单，移入白名单并从黑名单删除？`,
        default: true,
      })
      if (!move) return
      nextExclude = exclude.filter((item) => !keys.has(pathKey(item)))
    }
    nextInclude = appendUnique(include, dirs)
    mode = "allowlist"
  }
  if (destination === "exclude") nextExclude = appendUnique(exclude, dirs)
  if (destination === "remove") {
    nextInclude = include.filter((item) => !keys.has(pathKey(item)))
    nextExclude = exclude.filter((item) => !keys.has(pathKey(item)))
  }
  const confirmed = await confirm({ message: `${describeChange(target, mode, nextInclude, nextExclude)}\n继续写入？`, default: true })
  if (!confirmed) return
  writeLayerConfig(layer, { ...config, activation: { ...activation, mode, include: nextInclude, exclude: nextExclude } })
  console.log(`已写入 ${target.file}；运行 toolkit scope status 查看当前目录判定`)
}

// 清除限制：写 mode all 并清空两列表，作为唯一的「全部生效」入口
async function clearRestriction(
  layer: ConfigLayer,
  target: LayerConfigTarget,
  config: Record<string, unknown>,
  activation: Record<string, unknown>,
  confirm: Awaited<ReturnType<typeof loadPrompts>>["confirm"],
): Promise<void> {
  const confirmed = await confirm({ message: `${describeChange(target, "all", [], [])}\n继续写入？`, default: true })
  if (!confirmed) return
  writeLayerConfig(layer, { ...config, activation: { ...activation, mode: "all", include: [], exclude: [] } })
  console.log(`已写入 ${target.file}：全部项目生效`)
}

// 项目层 / 本地层：只决定「本项目是否生效」，不扫描其他项目
async function configureProjectScope(
  layer: ConfigLayer,
  target: LayerConfigTarget,
  config: Record<string, unknown>,
  activation: Record<string, unknown>,
  select: Awaited<ReturnType<typeof loadPrompts>>["select"],
  confirm: Awaited<ReturnType<typeof loadPrompts>>["confirm"],
): Promise<void> {
  const choice = await select<string>({
    message: "本项目是否生效",
    choices: [
      { name: "生效", value: "yes" },
      { name: "不生效", value: "no" },
    ],
  })
  if (choice === undefined) return
  const include = choice === "yes" && target.root ? [target.root] : []
  const exclude = stringList(activation.exclude)
  const confirmed = await confirm({ message: `${describeChange(target, "allowlist", include, exclude)}\n继续写入？`, default: true })
  if (!confirmed) return
  writeLayerConfig(layer, { ...config, activation: { ...activation, mode: "allowlist", include, exclude } })
  console.log(`已写入 ${target.file}；运行 toolkit scope status 查看当前目录判定`)
}

// 设置生效范围：选归属 → 扫描 / 手动选目录 → 选去向 → 预览写入
export async function runScopeSetScope(): Promise<void> {
  requireTty("设置生效范围", "请直接编辑配置文件的 activation 段；交互终端下可重跑 toolkit scope")
  const { select, checkbox, input, confirm } = await loadPrompts()
  try {
    const layer = await selectLayer(select)
    if (!layer) return
    const target = layerConfigTarget(layer)
    const config = readLayerConfig(layer)
    const activation = currentActivation(config)
    if (layer !== "global") {
      await configureProjectScope(layer, target, config, activation, select, confirm)
      return
    }
    const action = await select<string>({
      message: "操作",
      choices: [
        { name: "扫描项目并加入名单", value: "scan" },
        { name: "手动输入目录", value: "manual" },
        { name: "清除限制（全部生效）", value: "reset" },
        { name: "取消", value: "cancel" },
      ],
    })
    if (action === "cancel" || action === undefined) return
    if (action === "reset") {
      await clearRestriction(layer, target, config, activation, confirm)
      return
    }
    const raw = action === "scan" ? await pickFromScan(input, checkbox, select) : await pickManual(input)
    const dirs = appendUnique([], raw.map((dir) => resolveComparablePath(dir)))
    if (dirs.length === 0) {
      console.log("未选择目录，已取消")
      return
    }
    await applyDestinations(layer, target, config, activation, dirs, select, confirm)
  } catch (error) {
    if (!cancelled(error)) throw error
  }
}

// 添加目录：带参数直接追加白名单（非交互，可指定配置层），无参进入完整流程
export async function runScopeAdd(dirs?: string[], layer?: ConfigLayer): Promise<void> {
  if (!dirs || dirs.length === 0) {
    await runScopeSetScope()
    return
  }
  const targetLayer = layer ?? "global"
  if (targetLayer !== "global" && targetLayer !== "project" && targetLayer !== "local") {
    throw new Error(`未知配置层：${String(targetLayer)}（可选 global / project / local）`)
  }
  const target = layerConfigTarget(targetLayer)
  if (!target.available) throw new Error(target.reason)
  const config = readLayerConfig(targetLayer)
  const activation = currentActivation(config)
  const include = stringList(activation.include)
  const exclude = stringList(activation.exclude)
  const paths = appendUnique([], dirs.map((dir) => resolveComparablePath(dir, target.root ?? process.cwd())))
  const keys = new Set(paths.map(pathKey))
  const moved = exclude.filter((item) => keys.has(pathKey(item)))
  if (moved.length > 0) console.warn(`⚠️ 已从黑名单移入白名单：${moved.join("、")}`)
  writeLayerConfig(targetLayer, {
    ...config,
    activation: { ...activation, mode: "allowlist", include: appendUnique(include, paths), exclude: exclude.filter((item) => !keys.has(pathKey(item))) },
  })
  console.log(`已加入白名单：${paths.join("、")}（模式已切换为 allowlist，写入 ${target.file}）`)
}

// 移除目录：按层管理名单，支持一步互转与悬空条目提示
export async function runScopeRemove(dirs?: string[], layer?: ConfigLayer): Promise<void> {
  const { select, checkbox } = await loadPrompts()
  let targetLayer = layer
  if (!targetLayer) {
    requireTty("移除目录", "请改用 toolkit scope remove <dir>... --layer global|project|local")
    try {
      const chosen = await selectLayer(select)
      if (!chosen) return
      targetLayer = chosen
    } catch (error) {
      if (cancelled(error)) return
      throw error
    }
  }
  if (targetLayer !== "global" && targetLayer !== "project" && targetLayer !== "local") {
    throw new Error(`未知配置层：${String(targetLayer)}（可选 global / project / local）`)
  }
  const target = layerConfigTarget(targetLayer)
  if (!target.available) throw new Error(target.reason)
  const config = readLayerConfig(targetLayer)
  const activation = currentActivation(config)
  const include = stringList(activation.include)
  const exclude = stringList(activation.exclude)
  let targets: string[]
  try {
    if (dirs && dirs.length > 0) {
      targets = dirs.map((dir) => resolveComparablePath(dir))
    } else {
      const statuses = [
        ...entryStatuses(include, "include", [...include, ...exclude], target.root ?? process.cwd()),
        ...entryStatuses(exclude, "exclude", [...include, ...exclude], target.root ?? process.cwd()),
      ]
      targets = await checkbox({
        message: `选择条目（写入 ${target.file}）`,
        choices: statuses.map((item) => ({ name: describeEntry(item), value: item.path })),
        pageSize: 15,
        required: false,
      })
    }
  } catch (error) {
    if (cancelled(error)) return
    throw error
  }
  if (targets.length === 0) {
    console.log("未选择任何目录")
    return
  }
  const keys = new Set(targets.map(pathKey))
  let action = "remove"
  if (!dirs || dirs.length === 0) {
    const chosen = await select<string>({
      message: "处理方式",
      choices: [
        { name: "移出名单", value: "remove" },
        { name: "白名单转黑名单", value: "to-exclude" },
        { name: "黑名单转白名单", value: "to-include" },
        { name: "取消", value: "cancel" },
      ],
    })
    if (chosen === undefined || chosen === "cancel") return
    action = chosen
  }
  let nextInclude = include.filter((item) => !keys.has(pathKey(item)))
  let nextExclude = exclude.filter((item) => !keys.has(pathKey(item)))
  if (action === "to-exclude") nextExclude = appendUnique(nextExclude, targets)
  if (action === "to-include") nextInclude = appendUnique(nextInclude, targets)
  writeLayerConfig(targetLayer, { ...config, activation: { ...activation, include: nextInclude, exclude: nextExclude } })
  console.log(`已更新 ${target.file}（${targets.length} 条）`)
}

// 条目状态：路径是否存在、是否被同层其它规则覆盖
// baseDir 取配置层对应的项目根：相对路径条目按它解析，避免以 cwd 为基准误判
function entryStatuses(
  entries: string[],
  list: "include" | "exclude",
  all: string[],
  baseDir: string,
): Array<{ path: string; list: "include" | "exclude"; exists: boolean; coveredBy: string | null }> {
  return entries.map((item) => ({
    path: item,
    list,
    exists: existsSync(resolveComparablePath(item, baseDir)),
    // 同层另一条规则命中该路径时提示被覆盖，避免用户误以为单条规则独立生效
    coveredBy:
      all
        .filter((other) => other !== item && matchPathPattern(item, other, { baseDir }))
        .sort((left, right) => left.length - right.length)[0] ?? null,
  }))
}

// 条目人读文案：白 / 黑、路径存在性与覆盖提示
function describeEntry(item: { path: string; list: "include" | "exclude"; exists: boolean; coveredBy: string | null }): string {
  const tag = item.list === "include" ? "[白]" : "[黑]"
  const missing = item.exists ? "" : "（路径不存在）"
  const covered = item.coveredBy ? `（已被 ${item.coveredBy} 覆盖）` : ""
  return `${tag} ${item.path}${missing}${covered}`
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
  // 挂载沿用一层扫描，避免把技能写进深层项目
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

// 内容闸门：查看 / 切换入口壳形态；切换后按已保存选择（无则 core）刷新产物
export async function runScopeGate(): Promise<void> {
  requireTty("内容闸门", "请改用 toolkit skills install --gate / --embed 直接切换")
  const { select, confirm } = await loadPrompts()
  const enabled = readSkillsInstallConfig().gate === true
  try {
    const choice = await select<string>({
      message: `内容闸门（当前：${enabled ? "入口壳" : "全文"}）`,
      default: enabled ? "off" : "on",
      choices: [
        { name: "开启：按接管规则改写为入口壳", value: "on" },
        { name: "关闭：回退全文安装", value: "off" },
        { name: "保持现状", value: "keep" },
      ],
    })
    if (choice === "keep") return
    const gate = choice === "on"
    const apply = await confirm({ message: "现在按已保存选择刷新技能产物？", default: true })
    if (!apply) {
      // 拒绝刷新时只切开关，产物留给用户之后显式安装
      writeSkillsInstallConfig({ gate })
      console.log(`已${gate ? "开启" : "关闭"}内容闸门（写入 skillsInstall.gate）；产物未刷新，需要时运行 toolkit skills install`)
      return
    }
    // 与 skills install 的默认口径一致：已保存选择优先，未保存过时只装 core
    const saved = readSkillsInstallConfig().selection?.[BUILTIN_SOURCE] ?? []
    const skills = saved.length > 0 ? saved : listPackageSkills().filter((skill) => skill.tier === "core").map((skill) => skill.name)
    // 开关由 installSkills 在成功且无失败条目时落盘
    const report = installSkills({ skills, gate })
    const gates = report.targets.reduce((count, target) => count + target.gates.length, 0)
    const failures = report.targets.reduce((count, target) => count + target.failed.length, 0)
    if (failures > 0) console.warn(`入口壳 ${gates} 个，另有 ${failures} 个失败；开关未保存`)
    else console.log(`✓ 已刷新：入口壳 ${gates} 个，开关已保存`)
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
          { name: "设置生效范围（扫描 / 手动）", value: "scope" },
          { name: "添加 / 移除目录", value: "dirs" },
          { name: "内容闸门（全文 / 入口壳）", value: "gate" },
          { name: "批量安装技能到项目（会写项目文件）", value: "mount" },
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
    if (action === "gate") await runScopeGate()
    if (action === "mount") await runScopeMount()
  }
}
