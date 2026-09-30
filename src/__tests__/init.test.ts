// init 命令单测：骨架生成、重复执行幂等、.gitignore 追加与跳过、技能入口层、全局技能安装态
import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest"
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execSync } from "node:child_process"
import { initWorkspace } from "../init"
import { todayCompact } from "../date"
import { resetToolkitConfigCache, setHomeDirForTest } from "../config"
import { skillsStateFile } from "../skills"
import { CARRIER_MARKER, ENTRY_MARKER, ENTRY_VERSION, HISTORY_TITLE } from "../conventions/format"
import { AGENTS_POINTER_END, AGENTS_POINTER_START, ENTRY_SHELL_NAME, FALLBACK_SKILL_DIR, SKILL_ENTRY } from "../conventions/entry"

// 临时目录中执行 init 并清理
function runInDir(prefix = "tk-init-"): { cwd: string; gitignore: () => string } {
  const cwd = mkdtempSync(join(tmpdir(), prefix))
  return {
    cwd,
    gitignore: () => readFileSync(join(cwd, ".gitignore"), "utf8"),
  }
}

// 各用例独立建临时目录，结束后统一清理
const dirs: string[] = []
function track<T extends { cwd: string }>(result: T): T {
  dirs.push(result.cwd)
  return result
}

describe("initWorkspace 骨架生成", () => {
  it("空目录生成 active/{当月}/、archive/ 与 .gitignore 片段", () => {
    const { cwd } = track(runInDir("tk-init-empty-"))
    initWorkspace(".tasks", cwd)
    const month = todayCompact().slice(0, 6)
    expect(existsSync(join(cwd, ".tasks", "active", month))).toBe(true)
    expect(existsSync(join(cwd, ".tasks", "archive"))).toBe(true)
    expect(existsSync(join(cwd, ".gitignore"))).toBe(true)
    expect(readFileSync(join(cwd, ".gitignore"), "utf8")).toContain(".archive.lock")
  })

  it("重复执行幂等：目录与 .gitignore 内容不变", () => {
    const { cwd, gitignore } = track(runInDir("tk-init-twice-"))
    initWorkspace(".tasks", cwd)
    const before = gitignore()
    initWorkspace(".tasks", cwd)
    expect(gitignore()).toBe(before)
    expect(gitignore().match(/\.archive\.lock/g)).toHaveLength(1)
  })

  it("自定义 --dir：在指定目录生成骨架", () => {
    const { cwd } = track(runInDir("tk-init-dir-"))
    const month = todayCompact().slice(0, 6)
    initWorkspace("work", cwd)
    expect(existsSync(join(cwd, "work", "active", month))).toBe(true)
    expect(existsSync(join(cwd, "work", "archive"))).toBe(true)
  })

  it("绝对路径 --dir：任务区生成到项目外指定目录", () => {
    const { cwd } = track(runInDir("tk-init-abs-"))
    const outer = mkdtempSync(join(tmpdir(), "tk-init-outer-"))
    track({ cwd: outer })
    const month = todayCompact().slice(0, 6)
    initWorkspace(outer, cwd)
    expect(existsSync(join(outer, "active", month))).toBe(true)
    expect(existsSync(join(outer, "archive"))).toBe(true)
    // .gitignore 片段仍写入项目内
    expect(existsSync(join(cwd, ".gitignore"))).toBe(true)
  })
})

