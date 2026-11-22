// 事件 schema 与类型契约一致性：枚举、必填字段与可选字段三处同源，任一处漂移即失败
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { AGENT_ADAPTERS } from "../usage/adapters"
import {
  SKILL_USAGE_EVENT_OPTIONAL,
  SKILL_USAGE_EVENT_REQUIRED,
  USAGE_EVENT_AGENTS,
  USAGE_MANAGED_BY,
  USAGE_OUTCOMES,
  USAGE_SKILL_SOURCES,
  type SkillUsageEvent,
} from "../usage/types"

interface EventSchema {
  required: string[]
  properties: Record<string, { enum?: string[]; const?: unknown }>
}

// 读取随包分发的事件 schema：路径相对测试文件定位，避免依赖运行目录
function readSchema(): EventSchema {
  const file = join(process.cwd(), "schemas", "skill-usage-event.v1.json")
  return JSON.parse(readFileSync(file, "utf8")) as EventSchema
}

// 类型工具：取接口的必填键与可选键，用于编译期断言
type RequiredKeys<T> = { [K in keyof T]-?: undefined extends T[K] ? never : K }[keyof T]
type OptionalKeys<T> = Exclude<keyof T, RequiredKeys<T>>
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false

describe("技能使用事件 schema 与类型一致", () => {
  const schema = readSchema()

  it("必填字段与接口一致", () => {
    expect(schema.required).toEqual([...SKILL_USAGE_EVENT_REQUIRED])
    const aligned: Equal<RequiredKeys<SkillUsageEvent>, (typeof SKILL_USAGE_EVENT_REQUIRED)[number]> = true
    expect(aligned).toBe(true)
  })

  it("属性集合与接口字段一致", () => {
    expect(Object.keys(schema.properties).sort()).toEqual([...SKILL_USAGE_EVENT_REQUIRED, ...SKILL_USAGE_EVENT_OPTIONAL].sort())
    const aligned: Equal<OptionalKeys<SkillUsageEvent>, (typeof SKILL_USAGE_EVENT_OPTIONAL)[number]> = true
    expect(aligned).toBe(true)
  })

  it("枚举取值与常量一致", () => {
    expect(schema.properties.agent?.enum).toEqual([...USAGE_EVENT_AGENTS])
    expect(schema.properties.skillSource?.enum).toEqual([...USAGE_SKILL_SOURCES])
    expect(schema.properties.managedBy?.enum).toEqual([...USAGE_MANAGED_BY])
    expect(schema.properties.outcome?.enum).toEqual([...USAGE_OUTCOMES])
    expect(schema.properties.schemaVersion?.const).toBe(1)
  })

  it("内置适配器的 id 均在 agent 枚举内", () => {
    for (const adapter of AGENT_ADAPTERS) expect(USAGE_EVENT_AGENTS).toContain(adapter.id)
  })
})
