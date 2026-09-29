// config status 只读体检单测：三层命中与来源层、环境变量层与能力旁路、忽略提示、降级项渲染与 JSON 契约
// 期望值直接取真实实现导出的常量（CONFIG_DISPLAY_KEYS / CONFIG_ENV_OVERRIDES 等），不在测试内重写派生逻辑
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { configStatus } from "../config-status"
import { CONFIG_DISPLAY_KEYS, CONFIG_ENV_OVERRIDES, CONFIG_ENV_BYPASS, setHomeDirForTest } from "../config"

// 会被本文件读到的环境变量：逐条保存 / 清空 / 还原，避免宿主机环境串味
const ENV_KEYS = ["CI", "FX_REDACT", "FX_NO_UPDATE_CHECK", "FX_CHECK_WARN"]
const savedEnv: Record<string, string | undefined> = {}
const dirs: string[] = []
// home 临时目录：用例内需向其写全局层配置文件，故提到文件级共享
let home = ""

function makeDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key]
    delete process.env[key]
  }
  // home 指向独立临时目录：全局层不读到真实用户 ~/.toolkitrc.json
  home = makeDir("tk-cfgst-home-")
  setHomeDirForTest(home)
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
  setHomeDirForTest(undefined)
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

// 建项目现场：root 放项目层配置、sub 作查找起点（可另放本地层配置）
function makeProject(files: { root?: object; sub?: object }): { root: string; start: string } {
  const root = makeDir("tk-cfgst-root-")
  if (files.root) writeFileSync(join(root, ".toolkitrc.json"), JSON.stringify(files.root), "utf8")
  let start = root
  if (files.sub) {
    start = join(root, "sub")
    mkdirSync(start, { recursive: true })
    writeFileSync(join(start, ".toolkitrc.local.json"), JSON.stringify(files.sub), "utf8")
  }
  return { root, start }
}

describe("configStatus 三层现场", () => {
  it("三层全空：给正结论、来源全默认、无待处理项", () => {
    const start = makeDir("tk-cfgst-empty-")
    const report = configStatus(start)
    expect(report.summary).toContain("三层均无配置文件")
    expect(report.cwd).toBe(start)
    expect(report.levels.map((l) => l.layer)).toEqual(["全局层", "项目层", "本地层"])
    expect(report.levels.every((l) => l.hit === false && l.file === null)).toBe(true)
    expect(report.displayKeys.map((d) => d.source)).toEqual([null, null, null, null])
    expect(report.items).toEqual([])
    expect(report.warnings).toBe(0)
  })

  it("命中项目层与本地层：来源下沉到叶子键粒度", () => {
    const { start } = makeProject({
      root: { tasks: { dir: "proj-tasks" }, redact: { enabled: true } },
      sub: { redact: { enabled: false } },
    })
    const report = configStatus(start)
    expect(report.summary).toContain("共命中 2 层：项目层、本地层")
    const source = (key: string) => report.displayKeys.find((d) => d.key === key)?.source
    // 同一段各子键来源可不同：redact.enabled 落地在本地层、未被本地覆盖的键仍指项目层
    expect(source("tasks.dir")).toBe("项目层")
    expect(source("redact.enabled")).toBe("本地层")
    expect(source("updateCheck.enabled")).toBeNull()
    expect(source("check.warnings")).toBeNull()
  })

  it("其余已配置段：只列展示键之外仍有字段的段", () => {
    const { start } = makeProject({ sub: { skills: { autoLink: false }, check: { warnings: false } } })
    const local = configStatus(start).levels.find((l) => l.layer === "本地层")
    expect(local?.sections).toEqual(["skills", "check"])
    // check.warnings 是展示键，check 段已在来源里可见；skills 段仅余非展示字段，须单列
    expect(local?.otherSections).toEqual(["skills"])
  })
})

describe("configStatus 环境变量层与能力旁路", () => {
  it("非空即命中，覆盖组与旁路组分别呈现", () => {
    process.env.FX_CHECK_WARN = "1"
    process.env.CI = "1"
    const report = configStatus(makeDir("tk-cfgst-env-"))
    expect(report.env).toEqual([{ env: "FX_CHECK_WARN", key: "check.warnings" }])
    expect(report.bypass).toEqual([{ env: "CI", key: "skills.autoLink" }])
  })

  it("空串按未命中（与 resolveEnabled 同口径）", () => {
    process.env.FX_REDACT = ""
    process.env.CI = ""
    const report = configStatus(makeDir("tk-cfgst-env0-"))
    expect(report.env).toEqual([])
    expect(report.bypass).toEqual([])
  })
})

