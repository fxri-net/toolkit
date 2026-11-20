// 旧环境变量名提示单测：命中旧名告警一次、新旧同名不告警、空值不告警
import { afterEach, describe, expect, it, vi } from "vitest"
import { resetLegacyEnvWarnings, warnLegacyEnvOnce } from "../legacy-env"

afterEach(() => {
  vi.restoreAllMocks()
  resetLegacyEnvWarnings()
})

describe("旧环境变量名提示", () => {
  it("旧名有值且新名为空时告警，并给出新名", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const hits = warnLegacyEnvOnce({ TOOLKIT_USAGE_DIR: "/tmp/usage" })
    expect(hits).toEqual(["TOOLKIT_USAGE_DIR"])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain("FX_TOOLKIT_USAGE_DIR")
  })

  it("新旧名同时设置时视为已迁移，不告警", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const hits = warnLegacyEnvOnce({ TOOLKIT_USAGE_DIR: "/old", FX_TOOLKIT_USAGE_DIR: "/new" })
    expect(hits).toEqual([])
    expect(warn).not.toHaveBeenCalled()
  })

  it("旧名为空串或未设置时不告警", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(warnLegacyEnvOnce({ TOOLKIT_USAGE_DIR: "", FX_REDACT: "" })).toEqual([])
    expect(warnLegacyEnvOnce({})).toEqual([])
    expect(warn).not.toHaveBeenCalled()
  })

  it("同一进程重复调用只提示一次", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const env = { FX_NO_UPDATE_CHECK: "1" }
    expect(warnLegacyEnvOnce(env)).toEqual(["FX_NO_UPDATE_CHECK"])
    expect(warnLegacyEnvOnce(env)).toEqual(["FX_NO_UPDATE_CHECK"])
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
