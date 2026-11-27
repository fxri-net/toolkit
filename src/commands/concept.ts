// 概念目录：给 AI 读取的概念清单与采纳步骤；本仓参考实现另存 reference.json，不混入概念本体
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { Command } from "commander"
import { assertJsonFormat, jsonEnvelope } from "../json-output"
import { isContractVersion, type ContractVersion } from "../contract-version"
import { line, style } from "../term-style"
import { printJson } from "./shared"

// 概念分类与落地形态：与 schemas/concept-catalog.schema.json 的枚举一致
export const CONCEPT_CATEGORIES = ["engineering", "delivery", "safety", "collaboration", "distribution", "platform"] as const
export const CONCEPT_ADOPTION = ["generic", "tooling"] as const

export const CONCEPT_CATALOG_VERSION: ContractVersion = "1.1"
export const CONCEPT_REFERENCE_VERSION: ContractVersion = "1.1"

export type ConceptCategory = (typeof CONCEPT_CATEGORIES)[number]
export type ConceptAdoption = (typeof CONCEPT_ADOPTION)[number]

// 落地形态的人读文案：机器键只进 JSON
const ADOPTION_LABELS: Record<ConceptAdoption, string> = { generic: "通用", tooling: "需工具" }

export interface ConceptVariant {
  id: string
  name: string
  summary: string
}

export interface Concept {
  id: string
  name: string
  aliases: string[]
  category: ConceptCategory
  summary: string
  problem: string
  value: string[]
  adoptionLevel: ConceptAdoption
  signals: string[]
  variants: ConceptVariant[]
  related: string[]
  adoption: { prerequisites: string[]; steps: { title: string; detail: string }[]; files: string[] }
  cost: { effort: "low" | "medium" | "high"; risk: "low" | "medium" | "high"; reversible: boolean }
  examples: string[]
}

export interface ConceptBundle {
  id: string
  name: string
  summary: string
  concepts: string[]
}

export interface ConceptCatalog {
  schemaVersion: ContractVersion
  concepts: Concept[]
  bundles: ConceptBundle[]
}

// 本仓参考实现：按概念 id 登记命令 / 技能 / 模板 / 检查
export interface ConceptReferenceEntry {
  commands: string[]
  skills: string[]
  templates: string[]
  checks: string[]
}

export interface ConceptReferenceCatalog {
  schemaVersion: ContractVersion
  note: string
  references: Record<string, ConceptReferenceEntry>
}

// 从模块位置向上找包根：源码在 src/commands，产物在 dist，安装后都能定位 concepts/
function packageRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  while (dir !== dirname(dir)) {
    const pkg = join(dir, "package.json")
    if (existsSync(pkg)) {
      try {
        if ((JSON.parse(readFileSync(pkg, "utf8")) as { name?: string }).name === "@fxri/toolkit") return dir
      } catch {
        // 非法 package.json 继续向上找
      }
    }
    dir = dirname(dir)
  }
  throw new Error("未找到 @fxri/toolkit 包根，无法读取概念目录")
}

let cached: ConceptCatalog | null = null
let cachedReferences: ConceptReferenceCatalog | null = null

// 读取概念目录：只读一次，供 list / show 共用
export function readConceptCatalog(): ConceptCatalog {
  if (cached) return cached
  const file = join(packageRoot(), "concepts", "catalog.json")
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"))
  } catch (error) {
    throw new Error(`概念目录不可读：${file}（${(error as Error).message}）`, { cause: error })
  }
  const catalog = parsed as ConceptCatalog
  if (!Array.isArray(catalog.concepts) || !Array.isArray(catalog.bundles)) {
    throw new Error(`概念目录结构异常：${file}`)
  }
  if (!isContractVersion(catalog.schemaVersion, CONCEPT_CATALOG_VERSION)) {
    throw new Error(`概念目录契约版本应为 ${CONCEPT_CATALOG_VERSION}（实际：${String(catalog.schemaVersion)}）：${file}`)
  }
  cached = catalog
  return catalog
}

// 读取本仓参考实现：与概念本体分开存放，缺失时按空处理
export function readConceptReferences(): ConceptReferenceCatalog {
  if (cachedReferences) return cachedReferences
  const file = join(packageRoot(), "concepts", "reference.json")
  if (!existsSync(file)) {
    cachedReferences = { schemaVersion: CONCEPT_REFERENCE_VERSION, note: "", references: {} }
    return cachedReferences
  }
  const parsed = JSON.parse(readFileSync(file, "utf8")) as ConceptReferenceCatalog
  if (!isContractVersion(parsed.schemaVersion, CONCEPT_REFERENCE_VERSION)) {
    throw new Error(`参考实现契约版本应为 ${CONCEPT_REFERENCE_VERSION}（实际：${String(parsed.schemaVersion)}）：${file}`)
  }
  cachedReferences = parsed
  return cachedReferences
}

interface ListOptions {
  category?: string
  adoption?: string
  format?: string
}

