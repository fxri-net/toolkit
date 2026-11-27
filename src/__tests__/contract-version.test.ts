// 契约版本格式：两位 MAJOR.MINOR，各契约独立版本值，读取端兼容历史整数
import { describe, expect, it } from "vitest"
import { contractVersionState, isContractVersion, normalizeContractVersion } from "../contract-version"

describe("契约版本格式", () => {
  it("历史整数按 MAJOR.0 归一", () => {
    expect(normalizeContractVersion(1)).toBe("1.0")
    expect(normalizeContractVersion(2)).toBe("2.0")
  })

  it("两位字符串原样返回，非法值返回 null", () => {
    expect(normalizeContractVersion("1.0")).toBe("1.0")
    expect(normalizeContractVersion("2.3")).toBe("2.3")
    expect(normalizeContractVersion("1")).toBeNull()
    expect(normalizeContractVersion("1.0.0")).toBeNull()
    expect(normalizeContractVersion(undefined)).toBeNull()
  })

  it("按调用方声明的版本比较，兼容整数写法", () => {
    expect(isContractVersion(1, "1.0")).toBe(true)
    expect(isContractVersion("1.0", "1.0")).toBe(true)
    expect(isContractVersion("1.1", "1.0")).toBe(false)
    expect(isContractVersion(undefined, "1.0")).toBe(false)
  })

  it("判定版本状态：整数按 legacy 处理，高于声明值按 newer，非法值按 unknown", () => {
    expect(contractVersionState(1, "1.0")).toBe("legacy")
    expect(contractVersionState("1.0", "1.0")).toBe("current")
    expect(contractVersionState("0.9", "1.0")).toBe("legacy")
    expect(contractVersionState("1.1", "1.0")).toBe("newer")
    expect(contractVersionState(2, "1.0")).toBe("newer")
    expect(contractVersionState(undefined, "1.0")).toBe("unknown")
    expect(contractVersionState("1", "1.0")).toBe("unknown")
    expect(contractVersionState("1.0.0", "1.0")).toBe("unknown")
  })
})
