// 任务周期统计单测：周期计算边界（同日、跨月、缺日期跳过、已放弃排除）、滞留口径、分布分段、过滤联动
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { computeStats, renderStats } from "../tasks/stats"

// 临时目录收集，用例结束后统一清理
const dirs: string[] = []
function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "fx-stats-"))
  dirs.push(dir)
  return dir
}

// 写活跃任务文件（年月子目录 + frontmatter + 正文）
function writeTask(dir: string, name: string, fm: Record<string, string>): void {
  mkdirSync(join(dir, "active", name.slice(0, 6)), { recursive: true })
  const lines = Object.entries(fm).map(([k, v]) => `${k}: ${v}`)
  writeFileSync(join(dir, "active", name.slice(0, 6), `${name}.md`), `---\n${lines.join("\n")}\n---\n\n# ${name}\n\n正文\n`, "utf8")
}

// 写归档文件（按完成日期分组的任务块）
function writeArchive(dir: string, date: string, blocks: string[]): void {
  mkdirSync(join(dir, "archive", date.slice(0, 6)), { recursive: true })
  writeFileSync(join(dir, "archive", date.slice(0, 6), `${date}.md`), `# ${date} 归档\n\n${blocks.join("\n\n---\n\n")}\n`, "utf8")
}

afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
  dirs.length = 0
  vi.useRealTimers()
})

