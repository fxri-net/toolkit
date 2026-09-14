// active 校验与导入单测：依赖引用归一、元数据/命名软告警、复选框开关、冲突序号与截断告警、自定义列映射、扩展字段透传
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

  it("active 根目录直放任务文件软告警（F1）", () => {
    const dir = taskDir()
    mkdirSync(join(dir, "active"), { recursive: true })
    writeFileSync(join(dir, "active", "20260903-唐启云-root.md"), valid(), "utf8")
    expect(warnTexts(dir).some((m) => m.includes("月份子目录"))).toBe(true)
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

  it("scope 含顿号/逗号/括号软告警，加号多值与干净单值不报", () => {
    const dir = taskDir()
    putFile(dir, "20260903-唐启云-d.md", valid().replace("scope: 测", "scope: a、b"))
    putFile(dir, "20260903-唐启云-e.md", valid().replace("scope: 测", "scope: x(注释)"))
    putFile(dir, "20260903-唐启云-f.md", valid().replace("scope: 测", "scope: a,b"))
    putFile(dir, "20260903-唐启云-g.md", valid().replace("scope: 测", "scope: toolkit+lxgl-web"))
    putFile(dir, "20260903-唐启云-h.md", valid())
    const warns = warnTexts(dir)
    expect(warns.some((m) => m.includes("scope「a、b」") && m.includes("半角加号"))).toBe(true)
    expect(warns.some((m) => m.includes("scope「x(注释)」") && m.includes("移入正文"))).toBe(true)
    expect(warns.some((m) => m.includes("scope「a,b」") && m.includes("半角加号"))).toBe(true)
    expect(warns.filter((m) => m.includes("scope「toolkit+lxgl-web」") || m.includes("scope「测」"))).toHaveLength(0)
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

  it("frontmatter 未知自定义字段软告警（本工具只读已知字段）", () => {
    const dir = taskDir()
    putFile(dir, "20260903-唐启云-a.md", valid().replace("scope: 测", "scope: 测\npriority: 高"))
    expect(warnTexts(dir).some((m) => m.includes("未知字段「priority」"))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
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

  it("导入范围含顿号/括号给单值提示（入口防线，不自动转换）", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tk-import4-"))
    mkdirSync(join(dir, "active"), { recursive: true })
    mkdirSync(join(dir, "archive"), { recursive: true })
    const csv = join(dir, "in.csv")
    writeFileSync(csv, "任务名,负责人,状态,范围,创建日期\n模块任务,甲,待办,service-job、admin-facade,20260903\n注释放错位,甲,待办,pub-facade(注释),20260903\n", "utf8")
    const res = await importTasks(csv, dir, {})
    expect(res.warnings.some((w) => w.includes("按单值写入"))).toBe(true)
    // 只提示不改值：原样落盘，交由 check 口径约束
    expect(readFileSync(join(dir, "active", "202609", "20260903-甲-模块任务.md"), "utf8")).toContain("scope: service-job、admin-facade")
    rmSync(dir, { recursive: true, force: true })
  })

  it("归档导入的状态取自数据，不硬编码已完成", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tk-import-arch1-"))
    mkdirSync(join(dir, "active"), { recursive: true })
    mkdirSync(join(dir, "archive"), { recursive: true })
    const csv = join(dir, "in.csv")
    writeFileSync(csv, "任务名,负责人,状态,完成时间\n放弃任务,甲,已放弃,2026-09-03 10:00\n", "utf8")
    const res = await importTasks(csv, dir, { target: "archive" })
    expect(res.created).toBe(1)
    const text = readFileSync(join(dir, "archive", "202609", "20260903.md"), "utf8")
    expect(text).toContain("状态：已放弃")
    rmSync(dir, { recursive: true, force: true })
  })

  it("重复导入同名归档任务不产生重复块（幂等）", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tk-import-arch2-"))
    mkdirSync(join(dir, "active"), { recursive: true })
    mkdirSync(join(dir, "archive"), { recursive: true })
    const csv = join(dir, "in.csv")
    writeFileSync(csv, "任务名,负责人,状态,完成时间\n重复任务,甲,已完成,2026-09-03 10:00\n", "utf8")
    await importTasks(csv, dir, { target: "archive" })
    await importTasks(csv, dir, { target: "archive" })
    const text = readFileSync(join(dir, "archive", "202609", "20260903.md"), "utf8")
    expect(text.match(/^## 重复任务$/gm) ?? []).toHaveLength(1)
    rmSync(dir, { recursive: true, force: true })
  })

  it("归档导入按目标日期分组写入：同日多记录一次落盘仍保持去重与降序", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tk-import-arch3-"))
    mkdirSync(join(dir, "active"), { recursive: true })
    mkdirSync(join(dir, "archive"), { recursive: true })
    const csv = join(dir, "in.csv")
    writeFileSync(
      csv,
      "任务名,负责人,状态,完成时间\n" +
        "同日早,甲,已完成,2026-09-03 09:00\n" +
        "同日中,甲,已完成,2026-09-03 11:00\n" +
        "同名覆盖,甲,已完成,2026-09-03 08:00\n" +
        "同名覆盖,乙,已完成,2026-09-03 12:00\n" +
        "隔日任务,甲,已完成,2026-09-02 10:00\n",
      "utf8",
    )
    const res = await importTasks(csv, dir, { target: "archive" })
    expect(res.created).toBe(5)
    const sameDay = readFileSync(join(dir, "archive", "202609", "20260903.md"), "utf8")
    // 同日多记录合并为一个文件，块集合仍按完成时间降序
    expect(sameDay.indexOf("## 同名覆盖")).toBeLessThan(sameDay.indexOf("## 同日中"))
    expect(sameDay.indexOf("## 同日中")).toBeLessThan(sameDay.indexOf("## 同日早"))
    // 同日同名以记录中的最后一条为准（乙覆盖甲），且只留一个块
    expect(sameDay).toContain("负责人：乙")
    expect(sameDay.match(/^## 同名覆盖$/gm) ?? []).toHaveLength(1)
    // 不同完成日期各自落到对应日期文件
    expect(readFileSync(join(dir, "archive", "202609", "20260902.md"), "utf8")).toContain("## 隔日任务")
    rmSync(dir, { recursive: true, force: true })
  })

  it("自定义列映射到非标准字段时透传为 frontmatter 扩展字段，且排在已知字段之后", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tk-import-extra1-"))
    mkdirSync(join(dir, "active"), { recursive: true })
    mkdirSync(join(dir, "archive"), { recursive: true })
    const csv = join(dir, "in.csv")
    writeFileSync(csv, "任务名,负责人,状态,创建日期,Priority\n透传任务,甲,待办,20260903,高\n", "utf8")
    const res = await importTasks(csv, dir, { importColumns: { Priority: "priority" } })
    expect(res.created).toBe(1)
    expect(res.warnings).toHaveLength(0)
    const text = readFileSync(join(dir, "active", "202609", "20260903-甲-透传任务.md"), "utf8")
    expect(text).toContain("priority: 高")
    expect(text.indexOf("scope: -")).toBeLessThan(text.indexOf("priority: 高"))
    rmSync(dir, { recursive: true, force: true })
  })

  it("扩展字段列名非法或值含换行时不写入 frontmatter 并告警", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tk-import-extra2-"))
    mkdirSync(join(dir, "active"), { recursive: true })
    mkdirSync(join(dir, "archive"), { recursive: true })
    const csv = join(dir, "in.csv")
    writeFileSync(csv, "任务名,负责人,状态,创建日期,Bad Key,Note\n非法列任务,甲,待办,20260903,值,\"第一行\n第二行\"\n", "utf8")
    const res = await importTasks(csv, dir, { importColumns: { "Bad Key": "bad key", Note: "note" } })
    expect(res.created).toBe(1)
    expect(res.warnings.some((w) => w.includes("自定义列名「bad key」非法"))).toBe(true)
    expect(res.warnings.some((w) => w.includes("自定义列「note」值含换行"))).toBe(true)
    const text = readFileSync(join(dir, "active", "202609", "20260903-甲-非法列任务.md"), "utf8")
    expect(text).not.toContain("bad key")
    expect(text).not.toContain("note:")
    rmSync(dir, { recursive: true, force: true })
  })

  it("archive 目标无 frontmatter 承载位：扩展字段不落盘并显式告警", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tk-import-extra3-"))
    mkdirSync(join(dir, "active"), { recursive: true })
    mkdirSync(join(dir, "archive"), { recursive: true })
    const csv = join(dir, "in.csv")
    writeFileSync(csv, "任务名,负责人,状态,完成时间,Priority\n归档透传任务,甲,已完成,2026-09-03 10:00,高\n", "utf8")
    const res = await importTasks(csv, dir, { target: "archive", importColumns: { Priority: "priority" } })
    expect(res.created).toBe(1)
    expect(res.warnings.some((w) => w.includes("在 archive 目标无承载位置"))).toBe(true)
    expect(readFileSync(join(dir, "archive", "202609", "20260903.md"), "utf8")).not.toContain("priority")
    rmSync(dir, { recursive: true, force: true })
  })
})