describe("initWorkspace 规范载体骨架", () => {
  it("空目录生成 index.md（三节，首行为 v2 标记）与 history.md", () => {
    const { cwd } = track(runInDir("tk-init-conv-"))
    initWorkspace(".tasks", cwd)
    const index = readFileSync(join(cwd, ".tasks", "conventions", "index.md"), "utf8")
    expect(index.split(/\r?\n/, 1)[0]).toBe(CARRIER_MARKER)
    expect(index).toContain("## 一、端清单")
    expect(index).toContain("## 二、索引")
    expect(index).toContain("## 三、用法说明")
    expect(index).not.toContain("## 四、")
    const history = readFileSync(join(cwd, ".tasks", "conventions", "history.md"), "utf8")
    expect(history.split(/\r?\n/, 1)[0]).toBe(HISTORY_TITLE)
  })

  it("重复执行与已有索引均不覆盖", () => {
    const { cwd } = track(runInDir("tk-init-conv-keep-"))
    const index = join(cwd, ".tasks", "conventions", "index.md")
    mkdirSync(join(cwd, ".tasks", "conventions"), { recursive: true })
    writeFileSync(index, "custom", "utf8")
    initWorkspace(".tasks", cwd)
    expect(readFileSync(index, "utf8")).toBe("custom")
  })

  it("旧单文件 conventions.md 存在时不建空骨架（迁移由迁移流程接管）", () => {
    const { cwd } = track(runInDir("tk-init-conv-legacy-"))
    mkdirSync(join(cwd, ".tasks"), { recursive: true })
    writeFileSync(join(cwd, ".tasks", "conventions.md"), "# 旧规范\n", "utf8")
    initWorkspace(".tasks", cwd)
    expect(existsSync(join(cwd, ".tasks", "conventions"))).toBe(false)
  })

  it("已有 v1 载体时保持不动并在报告里提示可升级", () => {
    const { cwd } = track(runInDir("tk-init-conv-v1-"))
    const dir = join(cwd, ".tasks", "conventions")
    mkdirSync(dir, { recursive: true })
    const v1 =
      "# 项目协作规范索引\n\n## 二、索引\n\n| # | 规则 | 当前语义 | 归属 | 状态 | 确立来源任务 | 单一事实源 |\n| --- | --- | --- | --- | --- | --- | --- |\n| 1 | 甲 | 乙 | common | 生效 | t | common.md |\n"
    writeFileSync(join(dir, "index.md"), v1, "utf8")

    const report = initWorkspace(".tasks", cwd)
    expect(readFileSync(join(dir, "index.md"), "utf8")).toBe(v1)
    const kept = report.products.find((p) => p.target.endsWith("conventions/index.md"))
    expect(kept?.action).toBe("kept")
    expect(kept?.hint).toContain("toolkit conventions upgrade")
  })
})

