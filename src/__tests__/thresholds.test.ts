// 阈值单源守卫：文档引用的数字与代码常量必须一致，改动任一侧都会在此失败
import { describe, expect, it } from "vitest"
import { MAX_UTC_OFFSET_HOURS } from "../date"
import { LIST_PAGE_SIZE } from "../prompts"
import { HELD_TERMINATE_DAYS, HELD_WARN_DAYS } from "../tasks/list"
import { CHECK_TTL, FAIL_TTL } from "../update-check"

describe("阈值常量", () => {
  it("搁置警示与终结阈值保持 90 天 / 1 年", () => {
    expect(HELD_WARN_DAYS).toBe(90)
    expect(HELD_TERMINATE_DAYS).toBe(365)
    expect(HELD_WARN_DAYS).toBeLessThan(HELD_TERMINATE_DAYS)
  })

  it("更新检查成功间隔 24 小时、失败重试 1 小时", () => {
    expect(CHECK_TTL).toBe(24 * 60 * 60 * 1000)
    expect(FAIL_TTL).toBe(60 * 60 * 1000)
    expect(FAIL_TTL).toBeLessThan(CHECK_TTL)
  })

  it("跨时区容差与列表分页保持既有口径", () => {
    expect(MAX_UTC_OFFSET_HOURS).toBe(14)
    expect(LIST_PAGE_SIZE).toBe(15)
  })
})
