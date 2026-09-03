// active 校验与导入单测：依赖引用归一、元数据/命名软告警、复选框开关、冲突序号与截断告警、自定义列映射
import { describe, it, expect, afterEach } from "vitest"
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { validateTasks } from "../tasks/validate"
import { importTasks } from "../tasks/import"
import { resetToolkitConfigCache } from "../config"

const cwd = process.cwd()

afterEach(() => {
  process.chdir(cwd)
  resetToolkitConfigCache()
})

function taskDir(): string {
  return mkdtempSync(join(tmpdir(), "tk-active-"))
}

// 写 active 文件（202609 子目录）
function putFile(dir: string, name: string, content: string): void {
  const p = join(dir, "active", "202609", name)
  mkdirSync(join(dir, "active", "202609"), { recursive: true })
  writeFileSync(p, content, "utf8")
}

// 默认合法文件内容
function valid(extra = "", body = ""): string {
  return `---\nowner: 唐启云\nstatus: 待办\ncreated: 20260903\nupdated: 20260903\ncompleted: ''\ndepends_on: []\nscope: 测\n---\n\n# 标题\n${body}${extra}`
}

const warnTexts = (dir: string) => validateTasks(dir).issues.filter((i) => i.level === "warn").map((i) => i.message)

describe("validateTasks 依赖与命名校验", () => {
  it("合法文件 0 问题", () => {
    const dir = taskDir()
    putFile(dir, "20260903-唐启云-a.md", valid())
    expect(validateTasks(dir).issues).toHaveLength(0)
    rmSync(dir, { recursive: true, force: true })
  })

  it("依赖引用带 .md 后缀仍能命中（A1）", () => {
    const dir = taskDir()
    putFile(dir, "20260903-唐启云-a.md", valid().replace("depends_on: []", "depends_on: [20260903-唐启云-b.md]"))
    putFile(dir, "20260903-唐启云-b.md", valid())
    expect(validateTasks(dir).issues).toHaveLength(0)
    rmSync(dir, { recursive: true, force: true })
  })

  it(".md 后缀成环可检出", () => {
    const dir = taskDir()
    putFile(dir, "20260903-唐启云-x.md", valid().replace("depends_on: []", "depends_on: [20260903-唐启云-y.md]"))
    putFile(dir, "20260903-唐启云-y.md", valid().replace("depends_on: []", "depends_on: [20260903-唐启云-x.md]"))
    expect(warnTexts(dir).some((m) => m.includes("循环依赖"))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it("缺 owner/created、文件名与 created 不一致给出软告警（A3）", () => {
    const dir = taskDir()
    putFile(dir, "20260903-唐启云-a.md", valid())
    putFile(dir, "zz-任务.md", "---\nstatus: 待办\ncreated: 20260903\nupdated: 20260903\ncompleted: ''\ndepends_on: []\nscope: 测\n---\n\n# 标题\n")
    putFile(dir, "20260902-唐启云-b.md", valid().replace("created: 20260903", "created: 20260905"))
    const warns = warnTexts(dir)
    expect(warns.some((m) => m.includes("缺少 owner"))).toBe(true)
    expect(warns.some((m) => m.includes("文件名不符合规范"))).toBe(true)
    expect(warns.some((m) => m.includes("与 created"))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it("created/completed 非真实日期软告警（E5）", () => {
    const dir = taskDir()
    putFile(dir, "20260903-唐启云-a.md", valid().replace("created: 20260903", "created: 20261399"))
    putFile(dir, "20260903-唐启云-b.md", valid().replace("completed: ''", "completed: '2026-02-31 08:00'"))
    const warns = warnTexts(dir)
    expect(warns.some((m) => m.includes("created「20261399」日期不存在"))).toBe(true)
    expect(warns.some((m) => m.includes("completed「2026-02-31 08:00」日期不存在"))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it("check.pendingMarkers=false 关闭词标记扫描（E8）", () => {
    const dir = taskDir()
    putFile(dir, "20260903-唐启云-m.md", valid("", "\n说明：仍有待办收尾项。\n"))
    // 默认开：词标记「待办」会告警
    expect(warnTexts(dir).some((m) => m.includes("未闭合待办标记"))).toBe(true)

    // 配置关闭：词标记不再告警
    const cfgDir = mkdtempSync(join(tmpdir(), "tk-cfg-pm-"))
    writeFileSync(join(cfgDir, ".toolkitrc.json"), JSON.stringify({ check: { pendingMarkers: false } }), "utf8")
    process.chdir(cfgDir)
    resetToolkitConfigCache()
    expect(warnTexts(dir).some((m) => m.includes("未闭合待办标记"))).toBe(false)
    process.chdir(cwd)
    resetToolkitConfigCache()
    rmSync(dir, { recursive: true, force: true })
    rmSync(cfgDir, { recursive: true, force: true })
  })

  it("- [ ] 默认作为未闭合待办扫描，配置关闭后不报（A6）", () => {
    const dir = taskDir()
    putFile(dir, "20260903-唐启云-box.md", valid("", "\n- [ ] 待勾选\n"))
    expect(warnTexts(dir).some((m) => m.includes("未勾选"))).toBe(true)

    // 关闭复选框扫描：进入带 .toolkitrc.json 的临时目录再校验
    const cfgDir = mkdtempSync(join(tmpdir(), "tk-cfg-"))
    writeFileSync(join(cfgDir, ".toolkitrc.json"), JSON.stringify({ check: { includeCheckbox: false } }), "utf8")
    process.chdir(cfgDir)
    resetToolkitConfigCache()
    expect(warnTexts(dir).some((m) => m.includes("未勾选"))).toBe(false)
    process.chdir(cwd)
    resetToolkitConfigCache()
    rmSync(dir, { recursive: true, force: true })
    rmSync(cfgDir, { recursive: true, force: true })
  })
})

describe("importTasks 写入与映射", () => {
  it("冲突序号从 -1 起、超长标题截断告警（A7）", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tk-import-"))
    mkdirSync(join(dir, "active"), { recursive: true })
    mkdirSync(join(dir, "archive"), { recursive: true })
    const csv = join(dir, "in.csv")
    const longTitle = "这个标题真的非常非常长用来验证文件名会被截断的情况发生"
    writeFileSync(csv, `任务名,负责人,状态,创建日期\n同名任务,甲,待办,20260903\n同名任务,甲,待办,20260903\n${longTitle},乙,待办,20260903\n`, "utf8")
    const res = await importTasks(csv, dir, {})
    expect(res.created).toBe(3)
    expect(res.warnings.some((w) => w.includes("截断"))).toBe(true)
    const files = ["20260903-甲-同名任务.md", "20260903-甲-同名任务-1.md"]
    for (const f of files) expect(existsSync(join(dir, "active", "202609", f))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it("纯日期 completed 落盘补 00:00（A4）", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tk-import2-"))
    mkdirSync(join(dir, "active"), { recursive: true })
    mkdirSync(join(dir, "archive"), { recursive: true })
    const csv = join(dir, "in.csv")
    writeFileSync(csv, "标题,负责人,状态,完成时间,创建日期\n补全时间,甲,已完成,2026-09-03,20260903\n", "utf8")
    await importTasks(csv, dir, {})
    const text = readFileSync(join(dir, "active", "202609", "20260903-甲-补全时间.md"), "utf8")
    expect(text).toContain("completed: '2026-09-03 00:00'")
    rmSync(dir, { recursive: true, force: true })
  })

  it("英文大写自定义列映射生效（C5）", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tk-import3-"))
    mkdirSync(join(dir, "active"), { recursive: true })
    mkdirSync(join(dir, "archive"), { recursive: true })
    const csv = join(dir, "in.csv")
    writeFileSync(csv, "MyTitle,负责人,状态,Deadline,创建日期\n大写映射任务,甲,待办,2026-09-02 08:00,20260903\n", "utf8")
    const res = await importTasks(csv, dir, { importColumns: { MyTitle: "title", Deadline: "completed" } })
    expect(res.created).toBe(1)
    const text = readFileSync(join(dir, "active", "202609", "20260903-甲-大写映射任务.md"), "utf8")
    expect(text).toContain("# 大写映射任务")
    expect(text).toContain("completed: '2026-09-02 08:00'")
    rmSync(dir, { recursive: true, force: true })
  })
})
