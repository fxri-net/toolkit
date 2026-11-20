// 开关解析单测（T-8）：宽松布尔解析与「CLI > 环境变量 > 配置 > 默认值」优先级
import { describe, it, expect, afterEach, vi } from "vitest"
import { parseBool, readEnvWithLegacy, resolveEnabled } from "../switch"

const ENV_KEY = "FX_TEST_SWITCH"

afterEach(() => {
  delete process.env[ENV_KEY]
})

describe("parseBool", () => {
  it("识别开启值（大小写不敏感）", () => {
    for (const v of ["1", "true", "on", "yes", "TRUE", "On"]) expect(parseBool(v, false)).toBe(true)
  })

  it("识别关闭值", () => {
    for (const v of ["0", "false", "off", "no", "OFF", "No"]) expect(parseBool(v, true)).toBe(false)
  })

  it("未知值按默认值兜底", () => {
    expect(parseBool("abc", true)).toBe(true)
    expect(parseBool("", false)).toBe(false)
    expect(parseBool("  ", true)).toBe(true)
  })
})

describe("resolveEnabled 优先级", () => {
  it("CLI 显式值优先于环境变量与配置", () => {
    process.env[ENV_KEY] = "1"
    expect(resolveEnabled(false, ENV_KEY, true, true)).toBe(false)
    expect(resolveEnabled(true, ENV_KEY, false, false)).toBe(true)
  })

  it("环境变量覆盖配置与默认值", () => {
    process.env[ENV_KEY] = "0"
    expect(resolveEnabled(undefined, ENV_KEY, true, true)).toBe(false)
  })

  it("环境变量空串视为未设置，落到配置/默认", () => {
    process.env[ENV_KEY] = ""
    expect(resolveEnabled(undefined, ENV_KEY, false, true)).toBe(false)
    expect(resolveEnabled(undefined, ENV_KEY, undefined, true)).toBe(true)
  })

  it("无环境变量时配置优先于默认值", () => {
    expect(resolveEnabled(undefined, ENV_KEY, true, false)).toBe(true)
    expect(resolveEnabled(undefined, ENV_KEY, undefined, false)).toBe(false)
  })

  it("环境变量非空时始终优先，非法值按默认值兜底", () => {
    process.env[ENV_KEY] = "maybe"
    expect(resolveEnabled(undefined, ENV_KEY, false, true)).toBe(true)
    expect(resolveEnabled(undefined, ENV_KEY, undefined, true)).toBe(true)
  })
})

describe("环境变量旧名兼容", () => {
  afterEach(() => {
    delete process.env.FX_TEST_NEW
    delete process.env.FX_TEST_LEGACY
    vi.restoreAllMocks()
  })

  it("新旧并存时取新名且不告警", () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {})
    process.env.FX_TEST_NEW = "new"
    process.env.FX_TEST_LEGACY = "legacy"
    expect(readEnvWithLegacy("FX_TEST_NEW", ["FX_TEST_LEGACY"])).toBe("new")
    expect(warn).not.toHaveBeenCalled()
  })

  it("仅旧名时仍生效并告警一次", () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {})
    process.env.FX_TEST_LEGACY = "legacy"
    expect(readEnvWithLegacy("FX_TEST_NEW", ["FX_TEST_LEGACY"])).toBe("legacy")
    expect(warn).toHaveBeenCalledTimes(1)
    const message = String(warn.mock.calls[0]?.[0] ?? "")
    expect(message).toContain("FX_TEST_LEGACY")
    expect(message).toContain("FX_TEST_NEW")
  })

  it("新旧都未设置时返回 undefined 且不告警", () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(readEnvWithLegacy("FX_TEST_NEW", ["FX_TEST_LEGACY"])).toBeUndefined()
    expect(warn).not.toHaveBeenCalled()
  })
})
