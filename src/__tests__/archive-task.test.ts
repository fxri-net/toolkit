// 归档命令的单任务入口与多任务提示：逐个归档对齐逐任务提交，键非法时不落到全量
import { describe, it, expect } from "vitest"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { archiveTasks } from "../tasks/archive"
import { tempDir } from "./helpers"

// 临时任务区
function taskDir(): string {
  return tempDir("fxts-tk-archive-task-")
}

// 写 active 任务：status / completed / 正文可按用例覆盖
function putTask(dir: string, name: string, status = "已完成", completed = "2026-11-12 10:00", body = ""): void {
  mkdirSync(join(dir, "active", "202611"), { recursive: true })
  const content = [
    "---",
    "owner: 唐启云",
    `status: ${status}`,
    "created: 20261112",
    "updated: 20261112",
    `completed: ${status === "待办" ? "''" : `'${completed}'`}`,
    "depends_on: []",
    "scope: toolkit",
    "---",
    "",
    `# ${name.split("-").slice(2).join("-")}`,
    body,
  ].join("\n")
  writeFileSync(join(dir, "active", "202611", `${name}.md`), content, "utf8")
}

const KEY_A = "20261112-唐启云-任务甲"
const KEY_B = "20261112-唐启云-任务乙"

describe("tasks archive --task", () => {
  it("只归档指定任务，其余 active 任务与归档内容不受影响", () => {
    const dir = taskDir()
    try {
      putTask(dir, KEY_A)
      putTask(dir, KEY_B)
      const result = archiveTasks(dir, false, { task: KEY_A })
      expect(result.archived).toBe(1)
      expect(existsSync(join(dir, "active", "202611", `${KEY_A}.md`))).toBe(false)
      expect(existsSync(join(dir, "active", "202611", `${KEY_B}.md`))).toBe(true)
      const archived = readFileSync(join(dir, "archive", "202611", "20261112.md"), "utf8")
      expect(archived).toContain(KEY_A)
      expect(archived).not.toContain(KEY_B)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("唯一键不存在时报错，不静默落到全量", () => {
    const dir = taskDir()
    try {
      putTask(dir, KEY_A)
      expect(() => archiveTasks(dir, false, { task: "20261112-唐启云-不存在" })).toThrow(/未找到任务/)
      expect(existsSync(join(dir, "active", "202611", `${KEY_A}.md`))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("任务尚未终结时报错并说明状态", () => {
    const dir = taskDir()
    try {
      putTask(dir, KEY_A, "待办")
      expect(() => archiveTasks(dir, false, { task: KEY_A })).toThrow(/未处于已完成/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("同时归档多个任务时给出逐个归档提示，单任务不提示", () => {
    const dir = taskDir()
    try {
      putTask(dir, KEY_A)
      putTask(dir, KEY_B)
      expect(archiveTasks(dir, false).warnings.some((item) => item.includes("逐个归档"))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
    const single = taskDir()
    try {
      putTask(single, KEY_A)
      expect(archiveTasks(single, false).warnings.some((item) => item.includes("逐个归档"))).toBe(false)
    } finally {
      rmSync(single, { recursive: true, force: true })
    }
  })

  it("预演按 --task 统计且不删除 active 文件", () => {
    const dir = taskDir()
    try {
      putTask(dir, KEY_A)
      putTask(dir, KEY_B)
      const result = archiveTasks(dir, false, { task: KEY_B, dryRun: true })
      expect(result.archived).toBe(1)
      expect(existsSync(join(dir, "active", "202611", `${KEY_B}.md`))).toBe(true)
      expect(existsSync(join(dir, "archive"))).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe("归档软告警：已放弃缺放弃原因", () => {
  it("缺理由时告警且归档照常完成", () => {
    const dir = taskDir()
    try {
      putTask(dir, KEY_A, "已放弃", "2026-11-12 10:00", "方案正文")
      const result = archiveTasks(dir, false)
      expect(result.archived).toBe(1)
      expect(result.warnings.some((w) => w.includes("放弃原因"))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("带非空理由时不告警，且理由随正文进归档块", () => {
    const dir = taskDir()
    try {
      putTask(dir, KEY_A, "已放弃", "2026-11-12 10:00", "> 放弃原因：成本高于收益")
      const result = archiveTasks(dir, false)
      expect(result.warnings.some((w) => w.includes("放弃原因"))).toBe(false)
      expect(readFileSync(join(dir, "archive", "202611", "20261112.md"), "utf8")).toContain("> 放弃原因：成本高于收益")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("预演同样告警；--no-warn 时不输出", () => {
    const dir = taskDir()
    try {
      putTask(dir, KEY_A, "已放弃", "2026-11-12 10:00")
      expect(archiveTasks(dir, false, { dryRun: true }).warnings.some((w) => w.includes("放弃原因"))).toBe(true)
      expect(archiveTasks(dir, false, { warn: false }).warnings.some((w) => w.includes("放弃原因"))).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe("归档软告警：残留搁置节", () => {
  const HELD_BODY = "\n## 搁置\n\n- 搁置原因：等待契约\n- 重启条件：契约冻结\n- 进度锚点：方案已定稿\n- 搁置日期：2026-11-10\n"

  it("已完成档残留搁置节时告警且照常归档", () => {
    const dir = taskDir()
    try {
      putTask(dir, KEY_A, "已完成", "2026-11-12 10:00", HELD_BODY)
      const result = archiveTasks(dir, false)
      expect(result.archived).toBe(1)
      expect(result.warnings.some((w) => w.includes("## 搁置"))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("已放弃档保留搁置节属预期，不告警", () => {
    const dir = taskDir()
    try {
      putTask(dir, KEY_A, "已放弃", "2026-11-12 10:00", `> 放弃原因：成本高于收益${HELD_BODY}`)
      expect(archiveTasks(dir, false).warnings.some((w) => w.includes("## 搁置"))).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("--no-warn 时不输出", () => {
    const dir = taskDir()
    try {
      putTask(dir, KEY_A, "已完成", "2026-11-12 10:00", HELD_BODY)
      expect(archiveTasks(dir, false, { warn: false }).warnings.some((w) => w.includes("## 搁置"))).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
