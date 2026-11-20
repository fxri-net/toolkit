// 作用域输出展示：home 前缀折叠的大小写口径
import { afterEach, describe, expect, it } from "vitest"
import { setHomeDirForTest } from "../config"
import { displayPath } from "../scope/print"

afterEach(() => {
  setHomeDirForTest(undefined)
})

describe("displayPath", () => {
  it("home 前缀按大小写口径折叠，输出保留原始写法", () => {
    setHomeDirForTest("C:\\Users\\Tqy")
    expect(displayPath("c:/users/tqy/work/repo")).toBe("~/work/repo")
    expect(displayPath("C:\\Users\\tqy")).toBe("~")
  })

  it("非 home 路径原样输出，null 回落默认文案", () => {
    setHomeDirForTest("C:\\Users\\Tqy")
    expect(displayPath("D:\\Work\\repo")).toBe("D:\\Work\\repo")
    expect(displayPath(null)).toBe("默认（未配置）")
  })
})
