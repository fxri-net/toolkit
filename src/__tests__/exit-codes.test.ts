// 退出码单一真源：常量值、文档表覆盖与兼容导出的一致性
import { describe, expect, it } from "vitest"
import { EXIT, EXIT_CODE_TABLE } from "../exit-codes"
import { CANCEL_EXIT_CODE, INTERACTIVE_EXIT } from "../prompts"

describe("退出码单一真源", () => {
  it("常量值固定", () => {
    expect(EXIT.OK).toBe(0)
    expect(EXIT.FAIL).toBe(1)
    expect(EXIT.INTERACTIVE).toBe(2)
    expect(EXIT.USAGE).toBe(2)
    expect(EXIT.GUARD_INACTIVE).toBe(3)
    expect(EXIT.CANCEL).toBe(130)
  })

  it("文档表与常量数值一一对应，且无重复行", () => {
    const codes = EXIT_CODE_TABLE.map((row) => row.code)
    expect(new Set(codes).size).toBe(codes.length)
    const unique = [...new Set(Object.values(EXIT))].sort((a, b) => a - b)
    expect([...codes].sort((a, b) => a - b)).toEqual(unique)
    for (const row of EXIT_CODE_TABLE) {
      expect(row.name.trim()).not.toBe("")
      expect(row.meaning.trim()).not.toBe("")
      expect(row.scene.trim()).not.toBe("")
    }
  })

  it("兼容导出与真源同值", () => {
    expect(CANCEL_EXIT_CODE).toBe(EXIT.CANCEL)
    expect(INTERACTIVE_EXIT).toBe(EXIT.INTERACTIVE)
  })
})
