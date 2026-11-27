// 概念目录：给 AI 读取的概念清单与采纳步骤
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { Command } from "commander"
import { assertJsonFormat, jsonEnvelope } from "../json-output"
import { isContractVersion, type ContractVersion } from "../contract-version"
import { line, style } from "../term-style"
import { printJson } from "./shared"

// 概念分类与成熟度：与 schemas/concept-catalog.schema.json 的枚举一致
export const CONCEPT_CATEGORIES = ["engineering", "delivery", "safety", "collaboration", "distribution", "platform"] as const
export const CONCEPT_MATURITY = ["ready", "partial", "repo-only"] as const

export const CONCEPT_CATALOG_VERSION: ContractVersion = "1.0"

export type ConceptCategory = (typeof CONCEPT_CATEGORIES)[number]
export type ConceptMaturity = (typeof CONCEPT_MATURITY)[number]

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
  maturity: ConceptMaturity
  signals: string[]
  variants: ConceptVariant[]
  related: string[]
  support: { commands: string[]; skills: string[]; templates: string[]; checks: string[] }
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

interface ListOptions {
  category?: string
  maturity?: string
  format?: string
}

function parseCategory(value: string | undefined): ConceptCategory | undefined | false {
  if (value === undefined) return undefined
  if ((CONCEPT_CATEGORIES as readonly string[]).includes(value)) return value as ConceptCategory
  console.error(`⚠️ --category 只接受 ${CONCEPT_CATEGORIES.join(" / ")}（实际：${value}）`)
  process.exitCode = 1
  return false
}

function parseMaturity(value: string | undefined): ConceptMaturity | undefined | false {
  if (value === undefined) return undefined
  if ((CONCEPT_MATURITY as readonly string[]).includes(value)) return value as ConceptMaturity
  console.error(`⚠️ --maturity 只接受 ${CONCEPT_MATURITY.join(" / ")}（实际：${value}）`)
  process.exitCode = 1
  return false
}

function filterConcepts(catalog: ConceptCatalog, category?: ConceptCategory, maturity?: ConceptMaturity): Concept[] {
  return catalog.concepts.filter((item) => {
    if (category && item.category !== category) return false
    if (maturity && item.maturity !== maturity) return false
    return true
  })
}

function printConceptList(concepts: Concept[], category?: ConceptCategory, maturity?: ConceptMaturity): void {
  const scope = [category ? `分类 ${category}` : "", maturity ? `成熟度 ${maturity}` : ""].filter(Boolean).join("，")
  console.log(`概念目录${scope ? `（${scope}）` : ""}，共 ${concepts.length} 项：`)
  for (const item of concepts) {
    console.log(`  ${style.accent(item.id.padEnd(24))} ${item.name}  [${item.maturity}]  ${item.summary}`)
  }
  console.log(line.hint("查看采纳步骤：toolkit concept show <id>；JSON：toolkit concept list --format json"))
}

function printConcept(concept: Concept): void {
  console.log(`${concept.name}（${concept.id}）`)
  console.log(`  分类：${concept.category}　成熟度：${concept.maturity}`)
  console.log(`  一句话：${concept.summary}`)
  console.log(`  解决：${concept.problem}`)
  console.log(`  变体：${concept.variants.map((item) => `${item.name}（${item.id}）`).join("、")}`)
  if (concept.support.commands.length > 0) console.log(`  可用命令：${concept.support.commands.join("、")}`)
  if (concept.support.skills.length > 0) console.log(`  相关技能：${concept.support.skills.join("、")}`)
  console.log("  采纳步骤：")
  for (const [index, step] of concept.adoption.steps.entries()) {
    console.log(`    ${index + 1}. ${step.title}：${step.detail}`)
  }
  console.log(`  成本：${concept.cost.effort}　风险：${concept.cost.risk}　可逆：${concept.cost.reversible ? "是" : "否"}`)
}

export function registerConceptCommands(program: Command): void {
  const conceptCmd = program.command("concept").description("概念目录：查看可引入的工程概念与采纳步骤（默认列出）")

  const addCommon = (cmd: Command): Command =>
    cmd
      .option("--category <category>", `按分类过滤：${CONCEPT_CATEGORIES.join(" / ")}`)
      .option("--maturity <level>", `按成熟度过滤：${CONCEPT_MATURITY.join(" / ")}`)
      .option("--format <format>", "输出格式（json，输出到 stdout）")

  const list = (options: ListOptions): void => {
    const category = parseCategory(options.category)
    const maturity = parseMaturity(options.maturity)
    if (category === false || maturity === false || !assertJsonFormat(options.format)) return
    const catalog = readConceptCatalog()
    const concepts = filterConcepts(catalog, category, maturity)
    if (options.format === "json") {
      printJson(jsonEnvelope({ command: "concept list", data: { category: category ?? null, maturity: maturity ?? null, concepts } }))
      return
    }
    printConceptList(concepts, category, maturity)
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
      if (options.format === "json") {
        printJson(jsonEnvelope({ command: "concept show", data: { concept } }))
        return
      }
      printConcept(concept)
    })
}
