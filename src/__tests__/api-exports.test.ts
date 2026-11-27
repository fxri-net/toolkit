// Node API 导出面：docs/api.md 承诺的配置函数必须可从包入口导入
import { describe, it, expect } from "vitest"
import { rmSync } from "node:fs"
import { join } from "node:path"
import * as api from "../index"
import { tempDir } from "./helpers"

describe("Node API 导出面与文档一致", () => {
  it("导出 resolveTasksDir 与 configStatus", () => {
    expect(typeof api.resolveTasksDir).toBe("function")
    expect(typeof api.configStatus).toBe("function")
  })

  it("resolveTasksDir 无参回落默认 .tasks", () => {
    expect(api.resolveTasksDir()).toBe(join(".tasks"))
  })

  it("configStatus 返回三层报告结构", () => {
    const dir = tempDir("fxts-tk-api-exports-")
    try {
      const report = api.configStatus(dir)
      expect(Array.isArray(report.levels)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
