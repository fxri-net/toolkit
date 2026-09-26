// 门禁阈值自检：AGENTS.md 声明本源仓库 tasks check 的 error / warn 均应为 0，
// 但 check 仅按 error 置退出码、verify 只按退出码判定，warn 在聚合门禁里并不阻断。
// 本测试把「双零」阈值锁进单测（verify 的单元测试步骤），不改用户侧 CLI 语义
import { describe, it, expect } from "vitest"
import { existsSync } from "node:fs"
import { validateTasks } from "../tasks/validate"
import { findUntypedChangesetEntries } from "../changelog/format"
import { languages } from "../changelog/languages"

describe("门禁阈值：本源仓库自身应为零问题", () => {
  it("任务区校验与变更集缺前缀扫描的 error / warn 均为 0", () => {
    // 先证根：两个被扫目录均按 cwd 相对定位，且对目录缺失都容错为空结果，
    // cwd 不符时断言会退化为空集、静默通过，故缺失即先失败并报出真实原因
    for (const dir of [".tasks", ".changeset"]) {
      expect(existsSync(dir), `未在 cwd（${process.cwd()}）找到 ${dir}，请从仓库根运行测试`).toBe(true)
    }
    // 语言表取内置：本仓库无 .toolkitrc.json，与 cli 私有的 resolveLanguages() 等价；
    // 配置只可能追加前缀，故内置表是保守子集、判定只会更严，不存在漏判方向
    const untyped = findUntypedChangesetEntries(".changeset", Object.values(languages))
    const issues = validateTasks(".tasks").issues
    expect([
      ...issues.map((i) => `${i.level} ${i.file}: ${i.message}`),
      ...untyped.map((u) => `warn ${u.file}: ${u.count} 条缺类型前缀`),
    ]).toEqual([])
  })
})