describe("initWorkspace 技能入口层", () => {
  it("生成入口壳（无候选目录时回落 .agents/skills）并在 AGENTS.md 已存在时追加指针块", () => {
    const { cwd } = track(runInDir("tk-init-shell-"))
    writeFileSync(join(cwd, "AGENTS.md"), "# AGENTS\n", "utf8")

    const report = initWorkspace(".tasks", cwd)
    const shellFile = join(cwd, FALLBACK_SKILL_DIR, ENTRY_SHELL_NAME, SKILL_ENTRY)
    expect(existsSync(shellFile)).toBe(true)
    const shell = readFileSync(shellFile, "utf8")
    // frontmatter 置顶（Agent Skills 标准），形态标记退居其后
    expect(shell.split(/\r?\n/, 1)[0]).toBe("---")
    expect(shell).toContain(`name: ${ENTRY_SHELL_NAME}`)
    expect(shell).toContain(ENTRY_MARKER)
    const agents = readFileSync(join(cwd, "AGENTS.md"), "utf8")
    expect(agents).toContain(AGENTS_POINTER_START)
    expect(agents).toContain(AGENTS_POINTER_END)
    expect(report.products.some((p) => p.action === "appended" && p.target === "AGENTS.md")).toBe(true)
  })

  it("只落到已存在的候选目录，不另造 .agents/", () => {
    const { cwd } = track(runInDir("tk-init-shelldir-"))
    // 候选目录存在与否是假现场输入，落点路径按约定拼装；此处只存在非首个候选目录
    const skillDir = ".trae/skills"
    mkdirSync(join(cwd, skillDir), { recursive: true })

    const report = initWorkspace(".tasks", cwd)
    const rel = `${skillDir}/${ENTRY_SHELL_NAME}/${SKILL_ENTRY}`
    expect(existsSync(join(cwd, rel))).toBe(true)
    expect(existsSync(join(cwd, FALLBACK_SKILL_DIR))).toBe(false)
    expect(report.products.some((p) => p.target === rel && p.action === "created")).toBe(true)
  })

  it("多个候选目录并存时各落一份入口壳，指针块去路径化覆盖全部落点", () => {
    const { cwd } = track(runInDir("tk-init-shellmulti-"))
    const skillDirs = [".agents/skills", ".trae/skills"]
    for (const rel of skillDirs) mkdirSync(join(cwd, rel), { recursive: true })
    writeFileSync(join(cwd, "AGENTS.md"), "# AGENTS\n", "utf8")

    const report = initWorkspace(".tasks", cwd)
    for (const rel of skillDirs) {
      const target = `${rel}/${ENTRY_SHELL_NAME}/${SKILL_ENTRY}`
      expect(existsSync(join(cwd, target))).toBe(true)
      expect(report.products.some((p) => p.target === target && p.action === "created")).toBe(true)
    }
    // 指针块只描述入口壳形态、不写死落点：写死首个会误导只读其他候选目录的 agent
    const agents = readFileSync(join(cwd, "AGENTS.md"), "utf8")
    expect(agents).toContain(`项目级技能目录下的 \`${ENTRY_SHELL_NAME}/${SKILL_ENTRY}\``)
    for (const rel of skillDirs) expect(agents).not.toContain(`${rel}/${ENTRY_SHELL_NAME}`)
  })

  it("重复执行幂等：入口壳与指针块均保持不动", () => {
    const { cwd } = track(runInDir("tk-init-shelltwice-"))
    writeFileSync(join(cwd, "AGENTS.md"), "# AGENTS\n", "utf8")
    initWorkspace(".tasks", cwd)
    const agents = readFileSync(join(cwd, "AGENTS.md"), "utf8")

    const second = initWorkspace(".tasks", cwd)
    expect(readFileSync(join(cwd, "AGENTS.md"), "utf8")).toBe(agents)
    expect(second.products.filter((p) => p.action === "created")).toHaveLength(0)
  })

  it("入口壳按标记版本分流：落后或无标记就地更新，标记不旧于当前保持不动", () => {
    const { cwd } = track(runInDir("tk-init-shellver-"))
    const rel = `${FALLBACK_SKILL_DIR}/${ENTRY_SHELL_NAME}/${SKILL_ENTRY}`
    const shellFile = join(cwd, rel)
    mkdirSync(join(cwd, FALLBACK_SKILL_DIR, ENTRY_SHELL_NAME), { recursive: true })
    const writeShell = (body: string) => writeFileSync(shellFile, `---\nname: ${ENTRY_SHELL_NAME}\n---\n\n${body}\n`, "utf8")

    // 标记落后一版：就地更新为当前版本，并如实报「更新」而非「保持」——否则告警里的「重跑 init 可补齐」是空头承诺
    writeShell(`<!-- toolkit-conventions-entry: v${ENTRY_VERSION - 1} -->\n人工补充的壳内容`)
    const stale = initWorkspace(".tasks", cwd).products.find((p) => p.target === rel)
    expect(stale?.action).toBe("updated")
    expect(stale?.detail).toContain(`已就地更新为 v${ENTRY_VERSION}`)
    expect(readFileSync(shellFile, "utf8")).toContain(ENTRY_MARKER)

    // 无标记壳（锚点改造前生成）：同样就地补上标记
    writeShell("无标记壳")
    const unmarked = initWorkspace(".tasks", cwd).products.find((p) => p.target === rel)
    expect(unmarked?.action).toBe("updated")
    expect(unmarked?.detail).toContain(`无标记，已就地更新为 v${ENTRY_VERSION}`)

    // 标记超前（壳由更新版 toolkit 生成）：不降级覆盖，如实报告保持
    writeShell(`<!-- toolkit-conventions-entry: v${ENTRY_VERSION + 1} -->\n更新版壳内容`)
    const ahead = initWorkspace(".tasks", cwd).products.find((p) => p.target === rel)
    expect(ahead?.action).toBe("kept")
    expect(ahead?.detail).toContain("不降级覆盖")
    expect(readFileSync(shellFile, "utf8")).toContain(`v${ENTRY_VERSION + 1}`)
  })

  it("AGENTS.md 不存在时不新建，指针块记为跳过并提示全局技能仍可触达", () => {
    const { cwd } = track(runInDir("tk-init-noagents-"))
    const report = initWorkspace(".tasks", cwd)
    expect(existsSync(join(cwd, "AGENTS.md"))).toBe(false)
    const skipped = report.products.find((p) => p.target === "AGENTS.md")
    expect(skipped?.action).toBe("skipped")
    expect(skipped?.hint).toContain("fxri-plan-to-task")
  })

  it("源仓库（package.json name 为 @fxri/toolkit）不生成入口壳与指针块", () => {
    const { cwd } = track(runInDir("tk-init-src-"))
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ name: "@fxri/toolkit", version: "0.0.0" }), "utf8")
    writeFileSync(join(cwd, "AGENTS.md"), "# AGENTS\n", "utf8")

    const report = initWorkspace(".tasks", cwd)
    expect(existsSync(join(cwd, FALLBACK_SKILL_DIR))).toBe(false)
    expect(readFileSync(join(cwd, "AGENTS.md"), "utf8")).toBe("# AGENTS\n")
    expect(report.products.some((p) => p.action === "skipped" && p.target === "技能入口层")).toBe(true)
  })
})

