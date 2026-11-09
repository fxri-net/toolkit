// 任务文件名简述：派生规则、跨平台形态、简述与标题同源、用户名与 owner 一致、归档前固化提示
import { describe, it, expect } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { briefMatchesTitle, briefNameIssues, parseTaskName, taskBrief } from "../tasks/name"
import { validateTasks } from "../tasks/validate"
import { archiveTasks } from "../tasks/archive"

function taskDir(): string {
  return mkdtempSync(join(tmpdir(), "tk-name-"))
}

// 写 active 任务文件：标题与 owner 可按用例覆盖，其余字段为合法默认值
function putTask(dir: string, name: string, title: string, owner = "唐启云"): void {
  mkdirSync(join(dir, "active", "202609"), { recursive: true })
  const content = [
    "---",
    `owner: ${owner}`,
    "status: 待办",
    "created: 20260903",
    "updated: 20260903",
    "completed: ''",
    "depends_on: []",
    "scope: 测",
    "---",
    "",
    `# ${title}`,
  ].join("\n")
  writeFileSync(join(dir, "active", "202609", name), content, "utf8")
}

const warnTexts = (dir: string) => validateTasks(dir).issues.filter((i) => i.level === "warn").map((i) => i.message)

describe("taskBrief 派生规则", () => {
  it("中文标题直接得到中文简述，空白折叠为连字符", () => {
    expect(taskBrief("修复登录 超时")).toEqual({ brief: "修复登录-超时", truncated: false })
  })

  it("替换跨平台非法字符并去首尾点", () => {
    expect(taskBrief('a/b:c*d?e"f<g>h|i.')).toEqual({ brief: "a-b-c-d-e-f-g-h-i", truncated: false })
  })

  it("超长标题截断到 24 字符并标记 truncated", () => {
    const title = "这个标题真的非常非常长用来验证文件名会被截断的情况发生"
    const { brief, truncated } = taskBrief(title)
    expect([...brief].length).toBe(24)
    expect(truncated).toBe(true)
  })

  it("三段解析：结构不符返回 null，结构问题交既有命名告警", () => {
    expect(parseTaskName("20260903-唐启云-修复登录.md")).toEqual({ date: "20260903", owner: "唐启云", brief: "修复登录" })
    expect(parseTaskName("zz-任务.md")).toBeNull()
  })
})

describe("briefMatchesTitle 同源判据（不绑定语种）", () => {
  it("英文项目：英文简述与英文标题同源", () => {
    expect(briefMatchesTitle("fix-login-timeout", "Fix login timeout")).toBe(true)
  })

  it("中文项目：截断后的简述仍同源", () => {
    expect(briefMatchesTitle("修复登录", "修复登录超时并补充重试")).toBe(true)
  })

  it("人工按关键词压缩的简述同源", () => {
    expect(briefMatchesTitle("修复CI告警", "修复 GitLab CI 构建中 clean job 的告警")).toBe(true)
  })

  it("中文标题配英文 slug 判为不同源", () => {
    expect(briefMatchesTitle("fix-login-timeout", "修复登录超时")).toBe(false)
  })
})

describe("briefNameIssues 跨平台形态", () => {
  it("非法字符、保留设备名、结尾点、超长均命中", () => {
    expect(briefNameIssues("a:b").join()).toContain("非法字符")
    expect(briefNameIssues("NUL").join()).toContain("保留设备名")
    expect(briefNameIssues("任务.").join()).toContain("以点或空格结尾")
    expect(briefNameIssues("x".repeat(61)).join()).toContain("超过 60 字符")
  })

  it("未做 NFC 归一时提示", () => {
    expect(briefNameIssues("e\u0301").join()).toContain("NFC")
  })

  it("正常简述无问题", () => {
    expect(briefNameIssues("修复登录超时")).toEqual([])
  })
})

describe("validateTasks 三段真源校验", () => {
  it("中文标题配英文 slug 软告警", () => {
    const dir = taskDir()
    putTask(dir, "20260903-唐启云-fix-login-timeout.md", "修复登录超时")
    expect(warnTexts(dir).some((m) => m.includes("不同源"))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it("纯英文项目不误报", () => {
    const dir = taskDir()
    putTask(dir, "20260903-唐启云-fix-login-timeout.md", "Fix login timeout")
    expect(validateTasks(dir).issues).toHaveLength(0)
    rmSync(dir, { recursive: true, force: true })
  })

  it("文件名用户名与 owner 不一致软告警", () => {
    const dir = taskDir()
    putTask(dir, "20260903-张三-修复登录.md", "修复登录", "唐启云")
    expect(warnTexts(dir).some((m) => m.includes("与 owner") && m.includes("张三"))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe("archiveTasks 固化前提示", () => {
  it("简述与标题不同源时告警，但不阻断归档", () => {
    const dir = taskDir()
    mkdirSync(join(dir, "archive"), { recursive: true })
    mkdirSync(join(dir, "active", "202609"), { recursive: true })
    writeFileSync(
      join(dir, "active", "202609", "20260903-唐启云-fix-login-timeout.md"),
      "---\nowner: 唐启云\nstatus: 已完成\ncreated: 20260903\nupdated: 20260903\ncompleted: '2026-09-03 10:00'\ndepends_on: []\nscope: 测\n---\n\n# 修复登录超时\n",
      "utf8",
    )
    const res = archiveTasks(dir)
    expect(res.archived).toBe(1)
    expect(res.warnings.some((w) => w.includes("不同源") && w.includes("固化"))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })
})
