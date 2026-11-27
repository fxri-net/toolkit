// 搁置档规范：节位置、四行形态与日期口径的软告警；以及搁置天数在查询、看板与导出中的呈现
import { describe, it, expect, vi, afterEach } from "vitest"
import { writeFileSync, mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { validateTasks } from "../tasks/validate"
import { queryTasks } from "../tasks/query"
import { printTaskBoard } from "../tasks/list"
import { toCSV, toJSON } from "../tasks/export"
import { todayCompact, todayDash } from "../date"
import type { TaskSummary } from "../tasks/types"
import { tempDir } from "./helpers"

afterEach(() => vi.restoreAllMocks())

// 造单任务档：body 为正文（不含 frontmatter），status / completed / updated 可覆盖
// updated 缺省取当天：搁置天数以「今天」为基准，写死日期会让用例随运行日期漂移
function makeTask(body: string, opts: { status?: string; completed?: string; updated?: string; name?: string } = {}): string {
  const dir = tempDir("fxts-tk-held-")
  mkdirSync(join(dir, "active", "202611"), { recursive: true })
  const status = opts.status ?? "搁置"
  const completed = opts.completed ?? ""
  const updated = opts.updated ?? todayCompact()
  const name = opts.name ?? "20261120-唐启云-搁置样例.md"
  writeFileSync(
    join(dir, "active", "202611", name),
    `---\nowner: 唐启云\nstatus: ${status}\ncreated: 20261120\nupdated: ${updated}\ncompleted: '${completed}'\ndepends_on: []\nscope: x\n---\n\n# 搁置样例\n\n${body}`,
    "utf8",
  )
  return dir
}

const warned = (dir: string) => validateTasks(dir).issues.filter((i) => i.level === "warn").map((i) => i.message)

// 合规正文：搁置节位于标题与计划位置行之后、背景之前，四行顺序固定
const okBody = (date = "2026-01-01") =>
  `> 计划位置：第 1 个（共 1 个）；前置：无；后继：无\n\n## 搁置\n\n- 搁置原因：本阶段不投入\n- 重启条件：契约提供后恢复\n- 进度锚点：方案已定稿，未改代码\n- 搁置日期：${date}\n\n## 背景\n\n说明\n`

describe("搁置节形态校验", () => {
  it("合规档零告警", () => {
    const dir = makeTask(okBody())
    expect(warned(dir)).toEqual([])
    rmSync(dir, { recursive: true, force: true })
  })

  it("status 搁置但缺少搁置节", () => {
    const dir = makeTask("## 背景\n\n说明\n")
    expect(warned(dir).some((m) => m.includes("缺少「## 搁置」节") && m.includes("搁置原因") && m.includes("搁置日期"))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it("四行缺项", () => {
    const dir = makeTask("## 搁置\n\n- 搁置原因：本阶段不投入\n- 重启条件：契约提供\n- 进度锚点：未开工\n")
    expect(warned(dir).some((m) => m.includes("缺少「搁置日期」一行") && m.includes("- 搁置日期："))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it("四行顺序错", () => {
    const dir = makeTask("## 搁置\n\n- 重启条件：契约提供\n- 搁置原因：本阶段不投入\n- 进度锚点：未开工\n- 搁置日期：2026-01-01\n")
    expect(warned(dir).some((m) => m.includes("搁置四行顺序应为"))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it("半角冒号", () => {
    const dir = makeTask("## 搁置\n\n- 搁置原因: 本阶段不投入\n- 重启条件：契约提供\n- 进度锚点：未开工\n- 搁置日期：2026-01-01\n")
    expect(warned(dir).some((m) => m.includes("须用全角冒号"))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it("搁置日期格式非法", () => {
    const dir = makeTask(okBody("20260101"))
    expect(warned(dir).some((m) => m.includes("格式非法，应为 YYYY-MM-DD"))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it("搁置日期晚于今天（留 1 天容差仍判未来）", () => {
    const dir = makeTask(okBody("2099-01-01"))
    expect(warned(dir).some((m) => m.includes("晚于今天"))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it("节不在正文第一个二级标题位置", () => {
    const dir = makeTask("## 背景\n\n说明\n\n## 搁置\n\n- 搁置原因：不投入\n- 重启条件：契约\n- 进度锚点：未开工\n- 搁置日期：2026-01-01\n")
    expect(warned(dir).some((m) => m.includes("第一个二级标题位置"))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it("非搁置档残留搁置节", () => {
    const dir = makeTask(okBody(), { status: "待办" })
    expect(warned(dir).some((m) => m.includes("残留「## 搁置」节"))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it("非搁置档的模板注释占位不算残留", () => {
    const body =
      "> 计划位置：第 1 个（共 1 个）；前置：无；后继：无\n\n<!-- 示例：\n## 搁置\n\n- 搁置原因：……\n-->\n\n## 背景\n\n说明\n"
    const dir = makeTask(body, { status: "待办" })
    expect(warned(dir).some((m) => m.includes("残留「## 搁置」节"))).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })

  it("已放弃档允许保留搁置节作为终结理由", () => {
    const dir = makeTask(okBody(), { status: "已放弃", completed: "2026-01-02 10:00" })
    expect(warned(dir).some((m) => m.includes("残留「## 搁置」节"))).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe("搁置天数呈现", () => {
  it("当天搁置为 0 天；缺搁置日期时回落 updated 并标记近似", () => {
    const dir = makeTask(okBody(todayDash()))
    const row = queryTasks(dir, "active", {}).rows[0]
    expect(row?.heldDays).toBe(0)
    expect(row?.heldDaysApprox).toBeUndefined()
    rmSync(dir, { recursive: true, force: true })

    const approxDir = makeTask("## 搁置\n\n- 搁置原因：不投入\n- 重启条件：契约\n- 进度锚点：未开工\n")
    const approxRow = queryTasks(approxDir, "active", {}).rows[0]
    expect(approxRow?.heldDays).toBe(0)
    expect(approxRow?.heldDaysApprox).toBe(true)
    rmSync(approxDir, { recursive: true, force: true })
  })

  it("非搁置行不计算天数", () => {
    const dir = makeTask("## 背景\n\n说明\n", { status: "待办" })
    expect(queryTasks(dir, "active", {}).rows[0]?.heldDays).toBeUndefined()
    rmSync(dir, { recursive: true, force: true })
  })

  it("看板输出天数与超期标记", () => {
    const dir = makeTask(okBody("2020-01-01"))
    const lines: string[] = []
    const spy = vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => lines.push(a.join(" ")))
    printTaskBoard(dir, "active")
    spy.mockRestore()
    const out = lines.join("\n")
    expect(out).toContain("搁置")
    expect(out).toContain("建议终结")
    rmSync(dir, { recursive: true, force: true })
  })

  it("CSV 与 JSON 带派生列，已归档行为空", () => {
    const dir = makeTask(okBody(todayDash()))
    mkdirSync(join(dir, "archive", "202611"), { recursive: true })
    writeFileSync(
      join(dir, "archive", "202611", "20261119.md"),
      "# 20261119 归档\n\n## 20261119-唐启云-旧任务\n\n> 负责人：唐启云　状态：已完成　范围：x　完成时间：2026-11-19 10:00\n\n正文\n",
      "utf8",
    )
    const { rows, summary } = queryTasks(dir, "all", {})
    const csv = toCSV(rows)
    const header = csv.replace(/^\uFEFF/, "").split("\r\n")[0] ?? ""
    expect(header.endsWith("搁置天数")).toBe(true)

    const parsed = JSON.parse(toJSON(rows, summary as TaskSummary)) as { items: Array<Record<string, unknown>> }
    const held = parsed.items.find((i) => i.status === "搁置")
    const archived = parsed.items.find((i) => i.status === "已完成")
    expect(held?.heldDays).toBe(0)
    expect(held?.heldDaysApprox).toBe(false)
    expect(archived?.heldDays).toBeNull()
    rmSync(dir, { recursive: true, force: true })
  })
})
