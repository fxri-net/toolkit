// 概念目录：结构、引用与「概念本体不含本仓实现」的机械校验（测试从 schema 读取必填项，不复制字段清单）
import { describe, expect, it } from "vitest"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { COMMAND_REGISTRY } from "../command-registry"
import { CONCEPT_CATALOG_VERSION, CONCEPT_REFERENCE_VERSION } from "../commands/concept"

const root = process.cwd()

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(join(root, file), "utf8")) as T
}

interface ConceptSupport {
  commands: string[]
  skills: string[]
  templates: string[]
  checks: string[]
}

interface Schema {
  $defs: {
    concept: { required: string[]; properties: Record<string, { enum?: string[]; pattern?: string }> }
    bundle: { required: string[]; properties: Record<string, { pattern?: string }> }
  }
}

interface ReferenceSchema {
  $defs: { entry: { required: string[] } }
}

interface Catalog {
  schemaVersion: string
  concepts: Array<Record<string, unknown> & { id: string; related: string[]; variants: Array<{ id: string }> }>
  bundles: Array<Record<string, unknown> & { id: string; concepts: string[] }>
}

interface ReferenceCatalog {
  schemaVersion: string
  note: string
  references: Record<string, ConceptSupport>
}

const schema = readJson<Schema>("schemas/concept-catalog.schema.json")
const referenceSchema = readJson<ReferenceSchema>("schemas/concept-reference.schema.json")
const catalog = readJson<Catalog>("concepts/catalog.json")
const references = readJson<ReferenceCatalog>("concepts/reference.json")

// 概念本体出现这些标记即说明本仓实现细节泄漏回了概念层
const REPO_MARKERS = [/\btoolkit\b/, /fxri-/, /\bsrc\//, /\btemplates\//, /\bconcepts\//]

function collectStrings(value: unknown, path = ""): Array<{ path: string; text: string }> {
  if (typeof value === "string") return [{ path, text: value }]
  if (Array.isArray(value)) return value.flatMap((item, index) => collectStrings(item, `${path}[${index}]`))
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => collectStrings(item, path ? `${path}.${key}` : key))
  }
  return []
}

describe("概念目录", () => {
  it("目录非空，契约版本与常量一致", () => {
    expect(catalog.schemaVersion).toBe(CONCEPT_CATALOG_VERSION)
    expect(catalog.concepts.length).toBeGreaterThan(0)
  })

  it("每个概念满足 schema 的必填字段与枚举", () => {
    const required = schema.$defs.concept.required
    const categories = schema.$defs.concept.properties.category?.enum ?? []
    const adoptions = schema.$defs.concept.properties.adoptionLevel?.enum ?? []
    const idPattern = new RegExp(schema.$defs.concept.properties.id?.pattern as string)
    for (const concept of catalog.concepts) {
      for (const key of required) expect(concept, `${concept.id} 缺少 ${key}`).toHaveProperty(key)
      expect(idPattern.test(concept.id), `id 非法：${concept.id}`).toBe(true)
      expect(categories, `分类非法：${concept.id}`).toContain(concept.category)
      expect(adoptions, `落地形态非法：${concept.id}`).toContain(concept.adoptionLevel)
      for (const variant of concept.variants) expect(idPattern.test(variant.id), `变体 id 非法：${variant.id}`).toBe(true)
    }
  })

  it("概念 id 唯一，related 与概念包引用可解析", () => {
    const ids = new Set(catalog.concepts.map((concept) => concept.id))
    expect(ids.size).toBe(catalog.concepts.length)
    for (const concept of catalog.concepts) {
      for (const related of concept.related) expect(ids.has(related), `${concept.id} 引用了不存在的概念 ${related}`).toBe(true)
    }
    for (const bundle of catalog.bundles) {
      for (const key of schema.$defs.bundle.required) expect(bundle, `${bundle.id} 缺少 ${key}`).toHaveProperty(key)
      for (const id of bundle.concepts) expect(ids.has(id), `概念包 ${bundle.id} 引用了不存在的概念 ${id}`).toBe(true)
    }
  })

  it("概念正文不含本仓实现标记", () => {
    const hits: string[] = []
    for (const concept of catalog.concepts) {
      for (const { path, text } of collectStrings(concept, concept.id)) {
        if (REPO_MARKERS.some((pattern) => pattern.test(text))) hits.push(`${path}：${text}`)
      }
    }
    expect(hits).toEqual([])
  })
})

describe("概念参考实现", () => {
  it("契约版本与常量一致，条目不指向不存在的概念", () => {
    expect(references.schemaVersion).toBe(CONCEPT_REFERENCE_VERSION)
    expect(references.note.length).toBeGreaterThan(0)
    const ids = new Set(catalog.concepts.map((concept) => concept.id))
    for (const id of Object.keys(references.references)) {
      expect(ids.has(id), `参考实现指向不存在的概念 ${id}`).toBe(true)
    }
  })

  it("参考实现引用的命令、技能、模板与检查均存在", () => {
    const commands = new Set(COMMAND_REGISTRY.map((entry) => `toolkit ${entry.path}`))
    const skills = new Set(
      readdirSync(join(root, "skills"), { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(join(root, "skills", entry.name, "SKILL.md")))
        .map((entry) => entry.name),
    )
    for (const [id, entry] of Object.entries(references.references)) {
      for (const key of referenceSchema.$defs.entry.required) expect(entry, `${id} 缺少 ${key}`).toHaveProperty(key)
      for (const command of entry.commands) {
        expect(commands.has(command), `${id} 引用了不存在的命令 ${command}`).toBe(true)
      }
      for (const skill of entry.skills) {
        expect(skills.has(skill), `${id} 引用了不存在的技能 ${skill}`).toBe(true)
      }
      for (const path of [...entry.templates, ...entry.checks]) {
        expect(existsSync(join(root, path)), `${id} 引用了不存在的路径 ${path}`).toBe(true)
      }
    }
  })
})
