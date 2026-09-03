// meta 元数据段解析（L4）：全角/半角间隔与冒号、乱序兼容
import { describe, it, expect } from "vitest"
import { parseMetaSegments } from "../tasks/meta"

describe("parseMetaSegments", () => {
  it("标准全角间隔行", () => {
    const seg = parseMetaSegments("> 负责人：唐启云　状态：已完成　范围：全局　完成时间：2026-09-03 10:00")
    expect(seg).toEqual({ owner: "唐启云", status: "已完成", scope: "全局", completed: "2026-09-03 10:00" })
  })

  it("乱序且缺字段时只解析存在项", () => {
    const seg = parseMetaSegments("> 范围：内容　状态：已放弃　完成时间：2026-09-03 09:00")
    expect(seg.owner).toBeUndefined()
    expect(seg.scope).toBe("内容")
    expect(seg.status).toBe("已放弃")
    expect(seg.completed).toBe("2026-09-03 09:00")
  })

  it("半角冒号兼容", () => {
    const seg = parseMetaSegments("> 负责人: 李四　状态: 待办")
    expect(seg.owner).toBe("李四")
    expect(seg.status).toBe("待办")
  })

  it("null/空行返回空", () => {
    expect(parseMetaSegments(null)).toEqual({})
    expect(parseMetaSegments("")).toEqual({})
  })
})
