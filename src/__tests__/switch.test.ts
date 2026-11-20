// 开关解析单测（T-8）：宽松布尔解析与「CLI > 环境变量 > 配置 > 默认值」优先级
import { describe, it, expect, afterEach } from "vitest"
import { parseBool, resolveEnabled } from "../switch"

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
