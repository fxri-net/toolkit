// depends_on 解析统一实现（K2）：数组/JSON/单双引号/无引号括号/空值
import { describe, it, expect } from "vitest"
import { parseDepends } from "../tasks/depends"

describe("parseDepends", () => {
  it("数组直通并过滤非字符串", () => {
    expect(parseDepends(["a", "b"])).toEqual(["a", "b"])
    expect(parseDepends(["a", 1])).toEqual(["a"])
  })
  it("JSON 双引号数组", () => {
    expect(parseDepends('["a", "b"]')).toEqual(["a", "b"])
    expect(parseDepends("[]")).toEqual([])
    expect(parseDepends("")).toEqual([])
  })
  it("手写单引号列表", () => {
    expect(parseDepends("['a', 'b']")).toEqual(["a", "b"])
    expect(parseDepends('["a", \'b\']')).toEqual(["a", "b"])
  })
  it("无引号逗号分隔括号", () => {
    expect(parseDepends("[a, b]")).toEqual(["a", "b"])
    expect(parseDepends("[a，b]")).toEqual(["a", "b"])
  })
  it("非字符串返回空", () => {
    expect(parseDepends(null)).toEqual([])
    expect(parseDepends(undefined)).toEqual([])
    expect(parseDepends(123)).toEqual([])
  })
})