function parseCategory(value: string | undefined): ConceptCategory | undefined | false {
  if (value === undefined) return undefined
  if ((CONCEPT_CATEGORIES as readonly string[]).includes(value)) return value as ConceptCategory
  console.error(`⚠️ --category 只接受 ${CONCEPT_CATEGORIES.join(" / ")}（实际：${value}）`)
  process.exitCode = 1
  return false
}

function parseAdoption(value: string | undefined): ConceptAdoption | undefined | false {
  if (value === undefined) return undefined
  if ((CONCEPT_ADOPTION as readonly string[]).includes(value)) return value as ConceptAdoption
  console.error(`⚠️ --adoption 只接受 ${CONCEPT_ADOPTION.join(" / ")}（实际：${value}）`)
  process.exitCode = 1
  return false
}

function filterConcepts(catalog: ConceptCatalog, category?: ConceptCategory, adoption?: ConceptAdoption): Concept[] {
  return catalog.concepts.filter((item) => {
    if (category && item.category !== category) return false
    if (adoption && item.adoptionLevel !== adoption) return false
    return true
  })
}

function printConceptList(concepts: Concept[], category?: ConceptCategory, adoption?: ConceptAdoption): void {
  const scope = [category ? `分类 ${category}` : "", adoption ? `落地形态 ${ADOPTION_LABELS[adoption]}` : ""].filter(Boolean).join("，")
  console.log(`概念目录${scope ? `（${scope}）` : ""}，共 ${concepts.length} 项：`)
  for (const item of concepts) {
    console.log(`  ${style.accent(item.id.padEnd(24))} ${item.name}  [${ADOPTION_LABELS[item.adoptionLevel]}]  ${item.summary}`)
  }
  console.log(line.hint("查看采纳步骤：toolkit concept show <id>；JSON：toolkit concept list --format json"))
}

function printConcept(concept: Concept, reference: ConceptReferenceEntry | null): void {
  console.log(`${concept.name}（${concept.id}）`)
  console.log(`  分类：${concept.category}　落地形态：${ADOPTION_LABELS[concept.adoptionLevel]}`)
  console.log(`  一句话：${concept.summary}`)
  console.log(`  解决：${concept.problem}`)
  console.log(`  变体：${concept.variants.map((item) => `${item.name}（${item.id}）`).join("、")}`)
  console.log("  采纳步骤：")
  for (const [index, step] of concept.adoption.steps.entries()) {
    console.log(`    ${index + 1}. ${step.title}：${step.detail}`)
  }
  console.log(`  成本：${concept.cost.effort}　风险：${concept.cost.risk}　可逆：${concept.cost.reversible ? "是" : "否"}`)
  if (!reference) return
  // 参考实现单独成段：需要安装本工具，与概念本体区分
  console.log(line.hint("  本仓参考实现（可选，需安装 @fxri/toolkit）："))
  if (reference.commands.length > 0) console.log(line.hint(`    命令：${reference.commands.join("、")}`))
  if (reference.skills.length > 0) console.log(line.hint(`    技能：${reference.skills.join("、")}`))
  if (reference.templates.length > 0) console.log(line.hint(`    模板：${reference.templates.join("、")}`))
  if (reference.checks.length > 0) console.log(line.hint(`    检查：${reference.checks.join("、")}`))
}

export function registerConceptCommands(program: Command): void {
  const conceptCmd = program.command("concept").description("概念目录：查看可引入的工程概念与采纳步骤（默认列出）")

  const addCommon = (cmd: Command): Command =>
    cmd
      .option("--category <category>", `按分类过滤：${CONCEPT_CATEGORIES.join(" / ")}`)
      .option("--adoption <level>", `按落地形态过滤：${CONCEPT_ADOPTION.join(" / ")}`)
      .option("--format <format>", "输出格式（json，输出到 stdout）")

  const list = (options: ListOptions): void => {
    const category = parseCategory(options.category)
    const adoption = parseAdoption(options.adoption)
    if (category === false || adoption === false || !assertJsonFormat(options.format)) return
    const catalog = readConceptCatalog()
    const concepts = filterConcepts(catalog, category, adoption)
    if (options.format === "json") {
      printJson(jsonEnvelope({ command: "concept list", data: { category: category ?? null, adoption: adoption ?? null, concepts } }))
      return
    }
    printConceptList(concepts, category, adoption)
  }

  addCommon(conceptCmd).action(list)
  addCommon(conceptCmd.command("list").description("列出概念目录")).action(list)

  conceptCmd
    .command("show <id>")
    .description("查看单个概念的采纳步骤")
    .option("--format <format>", "输出格式（json，输出到 stdout）")
    .action((id: string, options: { format?: string }) => {
      if (!assertJsonFormat(options.format)) return
      const catalog = readConceptCatalog()
      const concept = catalog.concepts.find((item) => item.id === id)
      if (!concept) {
        console.error(`⚠️ 未找到概念「${id}」；可用：toolkit concept list`)
        process.exitCode = 1
        return
      }
      const reference = readConceptReferences().references[concept.id] ?? null
      if (options.format === "json") {
        printJson(jsonEnvelope({ command: "concept show", data: { concept, reference } }))
        return
      }
      printConcept(concept, reference)
    })
}
