// 概念目录：结构、引用与 schema 契约（测试从 schema 读取必填项，不复制字段清单）
import { describe, expect, it } from "vitest"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { COMMAND_REGISTRY } from "../command-registry"

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

interface Catalog {
  schemaVersion: number
  concepts: Array<Record<string, unknown> & { id: string; related: string[]; variants: Array<{ id: string }>; support: ConceptSupport }>
  bundles: Array<Record<string, unknown> & { id: string; concepts: string[] }>
}

const schema = readJson<Schema>("schemas/concept-catalog.schema.json")
const catalog = readJson<Catalog>("concepts/catalog.json")

describe("概念目录", () => {
  it("包含 28 个概念与 5 个概念包", () => {
    expect(catalog.schemaVersion).toBe(1)
    expect(catalog.concepts).toHaveLength(28)
    expect(catalog.bundles).toHaveLength(5)
  })

  it("每个概念满足 schema 的必填字段与枚举", () => {
    const required = schema.$defs.concept.required
    const categories = schema.$defs.concept.properties.category?.enum ?? []
    const maturities = schema.$defs.concept.properties.maturity?.enum ?? []
    const idPattern = new RegExp(schema.$defs.concept.properties.id?.pattern as string)
    for (const concept of catalog.concepts) {
      for (const key of required) expect(concept, `${concept.id} 缺少 ${key}`).toHaveProperty(key)
      expect(idPattern.test(concept.id), `id 非法：${concept.id}`).toBe(true)
      expect(categories, `分类非法：${concept.id}`).toContain(concept.category)
      expect(maturities, `成熟度非法：${concept.id}`).toContain(concept.maturity)
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

  it("support 引用的命令、技能、模板与检查均存在", () => {
    const commands = new Set(COMMAND_REGISTRY.map((entry) => `toolkit ${entry.path}`))
    const skills = new Set(
      readdirSync(join(root, "skills"), { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(join(root, "skills", entry.name, "SKILL.md")))
        .map((entry) => entry.name),
    )
    for (const concept of catalog.concepts) {
      for (const command of concept.support.commands) {
        expect(commands.has(command), `${concept.id} 引用了不存在的命令 ${command}`).toBe(true)
      }
      for (const skill of concept.support.skills) {
        expect(skills.has(skill), `${concept.id} 引用了不存在的技能 ${skill}`).toBe(true)
      }
      for (const path of [...concept.support.templates, ...concept.support.checks]) {
        expect(existsSync(join(root, path)), `${concept.id} 引用了不存在的路径 ${path}`).toBe(true)
      }
    }
  })
})
