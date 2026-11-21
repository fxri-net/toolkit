// 任务建档与改字段：模板落盘、命名规则、终态 completed 约束与正文保留
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createTask, findActiveTask, taskSlug, updateTask } from "../tasks/edit"
import { resetToolkitConfigCache } from "../config"

let dir = ""

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tk-task-edit-"))
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