describe("initWorkspace 全局技能安装态", () => {
  // home 注入独立临时目录：状态文件只读临时目录，不触碰真实用户全局技能目录
  let home = ""
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "tk-init-home-"))
    setHomeDirForTest(home)
    resetToolkitConfigCache()
  })
  afterEach(() => {
    setHomeDirForTest(undefined)
    resetToolkitConfigCache()
    rmSync(home, { recursive: true, force: true })
  })

  // 手工写状态文件：模拟上一次 skills install 的留痕
  function writeState(links: string[]): void {
    mkdirSync(join(home, ".agents"), { recursive: true })
    const now = new Date().toISOString()
    const state = { version: 1, updatedAt: now, targets: [{ dir: join(home, ".agents", "skills"), updatedAt: now, links, copies: [] }] }
    writeFileSync(skillsStateFile(), `${JSON.stringify(state, null, 2)}\n`, "utf8")
  }

  it("未装全局技能时 skillsInstalled 为假，CLI 据此补一行 skills install 指引", () => {
    const { cwd } = track(runInDir("tk-init-noskills-"))
    expect(initWorkspace(".tasks", cwd).skillsInstalled).toBe(false)
  })

  it("状态文件登记了本包技能时 skillsInstalled 为真，CLI 不再重复提示", () => {
    writeState(["fxri-plan-to-task"])
    const { cwd } = track(runInDir("tk-init-hasskills-"))
    expect(initWorkspace(".tasks", cwd).skillsInstalled).toBe(true)
  })
})

