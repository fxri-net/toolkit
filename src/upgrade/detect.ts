// 升级迁移检测：只读扫描各迁移面，产出可展示、可勾选的迁移项
// 判定依据取「旧形态是否仍然存在」，不依赖旧补丁版本号
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { basename, join, resolve } from "node:path"
import { CONFIG_LEGACY_SECTIONS, getHomeDir, loadToolkitConfig } from "../config"
import { configFileForLayer } from "../config-edit"
import { commandMigrationRows } from "../command-registry"
import { conventionsStatus } from "../conventions/status"
import { readTextFile } from "../read-text"
import { findProjectRoot } from "../scope/paths"
import { readProjectState, readSkillsState, skillsStateFile, projectStateFile } from "../skills/state"
import { LEGACY_PREPARE_SCRIPTS } from "../tasks/init"
import type { UpgradeItem, UpgradeLayer } from "./types"

// 旧技能名 → 当前技能名：与升级页对照表同源，用于识别历史安装产物
export const LEGACY_SKILL_NAMES: Readonly<Record<string, string>> = {
  "fxri-plan-to-task": "fxri-plan-task",
  "fxri-session-recap": "fxri-plan-recap",
  "fxri-skill-authoring": "fxri-writing-skill",
  "fxri-docs-writing": "fxri-writing-docs",
  "fxri-text-encoding": "fxri-code-encoding",
}

// 迁移层全集：检测与 --layers 过滤共用
export const ALL_LAYERS: readonly UpgradeLayer[] = ["global", "project", "local"]

