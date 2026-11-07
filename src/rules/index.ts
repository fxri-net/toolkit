// 规则清单与组合：从包内 templates/rules 读取，CLI 与文档站共用同一份模块真源
import { existsSync } from "node:fs"
import { join } from "node:path"
import { skillsPackageDir } from "../skills"
import { readTextFile } from "../read-text"
import { composeModules, isRuleAnchor, type RuleModule } from "./core"

export interface RuleModuleMeta {
  id: string
  title: string
  summary: string
  file: string
}

export interface RulePage {
  page: string
  modules: string[]
}

export interface Ruleset {
  schema: number
  modules: RuleModuleMeta[]
  presets: Record<string, string[]>
  pages: RulePage[]
}

export interface RuleDefinition extends RuleModule {
  title: string
  summary: string
  file: string
}

export interface RuleListModule extends RuleModuleMeta {
  anchor: string
  presets: string[]
}

export interface RuleList {
  modules: RuleListModule[]
  presets: Record<string, string[]>
  pages: RulePage[]
}

// 模块真源目录：随包分发，安装后无需 docs/ 即可组合
export function defaultRulesDir(): string {
  return join(skillsPackageDir(), "templates", "rules")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

// 读取并校验清单：id 唯一、预设 / 页面只引用已知模块，避免运行期才暴露拼写错误
export function loadRuleset(dir = defaultRulesDir()): Ruleset {
  const file = join(dir, "ruleset.json")
  if (!existsSync(file)) throw new Error(`规则清单不存在：${file}`)
  const parsed = JSON.parse(readTextFile(file)) as unknown
  if (!isRecord(parsed) || parsed.schema !== 1) throw new Error(`规则清单格式不合法（schema 须为 1）：${file}`)
  if (!Array.isArray(parsed.modules) || !isRecord(parsed.presets) || !Array.isArray(parsed.pages)) {
    throw new Error(`规则清单缺少 modules / presets / pages：${file}`)
  }
  const modules: RuleModuleMeta[] = parsed.modules.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      typeof item.title !== "string" ||
      typeof item.summary !== "string" ||
      typeof item.file !== "string"
    ) {
      throw new Error(`规则清单存在不合法的模块条目：${file}`)
    }
    return { id: item.id, title: item.title, summary: item.summary, file: item.file }
  })
  const ids = new Set<string>()
  for (const mod of modules) {
    if (ids.has(mod.id)) throw new Error(`规则清单存在重复模块 id「${mod.id}」：${file}`)
    ids.add(mod.id)
  }
  const presets: Record<string, string[]> = {}
  for (const [name, value] of Object.entries(parsed.presets)) {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
      throw new Error(`规则预设「${name}」须为模块 id 数组：${file}`)
    }
    for (const id of value as string[]) {
      if (!ids.has(id)) throw new Error(`规则预设「${name}」引用了未知模块「${id}」：${file}`)
    }
    presets[name] = value as string[]
  }
  const pages: RulePage[] = parsed.pages.map((item) => {
    if (!isRecord(item) || typeof item.page !== "string" || !Array.isArray(item.modules)) {
      throw new Error(`规则清单存在不合法的页面映射：${file}`)
    }
    for (const id of item.modules as unknown[]) {
      if (typeof id !== "string" || !ids.has(id)) throw new Error(`规则页面「${item.page}」引用了未知模块「${String(id)}」：${file}`)
    }
    return { page: item.page, modules: item.modules as string[] }
  })
  return { schema: 1, modules, presets, pages }
}

// 读取模块正文：首行为锚点，其余为可组合正文
export function loadRuleModules(dir = defaultRulesDir()): RuleDefinition[] {
  return loadRuleset(dir).modules.map((meta) => {
    const file = join(dir, meta.file)
    if (!existsSync(file)) throw new Error(`规则模块文件不存在：${file}`)
    const lines = readTextFile(file).replace(/\r\n/g, "\n").split("\n")
    const anchor = (lines[0] ?? "").trim().replace(/^> 规则更新时间\s+/, "")
    if (!isRuleAnchor(anchor)) throw new Error(`规则模块「${meta.id}」首行缺少更新时间锚点：${file}`)
    const body = lines.slice(1).join("\n").trim()
    if (!body) throw new Error(`规则模块「${meta.id}」正文为空：${file}`)
    return { ...meta, anchor, body }
  })
}

// 组合指定模块：ids 顺序即输出顺序
export function composeRules(ids: string[], options: { dir?: string; anchor?: boolean } = {}): string {
  return composeModules(loadRuleModules(options.dir), ids, { anchor: options.anchor })
}

// 列出模块、预设、页面与当前锚点，供 CLI list / JSON 输出
export function listRules(dir = defaultRulesDir()): RuleList {
  const ruleset = loadRuleset(dir)
  const definitions = loadRuleModules(dir)
  return {
    presets: ruleset.presets,
    pages: ruleset.pages,
    modules: definitions.map((mod) => ({
      id: mod.id,
      title: mod.title,
      summary: mod.summary,
      file: mod.file,
      anchor: mod.anchor,
      presets: Object.entries(ruleset.presets)
        .filter(([, ids]) => ids.includes(mod.id))
        .map(([name]) => name),
    })),
  }
}