describe("initWorkspace .gitignore 处理", () => {
  it("已有 .gitignore 且结尾无换行：追加片段并保留原内容", () => {
    const { cwd, gitignore } = track(runInDir("tk-init-append-"))
    writeFileSync(join(cwd, ".gitignore"), "node_modules", "utf8")
    initWorkspace(".tasks", cwd)
    const content = gitignore()
    expect(content.startsWith("node_modules")).toBe(true)
    expect(content).toContain("# @fxri/toolkit")
    expect(content).toContain(".archive.lock")
    expect(content).toContain(".toolkitrc.local.json")
  })

  it("片段部分已存在（CRLF 风格）时只补缺失行并保留原内容", () => {
    const { cwd, gitignore } = track(runInDir("tk-init-partial-"))
    writeFileSync(join(cwd, ".gitignore"), "node_modules\r\n.archive.lock\r\n", "utf8")
    initWorkspace(".tasks", cwd)
    const content = gitignore()
    expect(content.startsWith("node_modules\r\n.archive.lock\r\n")).toBe(true)
    expect(content).toContain(".toolkitrc.local.json")
    // 已覆盖的行不重复追加
    expect(content.match(/\.archive\.lock/g)).toHaveLength(1)
  })

  it("用户已手写等价忽略写法时视为已覆盖，不再追加对应行", () => {
    const { cwd, gitignore } = track(runInDir("tk-init-equiv-"))
    writeFileSync(join(cwd, ".gitignore"), "node_modules\n*.local.json\n", "utf8")
    initWorkspace(".tasks", cwd)
    const content = gitignore()
    // *.local.json 等价于 .toolkitrc.local.json，只补排他锁
    expect(content).not.toContain(".toolkitrc.local.json")
    expect(content).toContain(".archive.lock")
  })

  it("旧注释文案陈旧时就地改写并补齐缺失行，不留双注释", () => {
    const { cwd, gitignore } = track(runInDir("tk-init-stale-"))
    writeFileSync(join(cwd, ".gitignore"), "node_modules\n# @fxri/toolkit 归档排他锁（运行时文件，不入库）\n.archive.lock\n", "utf8")
    initWorkspace(".tasks", cwd)
    const content = gitignore()
    expect(content.match(/# @fxri\/toolkit/g)).toHaveLength(1)
    expect(content).toContain("忽略片段")
    expect(content).toContain(".toolkitrc.local.json")
    expect(content.match(/\.archive\.lock/g)).toHaveLength(1)
  })

  it(".tasks 已存在时保留现有内容不覆盖", () => {
    const { cwd } = track(runInDir("tk-init-keep-"))
    mkdirSync(join(cwd, ".tasks", "active"), { recursive: true })
    writeFileSync(join(cwd, ".tasks", "active", "keep.md"), "keep", "utf8")
    initWorkspace(".tasks", cwd)
    expect(readFileSync(join(cwd, ".tasks", "active", "keep.md"), "utf8")).toBe("keep")
  })

  it("报告 detail 同时点明 .archive.lock 与 .toolkitrc.local.json 两个文件名", () => {
    const { cwd } = track(runInDir("tk-init-detail-"))
    const report = initWorkspace(".tasks", cwd)
    const product = report.products.find((p) => p.target === ".gitignore")
    expect(product?.action).toBe("created")
    expect(product?.detail).toContain(".archive.lock")
    expect(product?.detail).toContain(".toolkitrc.local.json")
  })

  it("手删 .archive.lock 单行后重跑只补回该行，两行各出现一次", () => {
    const { cwd, gitignore } = track(runInDir("tk-init-readd-"))
    initWorkspace(".tasks", cwd)
    // 模拟用户手删排他锁行，保留本地配置行
    const stripped = gitignore()
      .split(/\r?\n/)
      .filter((line) => line.trim() !== ".archive.lock")
      .join("\n")
    writeFileSync(join(cwd, ".gitignore"), stripped, "utf8")

    initWorkspace(".tasks", cwd)
    const content = gitignore()
    expect(content.match(/\.archive\.lock/g)).toHaveLength(1)
    expect(content.match(/\.toolkitrc\.local\.json/g)).toHaveLength(1)
  })

  it("用户以前导斜杠写法 /（.toolkitrc.local.json）时视为已覆盖，只补排他锁", () => {
    const { cwd, gitignore } = track(runInDir("tk-init-slash-"))
    writeFileSync(join(cwd, ".gitignore"), "node_modules\n/.toolkitrc.local.json\n", "utf8")
    initWorkspace(".tasks", cwd)
    const content = gitignore()
    expect(content).toContain(".archive.lock")
    // 本地配置行只保留用户那一行，不重复追加
    expect(content.match(/\.toolkitrc\.local\.json/g)).toHaveLength(1)
  })

  it("用户以 .toolkitrc.* 通配写法时视为已覆盖，不再追加本地配置行", () => {
    const { cwd, gitignore } = track(runInDir("tk-init-glob-"))
    writeFileSync(join(cwd, ".gitignore"), "node_modules\n.toolkitrc.*\n", "utf8")
    initWorkspace(".tasks", cwd)
    const content = gitignore()
    expect(content).toContain(".archive.lock")
    expect(content).not.toContain(".toolkitrc.local.json")
  })

  it("新建片段含 .git/info/exclude 出口指引，且认领注释行唯一", () => {
    const { cwd, gitignore } = track(runInDir("tk-init-hint-"))
    initWorkspace(".tasks", cwd)
    const content = gitignore()
    // 出口指引为独立注释行，且不以 marker 开头（避免被误认领为第二条认领行）
    expect(content).toContain(".git/info/exclude")
    expect(content.match(/# @fxri\/toolkit/g)).toHaveLength(1)
  })

  it("片段头缺出口指引时重跑就地补上，且不重复追加忽略行", () => {
    const { cwd, gitignore } = track(runInDir("tk-init-hint-add-"))
    // 旧式片段：有认领注释与两行忽略项，但缺出口指引
    writeFileSync(
      join(cwd, ".gitignore"),
      "node_modules\n# @fxri/toolkit 忽略片段（运行时文件与个人本地配置，不入库）\n.archive.lock\n.toolkitrc.local.json\n",
      "utf8",
    )
    const report = initWorkspace(".tasks", cwd)
    const content = gitignore()
    expect(content).toContain(".git/info/exclude")
    expect(content.match(/# @fxri\/toolkit/g)).toHaveLength(1)
    expect(content.match(/\.archive\.lock/g)).toHaveLength(1)
    expect(content.match(/\.toolkitrc\.local\.json/g)).toHaveLength(1)
    expect(report.products.find((p) => p.target === ".gitignore")?.action).toBe("updated")
  })

  it("git 仓库中通配写法已真实覆盖时整文件保持不动", () => {
    const { cwd, gitignore } = track(runInDir("tk-init-repo-covered-"))
    execSync("git init -q", { cwd, stdio: "ignore" })
    // *.lock 命中 .archive.lock、*.local.json 命中 .toolkitrc.local.json，均由 git 真实判定
    writeFileSync(join(cwd, ".gitignore"), "node_modules\n*.lock\n*.local.json\n", "utf8")
    const report = initWorkspace(".tasks", cwd)
    const content = gitignore()
    expect(content).toBe("node_modules\n*.lock\n*.local.json\n")
    expect(content).not.toContain(".archive.lock")
    expect(content).not.toContain("# @fxri/toolkit")
    expect(report.products.find((p) => p.target === ".gitignore")?.action).toBe("kept")
  })

  it("git 仓库中部分覆盖时只补缺失行", () => {
    const { cwd, gitignore } = track(runInDir("tk-init-repo-partial-"))
    execSync("git init -q", { cwd, stdio: "ignore" })
    // *.lock 已覆盖 .archive.lock，本地配置行缺失，只应补后者
    writeFileSync(join(cwd, ".gitignore"), "node_modules\n*.lock\n", "utf8")
    initWorkspace(".tasks", cwd)
    const content = gitignore()
    expect(content).not.toContain(".archive.lock")
    expect(content).toContain(".toolkitrc.local.json")
    expect(content.match(/\.toolkitrc\.local\.json/g)).toHaveLength(1)
  })
})

describe("initWorkspace prepare 刷新钩子", () => {
  const PREPARE = "toolkit skills install --scope project"
  const pkgPath = (cwd: string): string => join(cwd, "package.json")
  const writePkg = (cwd: string, pkg: unknown): void => writeFileSync(pkgPath(cwd), `${JSON.stringify(pkg, null, 2)}\n`, "utf8")
  const pkgProduct = (report: ReturnType<typeof initWorkspace>) => report.products.find((p) => p.target === "package.json")

  it("本地依赖存在且无 scripts 字段：补建 scripts.prepare，报告为更新", () => {
    const { cwd } = track(runInDir("tk-init-prep-none-"))
    writePkg(cwd, { name: "demo", devDependencies: { "@fxri/toolkit": "^1.0.0" } })

    const report = initWorkspace(".tasks", cwd)
    expect(pkgProduct(report)?.action).toBe("updated")
    const pkg = JSON.parse(readFileSync(pkgPath(cwd), "utf8")) as { scripts: Record<string, string> }
    expect(pkg.scripts.prepare).toBe(PREPARE)
  })

  it("已有 scripts：最小插入 prepare，保留其余脚本与字段", () => {
    const { cwd } = track(runInDir("tk-init-prep-merge-"))
    writePkg(cwd, { name: "demo", scripts: { build: "tsc" }, devDependencies: { "@fxri/toolkit": "^1.0.0" } })

    const report = initWorkspace(".tasks", cwd)
    expect(pkgProduct(report)?.action).toBe("updated")
    const pkg = JSON.parse(readFileSync(pkgPath(cwd), "utf8")) as { scripts: Record<string, string> }
    expect(pkg.scripts.build).toBe("tsc")
    expect(pkg.scripts.prepare).toBe(PREPARE)
  })

  it("已有等价 prepare 钩子：保持不动", () => {
    const { cwd } = track(runInDir("tk-init-prep-kept-"))
    writePkg(cwd, { name: "demo", scripts: { prepare: "toolkit skills install" }, devDependencies: { "@fxri/toolkit": "^1.0.0" } })
    const before = readFileSync(pkgPath(cwd), "utf8")

    const report = initWorkspace(".tasks", cwd)
    expect(pkgProduct(report)?.action).toBe("kept")
    expect(readFileSync(pkgPath(cwd), "utf8")).toBe(before)
  })

  it("已有非等价 prepare 钩子：跳过并提示，不改写", () => {
    const { cwd } = track(runInDir("tk-init-prep-foreign-"))
    writePkg(cwd, { name: "demo", scripts: { prepare: "husky install" }, devDependencies: { "@fxri/toolkit": "^1.0.0" } })
    const before = readFileSync(pkgPath(cwd), "utf8")

    const report = initWorkspace(".tasks", cwd)
    const product = pkgProduct(report)
    expect(product?.action).toBe("skipped")
    expect(product?.hint).toContain(PREPARE)
    expect(readFileSync(pkgPath(cwd), "utf8")).toBe(before)
  })

  it("--no-hooks：跳过写入且不改动文件", () => {
    const { cwd } = track(runInDir("tk-init-prep-nohooks-"))
    writePkg(cwd, { name: "demo", devDependencies: { "@fxri/toolkit": "^1.0.0" } })
    const before = readFileSync(pkgPath(cwd), "utf8")

    const report = initWorkspace(".tasks", cwd, { hooks: false })
    const product = pkgProduct(report)
    expect(product?.action).toBe("skipped")
    expect(product?.detail).toContain("--no-hooks")
    expect(readFileSync(pkgPath(cwd), "utf8")).toBe(before)
  })

  it("未声明本地依赖：跳过并提示手工写法", () => {
    const { cwd } = track(runInDir("tk-init-prep-nodep-"))
    writePkg(cwd, { name: "demo", scripts: { build: "tsc" } })

    const report = initWorkspace(".tasks", cwd)
    const product = pkgProduct(report)
    expect(product?.action).toBe("skipped")
    expect(product?.hint).toContain(PREPARE)
    const pkg = JSON.parse(readFileSync(pkgPath(cwd), "utf8")) as { scripts: Record<string, string> }
    expect(pkg.scripts.prepare).toBeUndefined()
  })

  it("package.json 不存在或解析失败：跳过并说明原因", () => {
    const noFile = track(runInDir("tk-init-prep-nofile-"))
    expect(pkgProduct(initWorkspace(".tasks", noFile.cwd))?.detail).toContain("不存在")

    const broken = track(runInDir("tk-init-prep-badjson-"))
    writeFileSync(pkgPath(broken.cwd), "{ not json", "utf8")
    expect(pkgProduct(initWorkspace(".tasks", broken.cwd))?.detail).toContain("解析失败")
  })

  it("源仓库（package.json name 为 @fxri/toolkit）：跳过写入", () => {
    const { cwd } = track(runInDir("tk-init-prep-src-"))
    writePkg(cwd, { name: "@fxri/toolkit", devDependencies: { "@fxri/toolkit": "^1.0.0" } })

    const report = initWorkspace(".tasks", cwd)
    const product = pkgProduct(report)
    expect(product?.action).toBe("skipped")
    expect(product?.detail).toContain("源仓库")
  })
})

// 清理全部临时目录
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})