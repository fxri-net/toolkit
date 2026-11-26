// 任务建档与改字段：模板落盘、命名规则、终态 completed 约束与正文保留
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createTask, findActiveTask, taskSlug, updateTask } from "../tasks/edit"
import { resetToolkitConfigCache } from "../config"

let dir = ""

// 带四行摘要的搁置节（模拟搁置档正文）
const HELD_SECTION = ["## 搁置", "", "- 搁置原因：等待上游契约", "- 重启条件：契约冻结", "- 进度锚点：方案已定稿", "- 搁置日期：2026-11-21", "", ""].join("\n")

// 在正文首个二级标题前插入搁置节并置为搁置态（先去掉模板里的占位注释，模拟真实建档）
function markHeld(key: string): void {
  const file = findActiveTask(dir, key)
  const cleaned = readFileSync(file, "utf8").replace(/<!--\s*status 为搁置时[\s\S]*?-->\n?/, "")
  writeFileSync(file, cleaned.replace("## 背景", `${HELD_SECTION}## 背景`), "utf8")
  updateTask({ dir, key, status: "搁置", now: new Date("2026-11-21T10:00:00") })
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fxts-tk-task-edit-"))
  resetToolkitConfigCache()
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("createTask：按模板建档", () => {
  it("生成 {YYYYMMDD}-{owner}-{slug}.md 并写入 frontmatter 与骨架", () => {
    const now = new Date("2026-11-21T10:00:00")
    const result = createTask({ dir, title: "命令分组与低频下沉", owner: "测试员", scope: "cli", dependsOn: ["上游任务"], now })
    expect(result.file.endsWith(join("active", "202611", "20261121-测试员-命令分组与低频下沉.md"))).toBe(true)
    expect(existsSync(result.file)).toBe(true)
    const content = readFileSync(result.file, "utf8")
    expect(content).toContain("owner: 测试员")
    expect(content).toContain("status: 待办")
    expect(content).toContain("completed: ''")
    expect(content).toContain('depends_on: ["上游任务"]')
    expect(content).toContain("scope: cli")
    expect(content).toContain("# 命令分组与低频下沉")
    expect(content).toContain("## 实施方案")
    expect(content).toContain("## 完成情况")
  })

  it("同名任务已存在时报错，--dry-run 不落盘", () => {
    createTask({ dir, title: "重复任务", owner: "测试员", scope: "cli" })
    expect(() => createTask({ dir, title: "重复任务", owner: "测试员", scope: "cli" })).toThrow("已存在")
    const preview = createTask({ dir, title: "预演任务", owner: "测试员", scope: "cli", dryRun: true })
    expect(existsSync(preview.file)).toBe(false)
  })

  it("负责人名含路径分隔符时拒绝建档，不写到任务目录之外", () => {
    const now = new Date("2026-11-21T10:00:00")
    expect(() => createTask({ dir, title: "越界负责人", owner: "../escape", scope: "cli", now })).toThrow(/负责人名非法/)
    expect(existsSync(join(dir, "active"))).toBe(false)
  })

  it("简述规则：去非法字符、空白折叠、截断 24 字符", () => {
    expect(taskSlug("  A/B: C  ")).toBe("A-B-C")
    expect(taskSlug("一二三四五六七八九十一二三四五六七八九十一二三四五")).toHaveLength(24)
  })
})

describe("updateTask：改字段与状态约束", () => {
  it("终态必须提供 completed，非终态清空 completed", () => {
    const created = createTask({ dir, title: "更新目标", owner: "测试员", scope: "cli", now: new Date("2026-11-21T10:00:00") })
    expect(() => updateTask({ dir, key: "更新目标", status: "已完成", now: new Date("2026-11-21T11:00:00") })).toThrow("--completed")
    updateTask({ dir, key: "更新目标", status: "已完成", completed: "2026-11-21 11:00", now: new Date("2026-11-21T11:00:00") })
    let content = readFileSync(created.file, "utf8")
    expect(content).toContain("status: 已完成")
    expect(content).toContain('completed: "2026-11-21 11:00"')
    expect(content).toContain("updated: 20261121")

    updateTask({ dir, key: "更新目标", status: "待办", now: new Date("2026-11-21T12:00:00") })
    content = readFileSync(created.file, "utf8")
    expect(content).toContain("status: 待办")
    expect(content).toContain("completed: ''")
    // 正文原样保留
    expect(content).toContain("## 完成情况")
  })

  it("关键字命中多个文件时报错", () => {
    createTask({ dir, title: "同名一", owner: "甲", scope: "cli" })
    createTask({ dir, title: "同名一", owner: "乙", scope: "cli" })
    expect(() => findActiveTask(dir, "同名一")).toThrow("多个文件")
  })

  it("非法状态报错", () => {
    createTask({ dir, title: "非法状态", owner: "测试员", scope: "cli" })
    expect(() => updateTask({ dir, key: "非法状态", status: "不存在的状态" })).toThrow("非法状态")
  })
})

describe("updateTask：从搁置转出时删除搁置节", () => {
  it("转待办删除整节，其余正文保留且不留连续空行", () => {
    const created = createTask({ dir, title: "唤醒目标", owner: "测试员", scope: "cli", now: new Date("2026-11-21T10:00:00") })
    markHeld("唤醒目标")
    updateTask({ dir, key: "唤醒目标", status: "待办", now: new Date("2026-11-21T11:00:00") })
    const content = readFileSync(created.file, "utf8")
    expect(content).not.toContain("## 搁置")
    expect(content).toContain("## 背景")
    expect(content).toContain("## 完成情况")
    expect(content).not.toContain("\n\n\n")
  })

  it("转已完成同样删节", () => {
    const created = createTask({ dir, title: "唤醒完成", owner: "测试员", scope: "cli", now: new Date("2026-11-21T10:00:00") })
    markHeld("唤醒完成")
    updateTask({ dir, key: "唤醒完成", status: "已完成", completed: "2026-11-21 11:00", now: new Date("2026-11-21T11:00:00") })
    expect(readFileSync(created.file, "utf8")).not.toContain("## 搁置")
  })

  it("转进行中同样删节", () => {
    const created = createTask({ dir, title: "唤醒进行中", owner: "测试员", scope: "cli", now: new Date("2026-11-21T10:00:00") })
    markHeld("唤醒进行中")
    updateTask({ dir, key: "唤醒进行中", status: "进行中", now: new Date("2026-11-21T11:00:00") })
    const content = readFileSync(created.file, "utf8")
    expect(content).not.toContain("## 搁置")
    expect(content).toContain("## 背景")
    expect(content).toContain("status: 进行中")
  })

  it("转已放弃保留搁置节作终结理由", () => {
    const created = createTask({ dir, title: "搁置终止", owner: "测试员", scope: "cli", now: new Date("2026-11-21T10:00:00") })
    markHeld("搁置终止")
    updateTask({ dir, key: "搁置终止", status: "已放弃", completed: "2026-11-21 11:00", now: new Date("2026-11-21T11:00:00") })
    expect(readFileSync(created.file, "utf8")).toContain("## 搁置")
  })

  it("非搁置档的残留搁置节不被改写", () => {
    const created = createTask({ dir, title: "残留搁置节", owner: "测试员", scope: "cli", now: new Date("2026-11-21T10:00:00") })
    const cleaned = readFileSync(created.file, "utf8").replace(/<!--\s*status 为搁置时[\s\S]*?-->\n?/, "")
    writeFileSync(created.file, cleaned.replace("## 背景", `${HELD_SECTION}## 背景`), "utf8")
    updateTask({ dir, key: "残留搁置节", status: "进行中", now: new Date("2026-11-21T11:00:00") })
    expect(readFileSync(created.file, "utf8")).toContain("## 搁置")
  })
})
