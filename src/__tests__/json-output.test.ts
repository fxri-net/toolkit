// 机器可读输出单测：JSON 序列化的 schemaVersion 锚点契约、统一信封字段与缺省推导，以及 --format 取值门禁
// 门禁覆盖各命令的 --format 校验（非法值告警并置退出码 1），防止新增命令漏接校验
import { afterEach, describe, expect, it, vi } from "vitest"
import { toJsonText, assertJsonFormat, jsonEnvelope, JSON_ENVELOPE_VERSION } from "../json-output"

afterEach(() => {
  vi.restoreAllMocks()
  process.exitCode = undefined
})

describe("toJsonText", () => {
  it("顶层前置 schemaVersion 锚点，载荷字段保持原位", () => {
    const text = toJsonText({ duration: { count: 1 } })
    expect(text.startsWith(`{\n  "schemaVersion": "${JSON_ENVELOPE_VERSION}",`)).toBe(true)
    expect(JSON.parse(text)).toEqual({ schemaVersion: JSON_ENVELOPE_VERSION, duration: { count: 1 } })
  })
})

describe("jsonEnvelope", () => {
  it("固定八键与键序：schemaVersion / command / code / message / data / extend / debug / issues", () => {
    const parsed = JSON.parse(toJsonText(jsonEnvelope({ command: "status", data: { initialized: true } }))) as Record<string, unknown>
    expect(Object.keys(parsed)).toEqual(["schemaVersion", "command", "code", "message", "data", "extend", "debug", "issues"])
    expect(parsed).toEqual({
      schemaVersion: JSON_ENVELOPE_VERSION,
      command: "status",
      code: 200,
      message: "成功",
      data: { initialized: true },
      extend: { exitCode: 0 },
      debug: {},
      issues: [],
    })
  })

  it("无 issues 时 code 取 200、message 取「成功」，extend 与 debug 仍为对象", () => {
    const parsed = jsonEnvelope({ command: "task stats", data: {} })
    expect(parsed.code).toBe(200)
    expect(parsed.message).toBe("成功")
    expect(parsed.extend).toEqual({ exitCode: 0 })
    expect(parsed.debug).toEqual({})
    expect(parsed.issues).toEqual([])
  })

  it("只含 warn / info 时 code 仍为 200，message 汇总提示条数", () => {
    const parsed = jsonEnvelope({
      command: "config status",
      data: {},
      issues: [
        { level: "warn", scope: "配置", message: "告警一" },
        { level: "info", scope: "配置", message: "说明二" },
      ],
    })
    expect(parsed.code).toBe(200)
    expect(parsed.message).toBe("成功（2 项提示）")
  })

  it("含 error 时缺省 code 取 422、message 取首条 error 文案", () => {
    const parsed = jsonEnvelope({
      command: "docs check",
      data: {},
      issues: [
        { level: "warn", scope: "导航", message: "告警" },
        { level: "error", scope: "导航", message: "导航缺少顶栏" },
        { level: "error", scope: "产物", message: "sitemap 含 404" },
      ],
    })
    expect(parsed.code).toBe(422)
    expect(parsed.message).toBe("导航缺少顶栏")
  })

  it("显式 code / message / exitCode 优先于缺省推导，且 extend 内同名键不能覆盖 exitCode", () => {
    const parsed = jsonEnvelope({
      command: "skill lint",
      code: 422,
      message: "自定义结论",
      data: {},
      exitCode: 1,
      extend: { exitCode: 0, strict: true },
      debug: { elapsed: 12 },
    })
    expect(parsed.code).toBe(422)
    expect(parsed.message).toBe("自定义结论")
    expect(parsed.extend).toEqual({ exitCode: 1, strict: true })
    expect(parsed.debug).toEqual({ elapsed: 12 })
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
