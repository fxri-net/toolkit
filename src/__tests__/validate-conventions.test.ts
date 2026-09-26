// 规范载体形态告警：旧单文件提示迁移、目录形态缺 index.md 提示补齐、v2 良构不告警、形态异常交人工确认
// 入口层告警：壳标记版本落后 / 壳被 gitignore 覆盖；均软告警，不读条文内容
import { describe, it, expect } from "vitest"
import { execSync } from "node:child_process"
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { validateTasks } from "../tasks/validate"
import { CARRIER_MARKER, ENTRY_MARKER, ENTRY_VERSION, HISTORY_TITLE, ID_HEADER, idOf } from "../conventions/format"
import { ENTRY_SHELL_NAME, SKILL_ENTRY } from "../conventions/entry"

const warnTexts = (dir: string, cwd?: string) => validateTasks(dir, cwd).issues.filter((i) => i.level === "warn").map((i) => i.message)

// 空临时目录（作为 cwd 隔离入口层探测，避免读到本仓库真实壳）
function makeTmp(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

const header = "---\nowner: 唐启云\nstatus: 待办\ncreated: 20260904\nupdated: 20260904\ncompleted: ''\ndepends_on: []\nscope: x\n---\n\n# t\n"

describe("规范载体形态告警", () => {
  it("旧单文件 conventions.md 提示迁移，且不被误判为游离任务文件", () => {
    const dir = mkdtempSync(join(tmpdir(), "tk-conv-legacy-"))
    mkdirSync(join(dir, "active"), { recursive: true })
    writeFileSync(join(dir, "conventions.md"), "# 项目协作规范\n", "utf8")

    const warns = warnTexts(dir)
    expect(warns.filter((m) => m.includes("建议迁移为 conventions/ 目录形态"))).toHaveLength(1)
    expect(warns.some((m) => m.includes("游离于 active/ 之外"))).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })

  it("目录形态缺 index.md 提示补齐", () => {
    const dir = mkdtempSync(join(tmpdir(), "tk-conv-noindex-"))
    mkdirSync(join(dir, "active"), { recursive: true })
    mkdirSync(join(dir, "conventions"), { recursive: true })
    writeFileSync(join(dir, "conventions", "web.md"), "# web 规范\n", "utf8")

    const warns = warnTexts(dir)
    expect(warns.filter((m) => m.includes("缺 index.md"))).toHaveLength(1)
    rmSync(dir, { recursive: true, force: true })
  })

  it("新旧并存时提示清理旧文件，目录形态完整时无规范载体告警", () => {
    const dir = mkdtempSync(join(tmpdir(), "tk-conv-both-"))
    mkdirSync(join(dir, "active", "202609"), { recursive: true })
    writeFileSync(join(dir, "active", "202609", "20260904-唐启云-正常任务.md"), header, "utf8")
    writeFileSync(join(dir, "conventions.md"), "# 旧规范\n", "utf8")
    mkdirSync(join(dir, "conventions"), { recursive: true })
    writeFileSync(join(dir, "conventions", "index.md"), "# 项目协作规范索引\n", "utf8")

    const warns = warnTexts(dir)
    expect(warns.filter((m) => m.includes("建议清理"))).toHaveLength(1)
    expect(warns.some((m) => m.includes("缺 index.md"))).toBe(false)
    expect(warns.some((m) => m.includes("游离于 active/ 之外"))).toBe(false)

    // 清理旧文件后即无任何规范载体告警（分册与 index.md 均不触发游离文件误报）
    rmSync(join(dir, "conventions.md"))
    writeFileSync(join(dir, "conventions", "web.md"), "# web 规范\n", "utf8")
    const after = warnTexts(dir)
    expect(after.filter((m) => m.includes("conventions"))).toEqual([])
    rmSync(dir, { recursive: true, force: true })
  })
})

// v2 良构载体假现场：首行标记 + history.md + 索引表首列为稳定 ID
const V2_INDEX = `${CARRIER_MARKER}
# 项目协作规范索引

## 一、端清单

| 端名 | 说明 |
| --- | --- |

## 二、索引

| ${ID_HEADER} | 规则 | 当前语义 |
| --- | --- | --- |
| ${idOf(1)} | 四级时间源 | 当场打点优先 |
`

describe("规范载体 v2 形态告警", () => {
  it("v2 良构不告警，v1 合法存量同样不告警", () => {
    const dir = makeTmp("tk-conv-v2-")
    const cwd = makeTmp("tk-conv-v2-cwd-")
    mkdirSync(join(dir, "active"), { recursive: true })
    mkdirSync(join(dir, "conventions"), { recursive: true })
    writeFileSync(join(dir, "conventions", "index.md"), V2_INDEX, "utf8")
    writeFileSync(join(dir, "conventions", "history.md"), `${HISTORY_TITLE}\n`, "utf8")

    const warns = warnTexts(dir, cwd)
    expect(warns.filter((m) => m.includes("规范载体"))).toEqual([])

    rmSync(dir, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
  })

  it("标为 v2 却缺 history.md 时告警并指向 conventions upgrade", () => {
    const dir = makeTmp("tk-conv-v2nohist-")
    const cwd = makeTmp("tk-conv-v2nohist-cwd-")
    mkdirSync(join(dir, "active"), { recursive: true })
    mkdirSync(join(dir, "conventions"), { recursive: true })
    writeFileSync(join(dir, "conventions", "index.md"), V2_INDEX, "utf8")

    const warns = warnTexts(dir, cwd)
    expect(warns.filter((m) => m.includes("toolkit conventions upgrade"))).toHaveLength(1)
    rmSync(dir, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
  })

  it("有 history.md 但索引表首列仍为序号时告警并交人工确认", () => {
    const dir = makeTmp("tk-conv-abnormal-")
    const cwd = makeTmp("tk-conv-abnormal-cwd-")
    mkdirSync(join(dir, "active"), { recursive: true })
    mkdirSync(join(dir, "conventions"), { recursive: true })
    writeFileSync(join(dir, "conventions", "index.md"), "# 项目协作规范索引\n\n| # | 规则 | 当前语义 |\n| --- | --- | --- |\n| 1 | 甲 | 乙 |\n", "utf8")
    writeFileSync(join(dir, "conventions", "history.md"), `${HISTORY_TITLE}\n`, "utf8")

    const warns = warnTexts(dir, cwd)
    expect(warns.filter((m) => m.includes("形态异常") && m.includes("请人工确认"))).toHaveLength(1)
    rmSync(dir, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
  })
})

describe("入口壳告警", () => {
  it("壳标记版本落后或无标记时各告警一条，版本一致者不告警", () => {
    const dir = makeTmp("tk-conv-shell-")
    const cwd = makeTmp("tk-conv-shell-cwd-")
    mkdirSync(join(dir, "active"), { recursive: true })
    const writeShell = (skillDir: string, content: string) => {
      const target = join(cwd, skillDir, ENTRY_SHELL_NAME)
      mkdirSync(target, { recursive: true })
      writeFileSync(join(target, SKILL_ENTRY), content, "utf8")
    }
    writeShell(".trae/skills", `---\nname: ${ENTRY_SHELL_NAME}\n---\n\n<!-- toolkit-conventions-entry: v${ENTRY_VERSION - 1} -->\n`)
    writeShell(".cursor/skills", `---\nname: ${ENTRY_SHELL_NAME}\n---\n\n无标记壳\n`)
    writeShell(".claude/skills", `---\nname: ${ENTRY_SHELL_NAME}\n---\n\n${ENTRY_MARKER}\n`)

    const warns = warnTexts(dir, cwd)
    expect(warns.filter((m) => m.includes(`入口壳标记版本为 ${ENTRY_VERSION - 1}`))).toHaveLength(1)
    expect(warns.filter((m) => m.includes("入口壳标记版本为 无"))).toHaveLength(1)
    expect(warns.filter((m) => m.includes("入口壳标记版本"))).toHaveLength(2)
    rmSync(dir, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
  })

  it("壳路径被 gitignore 覆盖时告警", () => {
    const dir = makeTmp("tk-conv-shellign-")
    const cwd = makeTmp("tk-conv-shellign-cwd-")
    mkdirSync(join(dir, "active"), { recursive: true })
    execSync("git init -q", { cwd })
    writeFileSync(join(cwd, ".gitignore"), ".trae/skills/\n", "utf8")
    const target = join(cwd, ".trae", "skills", ENTRY_SHELL_NAME)
    mkdirSync(target, { recursive: true })
    writeFileSync(join(target, SKILL_ENTRY), `---\nname: ${ENTRY_SHELL_NAME}\n---\n\n${ENTRY_MARKER}\n`, "utf8")

    const warns = warnTexts(dir, cwd)
    expect(warns.filter((m) => m.includes("被 gitignore 覆盖"))).toHaveLength(1)
    rmSync(dir, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
  })
})