// 固定「今天」：滞留时长依赖当天日期，统一假定时钟保证断言稳定
function freezeToday(date: string): void {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${date}T10:00:00`))
}

describe("computeStats", () => {
  it("同日任务周期为 0 天，落入 ≤1 天分段", () => {
    const dir = makeDir()
    writeArchive(dir, "20260905", ["## 20260905-张三-同日完成\n\n> 负责人：张三　状态：已完成　范围：core　完成时间：2026-09-05 10:00\n\n正文\n"])
    const stats = computeStats(dir)
    expect(stats.duration.count).toBe(1)
    expect(stats.duration.avg).toBe(0)
    expect(stats.duration.max).toBe(0)
    expect(stats.duration.buckets["≤1 天"]).toBe(1)
    expect(stats.skipped).toBe(0)
  })

  it("跨月归档任务周期按天计算（创建 0801 → 完成 09-10 为 40 天）", () => {
    const dir = makeDir()
    writeArchive(dir, "20260910", ["## 20260801-李四-跨月任务\n\n> 负责人：李四　状态：已完成　范围：core　完成时间：2026-09-10 18:00\n\n正文\n"])
    const stats = computeStats(dir)
    expect(stats.duration.avg).toBe(40)
    expect(stats.duration.buckets[">30 天"]).toBe(1)
  })

  it("缺创建日期的归档块跳过并计数（标题不符合 YYYYMMDD- 前缀）", () => {
    const dir = makeDir()
    writeArchive(dir, "20260905", ["## 手工迁移的块\n\n> 负责人：张三　状态：已完成　范围：core　完成时间：2026-09-05 10:00\n\n正文\n"])
    const stats = computeStats(dir)
    expect(stats.duration.count).toBe(0)
    expect(stats.skipped).toBe(1)
  })

  it("已完成但缺完成时间的活跃任务跳过；吞吐不统计", () => {
    const dir = makeDir()
    writeTask(dir, "20260905-张三-已完成未归档", { owner: "张三", status: "已完成", created: "20260905", updated: "20260905", completed: "", depends_on: "[]", scope: "core" })
    const stats = computeStats(dir)
    expect(stats.duration.count).toBe(0)
    expect(stats.skipped).toBe(1)
    expect(stats.byMonth).toEqual({})
  })

  it("已放弃任务不计入周期与吞吐", () => {
    const dir = makeDir()
    writeArchive(dir, "20260905", ["## 20260901-王五-放弃的任务\n\n> 负责人：王五　状态：已放弃　范围：core　完成时间：2026-09-05 10:00\n\n正文\n"])
    const stats = computeStats(dir)
    expect(stats.duration.count).toBe(0)
    expect(stats.skipped).toBe(0)
    expect(stats.byOwner).toEqual({})
    expect(stats.byMonth).toEqual({})
  })

  it("吞吐按完成月/负责人/范围汇总，按月键为 YYYY-MM", () => {
    const dir = makeDir()
    writeArchive(dir, "20260905", [
      "## 20260820-张三-八月任务\n\n> 负责人：张三　状态：已完成　范围：core　完成时间：2026-08-20 10:00\n\n正文\n",
      "## 20260901-张三-九月任务\n\n> 负责人：张三　状态：已完成　范围：docs　完成时间：2026-09-01 10:00\n\n正文\n",
    ])
    const stats = computeStats(dir)
    expect(stats.byMonth).toEqual({ "2026-08": 1, "2026-09": 1 })
    expect(stats.byOwner).toEqual({ 张三: 2 })
    expect(stats.byScope).toEqual({ core: 1, docs: 1 })
  })

  it("滞留时长 = 统计日 − 创建日，不含已完结状态", () => {
    freezeToday("2026-09-05")
    const dir = makeDir()
    writeTask(dir, "20260901-张三-滞留任务", { owner: "张三", status: "待办", created: "20260901", updated: "20260901", completed: "", depends_on: "[]", scope: "core" })
    writeTask(dir, "20260902-李四-已完成的活跃", { owner: "李四", status: "已完成", created: "20260902", updated: "20260902", completed: "2026-09-02 10:00", depends_on: "[]", scope: "core" })
    const stats = computeStats(dir)
    expect(stats.active.count).toBe(1)
    expect(stats.active.avgStay).toBe(4)
    expect(stats.active.maxStay).toBe(4)
    // 已完结但未归档的活跃任务仍计入周期（有 created/completed）
    expect(stats.duration.count).toBe(1)
  })

  it("created 晚于 completed 的异常行跳过", () => {
    const dir = makeDir()
    writeArchive(dir, "20260905", ["## 20260910-张三-日期异常\n\n> 负责人：张三　状态：已完成　范围：core　完成时间：2026-09-05 10:00\n\n正文\n"])
    const stats = computeStats(dir)
    expect(stats.skipped).toBe(1)
    expect(stats.duration.count).toBe(0)
  })

  it("过滤参数（owner/scope/status/since/until）联动统计", () => {
    const dir = makeDir()
    writeArchive(dir, "20260905", [
      "## 20260901-张三-任务甲\n\n> 负责人：张三　状态：已完成　范围：core　完成时间：2026-09-01 10:00\n\n正文\n",
      "## 20260902-李四-任务乙\n\n> 负责人：李四　状态：已完成　范围：docs　完成时间：2026-09-02 10:00\n\n正文\n",
    ])
    expect(computeStats(dir, { owner: ["张三"] }).duration.count).toBe(1)
    expect(computeStats(dir, { scope: ["docs"] }).duration.count).toBe(1)
    expect(computeStats(dir, { since: "2026-09-02" }).duration.count).toBe(1)
    expect(computeStats(dir, { status: ["待办"] }).duration.count).toBe(0)
  })
})

describe("renderStats", () => {
  it("输出周期/滞留/吞吐关键行", () => {
    freezeToday("2026-09-05")
    const dir = makeDir()
    writeArchive(dir, "20260905", ["## 20260904-张三-昨日完成\n\n> 负责人：张三　状态：已完成　范围：core　完成时间：2026-09-05 10:00\n\n正文\n"])
    writeTask(dir, "20260901-李四-滞留任务", { owner: "李四", status: "进行中", created: "20260901", updated: "20260901", completed: "", depends_on: "[]", scope: "core" })
    const lines = renderStats(computeStats(dir))
    const text = lines.join("\n")
    expect(text).toContain("已完成样本：1 个")
    expect(text).toContain("平均周期：1 天")
    expect(text).toContain("≤1 天　1 个")
    expect(text).toContain("未完成任务：1 个")
    expect(text).toContain("平均滞留 4 天")
    expect(text).toContain("按完成月：2026-09 1")
    expect(text).toContain("按负责人：张三 1")
    expect(text).toContain("按范围：core 1")
  })
})
