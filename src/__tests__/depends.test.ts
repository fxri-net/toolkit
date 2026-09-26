// depends_on 解析统一实现（K2）：数组/JSON/单双引号/无引号括号/空值/裸标量/残缺括号
import { describe, it, expect, vi } from "vitest"
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
  // 缺陷 8：裸标量与裸逗号列表此前被静默丢弃，改为按列表接收（不丢依赖）
  it("裸标量按单元素接收；裸逗号列表按多元素接收", () => {
    expect(parseDepends("任务甲")).toEqual(["任务甲"])
    expect(parseDepends("a, b")).toEqual(["a", "b"])
    expect(parseDepends("a，b")).toEqual(["a", "b"])
  })
  // 顿号不是分隔符（与 scope「只提示不转换」口径一致）：含顿号的值整体作为一个依赖名
  it("顿号不作分隔符，整体作为单元素接收", () => {
    expect(parseDepends("a、b")).toEqual(["a、b"])
  })
  // 缺陷 8：中括号残缺时剥掉残留括号继续解析，并告警提示形态异常
  it("中括号残缺时剥掉残留括号并告警，不静默丢依赖", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(parseDepends("[a, b")).toEqual(["a", "b"])
    expect(parseDepends("a, b]")).toEqual(["a", "b"])
    expect(spy).toHaveBeenCalledTimes(2)
    spy.mockRestore()
  })
  // 非列表形态（JSON 对象/数字）无法当作依赖列表，告警后判为空
  it("非列表 JSON 形态（对象/数字）告警并判为空", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(parseDepends('{"a":1}')).toEqual([])
    expect(parseDepends("123")).toEqual([])
    expect(spy).toHaveBeenCalledTimes(2)
    spy.mockRestore()
  })
})