describe("configStatus 本地层忽略提示", () => {
  it("非 git 仓库：忽略判定不适用，且不被 check.warnings:false 静音", () => {
    const { start } = makeProject({ sub: { check: { warnings: false } } })
    const report = configStatus(start)
    const item = report.items.find((i) => i.scope === "本地层")
    expect(item?.level).toBe("info")
    expect(item?.message).toContain("未检测到 git 仓库")
    expect(report.summary).toContain("未检测到 git 仓库")
    expect(report.warnings).toBe(0)
  })
})

describe("configStatus 降级项渲染", () => {
  it("本地文件为目录：层级记为命中但告警文件读取失败", () => {
    const root = makeDir("tk-cfgst-iodir-")
    mkdirSync(join(root, ".toolkitrc.local.json"))
    const report = configStatus(root)
    const local = report.levels.find((l) => l.layer === "本地层")
    // file 非空即视为命中（定位到了文件路径），解析失败另在 items 报降级
    expect(local?.hit).toBe(true)
    expect(local?.file).not.toBeNull()
    const item = report.items.find((i) => i.message.includes("文件读取失败"))
    expect(item?.level).toBe("warn")
    expect(item?.scope).toBe("配置")
  })

  it("JSON 非法：告警 JSON 解析失败", () => {
    const root = makeDir("tk-cfgst-badjson-")
    writeFileSync(join(root, ".toolkitrc.local.json"), "{ 非法", "utf8")
    const report = configStatus(root)
    expect(report.items.some((i) => i.message.includes("JSON 解析失败"))).toBe(true)
  })

  it("段值非对象：告警配置段须为对象", () => {
    const root = makeDir("tk-cfgst-badsec-")
    writeFileSync(join(root, ".toolkitrc.local.json"), JSON.stringify({ tasks: "oops" }), "utf8")
    const report = configStatus(root)
    const item = report.items.find((i) => i.message.includes("配置段须为对象"))
    expect(item?.level).toBe("warn")
    expect(item?.message).toContain("tasks")
  })

  it("全局层段值非对象：告警配置段须为对象", () => {
    writeFileSync(join(home, ".toolkitrc.json"), JSON.stringify({ tasks: "oops" }), "utf8")
    const report = configStatus(makeDir("tk-cfgst-global-"))
    const item = report.items.find((i) => i.message.includes("配置段须为对象"))
    expect(item?.level).toBe("warn")
    expect(item?.message).toContain("tasks")
    expect(report.warnings).toBeGreaterThanOrEqual(1)
  })

  it("项目层段值非对象：告警配置段须为对象", () => {
    const { start } = makeProject({ root: { tasks: "oops" } })
    const report = configStatus(start)
    const item = report.items.find((i) => i.message.includes("配置段须为对象"))
    expect(item?.level).toBe("warn")
    expect(item?.message).toContain("tasks")
    expect(report.warnings).toBeGreaterThanOrEqual(1)
  })
})

describe("configStatus 报告契约", () => {
  it("JSON 顶层字段集合固定（只增不减）", () => {
    const report = configStatus(makeDir("tk-cfgst-contract-"))
    expect(Object.keys(report).sort()).toEqual([
      "bypass",
      "cwd",
      "displayKeys",
      "env",
      "items",
      "levels",
      "summary",
      "warnings",
    ])
  })

  it("展示键键序与 CONFIG_DISPLAY_KEYS 一致，且覆盖环境变量覆盖组目标键", () => {
    const report = configStatus(makeDir("tk-cfgst-keys-"))
    expect(report.displayKeys.map((d) => d.key)).toEqual([...CONFIG_DISPLAY_KEYS])
    // 不变式：覆盖组目标键必须都在展示键内（旁路组为能力开关，不属配置键，不纳入）
    for (const item of CONFIG_ENV_OVERRIDES) expect(CONFIG_DISPLAY_KEYS).toContain(item.key)
    expect(CONFIG_ENV_BYPASS.length).toBeGreaterThan(0)
  })
})
