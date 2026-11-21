// 机器可读输出单测：JSON 序列化的 schemaVersion 锚点契约，以及 --format 取值门禁
// 门禁覆盖各命令的 --format 校验（非法值告警并置退出码 1），防止新增命令漏接校验
import { afterEach, describe, expect, it, vi } from "vitest"
import { toJsonText, assertJsonFormat, jsonEnvelope } from "../json-output"

afterEach(() => {
  vi.restoreAllMocks()
  process.exitCode = undefined
})

describe("toJsonText", () => {
  it("顶层前置 schemaVersion 锚点，载荷字段保持原位", () => {
    const text = toJsonText({ duration: { count: 1 } })
    expect(text.startsWith('{\n  "schemaVersion": 1,')).toBe(true)
    expect(JSON.parse(text)).toEqual({ schemaVersion: 1, duration: { count: 1 } })
  })
})

describe("jsonEnvelope", () => {
  it("固定 command / ok / data / issues 四字段，schemaVersion 由序列化统一前置", () => {
    const issue = { level: "warn" as const, scope: "文档站", message: "导航告警" }
    const parsed = JSON.parse(toJsonText(jsonEnvelope("status", false, { initialized: true }, [issue]))) as Record<string, unknown>
    expect(parsed).toEqual({
      schemaVersion: 1,
      command: "status",
      ok: false,
      data: { initialized: true },
      issues: [issue],
    })
  })
})

describe("assertJsonFormat", () => {
  it("未指定或指定 json 时放行，不置退出码", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(assertJsonFormat(undefined)).toBe(true)
    expect(assertJsonFormat("json")).toBe(true)
    expect(process.exitCode).toBeUndefined()
    expect(err).not.toHaveBeenCalled()
  })

  it("非法取值告警、置退出码 1 并返回 false（调用方据此提前 return）", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(assertJsonFormat("xml")).toBe(false)
    expect(process.exitCode).toBe(1)
    expect(err).toHaveBeenCalledWith("⚠️ 不支持的输出格式「xml」，仅支持 json")
  })
})