// 读 JSON 对象：文件不存在或解析失败返回 null（解析失败由调用方归入人工项）
function readJsonObject(file: string): Record<string, unknown> | null {
  if (!existsSync(file)) return null
  try {
    const parsed: unknown = JSON.parse(readTextFile(file))
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

// 取旧命令 token：只取两段及以上的旧路径，避免把 task 这类当前段名误判为旧命令
function legacyCommandTokens(): Array<{ from: string; to: string }> {
  return commandMigrationRows().map((row) => ({ from: row.from, to: row.to }))
}

// 命令位置命中的旧命令：只在以 toolkit 开头的命令段里找，普通字符串（如 echo）不算
export function legacyCommandIn(text: string): { from: string; to: string } | null {
  const tokens = legacyCommandTokens()
  for (const segment of text.split(/(&&|\|\||;)/)) {
    const trimmed = segment.trim()
    if (!/^(pnpm\s+exec\s+|npx\s+)?toolkit\s+/.test(trimmed)) continue
    for (const token of tokens) {
      const pattern = new RegExp(`\\btoolkit\\s+${token.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`)
      if (pattern.test(trimmed)) return token
    }
  }
  return null
}

// 配置文件检测：旧段名与旧闸门键各记一条，file 为实际命中的配置文件
function detectConfigLayer(layer: UpgradeLayer, cwd: string): UpgradeItem[] {
  const file = configFileForLayer(layer, cwd)
  const data = readJsonObject(file)
  if (!data) return []
  const legacySections = Object.keys(CONFIG_LEGACY_SECTIONS).filter((key) => key in data)
  const gateSection = ["skillInstall", "skillsInstall"].find((name) => {
    const section = data[name]
    return Boolean(section && typeof section === "object" && !Array.isArray(section) && "gate" in (section as Record<string, unknown>))
  })
  const actions: string[] = []
  if (legacySections.length > 0) {
    actions.push(
      `重写旧段名：${legacySections
        .map((key) => `${key} → ${CONFIG_LEGACY_SECTIONS[key]}`)
        .join("、")}`,
    )
  }
  if (gateSection) actions.push("把旧键 skillInstall.gate 映射为 skillDelivery")
  if (actions.length === 0) return []
  return [
    {
      id: `config:${layer}`,
      surface: "config",
      layers: [layer],
      action: actions.join("；"),
      risk: "low",
      files: [file],
      reason: "配置文件仍使用 v1 段名或旧闸门键",
      status: "planned",
    },
  ]
}

// 工程文件检测：prepare 旧钩子与 scripts 里的旧命令名
function detectPackage(cwd: string): UpgradeItem[] {
  const file = join(cwd, "package.json")
  const pkg = readJsonObject(file)
  if (!pkg) return []
  const scripts = pkg.scripts && typeof pkg.scripts === "object" && !Array.isArray(pkg.scripts) ? (pkg.scripts as Record<string, unknown>) : {}
  const hits: string[] = []
  for (const [name, value] of Object.entries(scripts)) {
    if (typeof value !== "string") continue
    if (name === "prepare" && LEGACY_PREPARE_SCRIPTS.includes(value.trim())) {
      hits.push(`prepare 钩子旧写法「${value}」`)
      continue
    }
    const matched = legacyCommandIn(value)
    if (matched) hits.push(`${name} 使用旧命令「toolkit ${matched.from}」`)
  }
  if (hits.length === 0) return []
  return [
    {
      id: "project:package",
      surface: "project-file",
      layers: ["project"],
      action: `改写 ${hits.length} 处：${hits.join("；")}`,
      risk: "medium",
      files: [file],
      reason: "工程脚本仍引用 v1 命令或旧 prepare 钩子",
      status: "planned",
    },
  ]
}

// 状态里登记的旧名技能：检测与应用共用，避免两处各实现一遍
export function legacySkillNames(scope: "global" | "project", root: string | null): string[] {
  const state = scope === "global" ? readSkillsState() : root ? readProjectState(root) : null
  if (!state) return []
  const names = new Set<string>()
  for (const source of Object.values(state.sources)) {
    for (const target of source.targets) {
      for (const entry of target.entries) {
        if (entry.name in LEGACY_SKILL_NAMES) names.add(entry.name)
      }
    }
  }
  return [...names]
}

// 技能现场检测：全局 / 项目状态里登记过的旧名产物（只扫本次选中的层）
function detectSkills(cwd: string, layers: readonly UpgradeLayer[]): UpgradeItem[] {
  const enabled = new Set(layers)
  const items: UpgradeItem[] = []
  const projectRoot = findProjectRoot(cwd)
  const globalNames = enabled.has("global") ? legacySkillNames("global", null) : []
  const projectNames = enabled.has("project") ? legacySkillNames("project", projectRoot) : []
  if (globalNames.length > 0) {
    items.push({
      id: "skill:global",
      surface: "skill",
      layers: ["global"],
      action: `清理旧名技能：${globalNames.join("、")}`,
      risk: "medium",
      files: [skillsStateFile()],
      reason: "全局技能状态仍登记 v1 技能名",
      status: "planned",
    })
  }
  if (projectNames.length > 0) {
    items.push({
      id: "skill:project",
      surface: "skill",
      layers: ["project"],
      action: `清理旧名技能：${projectNames.join("、")}`,
      risk: "medium",
      files: [projectStateFile(projectRoot)],
      reason: "项目技能状态仍登记 v1 技能名",
      status: "planned",
    })
  }
  return items
}

// 任务目录：按指定起点读取 task.dir 配置，缺省 .tasks（不依赖进程 cwd）
export function tasksDirFor(cwd: string): string {
  const dir = loadToolkitConfig(cwd)?.task
  const configured = dir && typeof dir === "object" && !Array.isArray(dir) ? (dir as Record<string, unknown>).dir : undefined
  return typeof configured === "string" && configured ? resolve(cwd, configured) : join(cwd, ".tasks")
}

// 规范载体检测：v1 / v2 可自动升级；旧单文件形态交人工
function detectConventions(cwd: string): UpgradeItem[] {
  const tasksDir = tasksDirFor(cwd)
  const legacyFile = join(tasksDir, "conventions.md")
  if (existsSync(legacyFile)) {
    return [
      {
        id: "convention:legacy-single-file",
        surface: "convention",
        layers: ["project"],
        action: "旧单文件规范载体需先迁移为目录形态",
        risk: "high",
        files: [legacyFile],
        reason: "检测到 .tasks/conventions.md 旧单文件形态",
        status: "manual",
        manualHint: "按 conventions-spec 迁移为 .tasks/conventions/ 目录后，再运行 toolkit convention upgrade",
      },
    ]
  }
  const report = conventionsStatus(tasksDir, cwd)
  if (!report.initialized || report.carrierVersion === 3 || report.form === "v3") return []
  return [
    {
      id: "convention:carrier",
      surface: "convention",
      layers: ["project"],
      action: `升级规范载体到 v3（当前形态 ${report.form}）`,
      risk: "medium",
      files: [resolve(cwd, report.dir, "index.md")],
      reason: "规范载体仍为 v1 / v2 形态",
      status: "planned",
    },
  ]
}

// 备份收编检测：配置文件与技能状态旁的 .bak（只扫本次选中的层）
function detectBackups(cwd: string, layers: readonly UpgradeLayer[]): UpgradeItem[] {
  const enabled = new Set(layers)
  const candidates = new Set<string>()
  for (const layer of ALL_LAYERS) {
    if (enabled.has(layer)) candidates.add(`${configFileForLayer(layer, cwd)}.bak`)
  }
  if (enabled.has("global")) candidates.add(`${skillsStateFile()}.bak`)
  if (enabled.has("project")) {
    const projectRoot = findProjectRoot(cwd)
    candidates.add(`${projectStateFile(projectRoot)}.bak`)
  }
  const files = [...candidates].filter((file) => existsSync(file))
  if (files.length === 0) return []
  return [
    {
      id: "backup:legacy",
      surface: "backup",
      layers: ["project"],
      action: `收编 ${files.length} 个历史 .bak 到统一备份目录`,
      risk: "low",
      files,
      reason: "存在旧版遗留的 .bak 备份文件",
      status: "planned",
    },
  ]
}

// CI 文本检测：按行找 toolkit 旧命令，跳过注释与 echo 一类的非执行行
function ciHasLegacyCommand(text: string): boolean {
  const tokens = legacyCommandTokens()
  return text.split("\n").some((line) => {
    if (/^\s*#/.test(line) || /\becho\b/.test(line)) return false
    return tokens.some((token) => new RegExp(`\\btoolkit\\s+${token.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(line))
  })
}

// CI 配置检测：只报告旧命令名，不自动改写
function detectCi(cwd: string): UpgradeItem[] {
  const files: string[] = []
  const workflowDir = join(cwd, ".github", "workflows")
  if (existsSync(workflowDir)) {
    for (const name of readdirSync(workflowDir)) {
      if (/\.ya?ml$/.test(name)) files.push(join(workflowDir, name))
    }
  }
  const gitlab = join(cwd, ".gitlab-ci.yml")
  if (existsSync(gitlab)) files.push(gitlab)
  const hits = files.filter((file) => ciHasLegacyCommand(readFileSync(file, "utf8")))
  if (hits.length === 0) return []
  return [
    {
      id: "project:ci",
      surface: "project-file",
      layers: ["project"],
      action: `CI 配置命中旧命令：${hits.map((file) => basename(file)).join("、")}`,
      risk: "high",
      files: hits,
      reason: "CI 文件不宜自动改写，需人工确认",
      status: "manual",
      manualHint: "按升级页的命令对照表手工替换，避免改坏流水线",
    },
  ]
}

// 汇总检测：按固定顺序返回，保证计划与 diff 稳定
export function detectUpgradeItems(cwd: string, layers: readonly UpgradeLayer[] = ALL_LAYERS): UpgradeItem[] {
  const enabled = new Set(layers)
  const items: UpgradeItem[] = []
  for (const layer of ALL_LAYERS) {
    if (enabled.has(layer)) items.push(...detectConfigLayer(layer, cwd))
  }
  if (enabled.has("project")) {
    items.push(...detectPackage(cwd), ...detectConventions(cwd), ...detectCi(cwd))
  }
  items.push(...detectSkills(cwd, layers))
  items.push(...detectBackups(cwd, layers))
  return items
}

// 需要迁移的自动项数：--check 的退出码只由它决定
export function countAutoResidue(items: UpgradeItem[]): number {
  return items.filter((item) => item.status === "planned").length
}

// 对外暴露全局配置路径，供备份与报告复用
export function globalConfigFile(): string {
  return join(getHomeDir(), ".toolkitrc.json")
}
