// 规范载体只读体检单测：未初始化提前返回、形态 / 索引 / 入口层三块体检与常态结论
// 期望值直接取真实实现导出的常量（idOf / CARRIER_MARKER / CARRIER_VERSION / ENTRY_VERSION 等），不在测试内重写派生逻辑
import { describe, it, expect, afterAll } from "vitest"
import { execSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { conventionsStatus } from "../conventions/status"
import {
  CARRIER_MARKER,
  CARRIER_VERSION,
  ENTRY_MARKER,
  ENTRY_VERSION,
  HISTORY_TABLE_HEADER,
  HISTORY_TITLE,
  ID_HEADER,
  INDEX_ANCHOR_HEADER,
  INDEX_TITLE,
  RETIRED_ANCHOR_HEADER,
  RETIRED_FILE,
  RETIRED_SKELETON,
  RETIRED_TABLE_HEADER,
  RETIRED_TITLE,
  idOf,
} from "../conventions/format"
import { ENTRY_SHELL_NAME, SKILL_ENTRY } from "../conventions/entry"

// 各用例独立建临时目录，结束后统一清理
const dirs: string[] = []
function makeDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

// v1 载体假现场：首行无标记、索引表首列为序号、无 history.md
const V1_INDEX = `# 项目协作规范索引

## 一、端清单

| 端名 | 说明 |
| --- | --- |

## 二、索引

| # | 规则 | 当前语义 |
| --- | --- | --- |
| 1 | 四级时间源 | 当场打点优先 |
`

// 当前版本载体假现场：首行标记 + history.md + 索引表首列为稳定 ID；端清单声明 web（供归属体检取端名）
function makeCarrier(root: string, rows: string, options: { history?: boolean; extra?: Record<string, string> } = {}): void {
  const dir = join(root, "conventions")
  mkdirSync(dir, { recursive: true })
  const index = `${CARRIER_MARKER}
${INDEX_TITLE}

## 一、端清单

| 端名 | 说明 |
| --- | --- |
| web | 网页端 |

## 二、索引

| ${ID_HEADER} | 规则 | ${INDEX_ANCHOR_HEADER} | 归属 |
| --- | --- | --- | --- |
${rows}
`
  writeFileSync(join(dir, "index.md"), index, "utf8")
  if (options.history !== false) writeFileSync(join(dir, "history.md"), `${HISTORY_TITLE}\n`, "utf8")
  for (const [name, content] of Object.entries(options.extra ?? {})) {
    writeFileSync(join(dir, name), content, "utf8")
  }
}

// 良构单行索引：归属取保留值 common（恒合法，不进端清单）
const cleanRows = `| ${idOf(1)} | 四级时间源 | 当场打点优先 | common |`

// 写入项目级入口壳
function writeShell(cwd: string, skillDir: string, content: string): void {
  const dir = join(cwd, skillDir, ENTRY_SHELL_NAME)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, SKILL_ENTRY), content, "utf8")
}

describe("未初始化提前返回", () => {
  it("无载体时报未初始化并指向 toolkit init，不散成一堆异常项", () => {
    const root = makeDir("tk-status-none-")
    const cwd = makeDir("tk-status-none-cwd-")

    const report = conventionsStatus(root, cwd)
    expect(report.initialized).toBe(false)
    expect(report.form).toBe("none")
    expect(report.entries).toBe(0)
    expect(report.shells).toEqual([])
    expect(report.warnings).toBe(0)
    expect(report.items.filter((i) => i.level === "info" && i.message.includes("先执行 toolkit init"))).toHaveLength(1)
    expect(report.summary).toContain("先执行 toolkit init")
  })

  it("仅存旧单文件 conventions.md 时指向 conventions-spec 迁移", () => {
    const root = makeDir("tk-status-legacy-")
    const cwd = makeDir("tk-status-legacy-cwd-")
    writeFileSync(join(root, "conventions.md"), "# 旧规范\n", "utf8")

    const report = conventionsStatus(root, cwd)
    expect(report.initialized).toBe(false)
    expect(report.warnings).toBe(0)
    expect(report.items.filter((i) => i.message.includes("conventions-spec"))).toHaveLength(1)
  })
})

describe("载体形态体检", () => {
  it("v1 形态提示可升级，且不做 ID 形态检查", () => {
    const root = makeDir("tk-status-v1-")
    const cwd = makeDir("tk-status-v1-cwd-")
    mkdirSync(join(root, "conventions"), { recursive: true })
    writeFileSync(join(root, "conventions", "index.md"), V1_INDEX, "utf8")

    const report = conventionsStatus(root, cwd)
    expect(report.form).toBe("v1")
    expect(report.items.filter((i) => i.scope === "形态" && i.message.includes("v1 形态"))).toHaveLength(1)
    expect(report.items.filter((i) => i.message.includes("toolkit conventions upgrade"))).toHaveLength(1)
    // v1 首列为序号，跳过 ID 形态检查
    expect(report.items.some((i) => i.message.includes("不合稳定 ID 形态"))).toBe(false)
  })

  it("标为当前版本却缺 history.md 时判形态异常并交人工确认", () => {
    const root = makeDir("tk-status-abn1-")
    const cwd = makeDir("tk-status-abn1-cwd-")
    makeCarrier(root, cleanRows, { history: false })

    const report = conventionsStatus(root, cwd)
    expect(report.form).toBe("abnormal")
    expect(report.items.filter((i) => i.scope === "形态" && i.message.includes("形态异常"))).toHaveLength(1)
    expect(report.items.filter((i) => i.message.includes("请人工确认"))).toHaveLength(1)
  })

  it("有 history.md 但索引表首列仍为序号时同样判形态异常", () => {
    const root = makeDir("tk-status-abn2-")
    const cwd = makeDir("tk-status-abn2-cwd-")
    mkdirSync(join(root, "conventions"), { recursive: true })
    writeFileSync(join(root, "conventions", "index.md"), V1_INDEX, "utf8")
    writeFileSync(join(root, "conventions", "history.md"), `${HISTORY_TITLE}\n`, "utf8")

    const report = conventionsStatus(root, cwd)
    expect(report.form).toBe("abnormal")
    expect(report.items.filter((i) => i.scope === "形态" && i.message.includes("形态异常"))).toHaveLength(1)
  })

  it("旧单文件与目录形态并存时提示清理旧文件", () => {
    const root = makeDir("tk-status-both-")
    const cwd = makeDir("tk-status-both-cwd-")
    makeCarrier(root, cleanRows)
    writeFileSync(join(root, "conventions.md"), "# 旧规范\n", "utf8")

    const report = conventionsStatus(root, cwd)
    expect(report.form).toBe(`v${CARRIER_VERSION}`)
    expect(report.items.filter((i) => i.scope === "形态" && i.message.includes("与目录形态并存"))).toHaveLength(1)
  })
})

describe("索引体检", () => {
  it("首列不合稳定 ID 形态时告警", () => {
    const root = makeDir("tk-status-idshape-")
    const cwd = makeDir("tk-status-idshape-cwd-")
    makeCarrier(root, "| X-1 | 四级时间源 | 当场打点优先 | common |")

    const report = conventionsStatus(root, cwd)
    expect(report.form).toBe(`v${CARRIER_VERSION}`)
    expect(report.items.filter((i) => i.scope === "索引" && i.message.includes("不合稳定 ID 形态"))).toHaveLength(1)
  })

  it("首列为行内代码包裹的稳定 ID 时不误报形态", () => {
    const root = makeDir("tk-status-idcode-")
    const cwd = makeDir("tk-status-idcode-cwd-")
    makeCarrier(root, `| \`${idOf(1)}\` | 四级时间源 | 当场打点优先 | common |`)

    const report = conventionsStatus(root, cwd)
    expect(report.form).toBe(`v${CARRIER_VERSION}`)
    expect(report.items.filter((i) => i.message.includes("不合稳定 ID 形态"))).toEqual([])
  })

  it("索引表存在重复 ID 时告警", () => {
    const root = makeDir("tk-status-dupid-")
    const cwd = makeDir("tk-status-dupid-cwd-")
    makeCarrier(
      root,
      `| ${idOf(1)} | 四级时间源 | 当场打点优先 | common |
| ${idOf(1)} | 路径书写 | 仓库根相对路径 | common |`,
    )

    const report = conventionsStatus(root, cwd)
    expect(report.items.filter((i) => i.message.includes(`索引表存在重复 ID ${idOf(1)}`))).toHaveLength(1)
  })

  it("归属悬空时告警，保留归属 common / index 不误报", () => {
    const root = makeDir("tk-status-owner-")
    const cwd = makeDir("tk-status-owner-cwd-")
    makeCarrier(
      root,
      `| ${idOf(1)} | 四级时间源 | 当场打点优先 | web |
| ${idOf(2)} | 建档评估 | 先查后写 | common |
| ${idOf(3)} | 路径书写 | 仓库根相对路径 | index |
| ${idOf(4)} | 测试不复刻 | 期望值取真实实现 | mobile |`,
    )

    const report = conventionsStatus(root, cwd)
    const dangling = report.items.filter((i) => i.message.includes("不在端清单"))
    expect(dangling).toHaveLength(1)
    expect(dangling.some((i) => i.message.includes("mobile"))).toBe(true)
  })

  it("归属取已存在的分类标签分册名时不判悬空", () => {
    const root = makeDir("tk-status-label-")
    const cwd = makeDir("tk-status-label-cwd-")
    const build = `# 构建规范

## ${idOf(1)}. 构建口径

以 pnpm 为准。
`
    makeCarrier(root, `| ${idOf(1)} | 构建口径 | 以 pnpm 为准 | build |`, { extra: { "build.md": build } })

    const report = conventionsStatus(root, cwd)
    expect(report.items.filter((i) => i.message.includes("不在端清单"))).toEqual([])
    expect(report.items.filter((i) => i.message.includes("在索引表中无对应条目"))).toEqual([])
    expect(report.warnings).toBe(0)
  })

  it("归属 common 且语义含端限定语并提及端名时提示确认是否下沉", () => {
    const root = makeDir("tk-status-common-")
    const cwd = makeDir("tk-status-common-cwd-")
    makeCarrier(root, `| ${idOf(1)} | 网页端缓存 | 仅 web 端缓存走 CDN | common |`)

    const report = conventionsStatus(root, cwd)
    const hits = report.items.filter((i) => i.message.includes("确认是否应下沉为端归属"))
    expect(hits).toHaveLength(1)
    expect(hits[0]!.message).toContain("web")
  })

  it("归属 common 语义提及端名但为例举（无端限定语）时不误报", () => {
    const root = makeDir("tk-status-common-fp-")
    const cwd = makeDir("tk-status-common-fp-cwd-")
    makeCarrier(root, `| ${idOf(1)} | 缓存口径 | web 端缓存走 CDN | common |`)

    const report = conventionsStatus(root, cwd)
    expect(report.items.filter((i) => i.message.includes("确认是否应下沉为端归属"))).toEqual([])
    expect(report.warnings).toBe(0)
  })

  it("端限定语后提及端名时大小写不敏感（大写 Web 亦命中）", () => {
    const root = makeDir("tk-status-common-case-")
    const cwd = makeDir("tk-status-common-case-cwd-")
    makeCarrier(root, `| ${idOf(1)} | 网页端缓存 | 仅 Web 端缓存走 CDN | common |`)

    const report = conventionsStatus(root, cwd)
    const hits = report.items.filter((i) => i.message.includes("确认是否应下沉为端归属"))
    expect(hits).toHaveLength(1)
    expect(hits[0]!.message).toContain("web")
  })

  it("分册小节在索引表中无对应条目时告警，有对应条目的小节不告警", () => {
    const root = makeDir("tk-status-orphan-")
    const cwd = makeDir("tk-status-orphan-cwd-")
    const common = `# 公共规范

## ${idOf(1)}. 四级时间源

当场打点优先，禁止估算。

## C-9. 孤立小节

与索引表无对应条目。
`
    makeCarrier(root, cleanRows, { extra: { "common.md": common } })

    const report = conventionsStatus(root, cwd)
    const orphan = report.items.filter((i) => i.message.includes("在索引表中无对应条目"))
    expect(orphan).toHaveLength(1)
    expect(orphan.some((i) => i.message.includes("common.md") && i.message.includes("C-9"))).toBe(true)
  })
})

describe("退休台账体检", () => {
  it("存在 retired.md 却定位不到退休表时告警", () => {
    const root = makeDir("tk-status-retired-")
    const cwd = makeDir("tk-status-retired-cwd-")
    makeCarrier(root, cleanRows, { extra: { [RETIRED_FILE]: `${RETIRED_TITLE}\n\n| ID | 规则 |\n| --- | --- |\n` } })

    const report = conventionsStatus(root, cwd)
    const hits = report.items.filter((i) => i.message.includes(`${RETIRED_FILE} 未定位到退休表`))
    expect(hits).toHaveLength(1)
    expect(hits[0]!.message).toContain(RETIRED_ANCHOR_HEADER)
  })

  it("退休 ID 与常驻索引活跃 ID 重叠时告警", () => {
    const root = makeDir("tk-status-retired-overlap-")
    const cwd = makeDir("tk-status-retired-overlap-cwd-")
    const retired = `${RETIRED_SKELETON}| ${idOf(1)} | 旧口径 | 已冻结语义 | common | — | — | 已删分册小节 \`common.md\` |\n`
    makeCarrier(root, cleanRows, { extra: { [RETIRED_FILE]: retired } })

    const report = conventionsStatus(root, cwd)
    const hits = report.items.filter((i) => i.message.includes(`同时存在于索引表与 ${RETIRED_FILE}`))
    expect(hits).toHaveLength(1)
    expect(hits[0]!.message).toContain(idOf(1))
  })

  it("退休台账合规（迁出条目与活跃条目无重叠）时不告警", () => {
    const root = makeDir("tk-status-retired-ok-")
    const cwd = makeDir("tk-status-retired-ok-cwd-")
    const retired = `${RETIRED_TITLE}\n\n${RETIRED_TABLE_HEADER}\n| --- | --- | --- | --- | --- | --- | --- |\n| ${idOf(9)} | 旧构建口径 | 以 npm 为准 | common | — | — | 已删分册小节 \`common.md\` |\n`
    makeCarrier(root, cleanRows, { extra: { [RETIRED_FILE]: retired } })

    const report = conventionsStatus(root, cwd)
    expect(report.items.filter((i) => i.message.includes(RETIRED_FILE))).toEqual([])
    expect(report.warnings).toBe(0)
  })
})

describe("入口层体检", () => {
  it("无壳时只出提示不计入问题数，干净载体结论为无待处理项", () => {
    const root = makeDir("tk-status-noshell-")
    const cwd = makeDir("tk-status-noshell-cwd-")
    makeCarrier(root, cleanRows)

    const report = conventionsStatus(root, cwd)
    expect(report.initialized).toBe(true)
    expect(report.form).toBe(`v${CARRIER_VERSION}`)
    expect(report.carrierVersion).toBe(CARRIER_VERSION)
    expect(report.entries).toBe(1)
    expect(report.shells).toEqual([])
    expect(report.warnings).toBe(0)
    expect(report.items.filter((i) => i.scope === "入口层" && i.level === "info" && i.message.includes("未找到入口壳"))).toHaveLength(1)
    expect(report.summary).toContain(`载体 v${CARRIER_VERSION}`)
    expect(report.summary).toContain("无待处理项")
  })

  it("源仓库现场（package.json 的 name 为 @fxri/toolkit）不给补生成入口壳的提示", () => {
    const root = makeDir("tk-status-src-")
    const cwd = makeDir("tk-status-src-cwd-")
    makeCarrier(root, cleanRows)
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ name: "@fxri/toolkit", version: "0.0.0" }), "utf8")

    const report = conventionsStatus(root, cwd)
    expect(report.shells).toEqual([])
    expect(report.warnings).toBe(0)
    // 源仓库不生成壳属预期，不得提示跑注定空转的 toolkit init
    expect(report.items.filter((i) => i.scope === "入口层" && i.message.includes("toolkit init"))).toEqual([])
    expect(report.items.filter((i) => i.scope === "入口层" && i.message.includes("本包源仓库不生成入口壳"))).toHaveLength(1)
  })

  it("多壳标记版本与当前 toolkit 不一致（含无标记）时合并为一条并列出落点", () => {
    const root = makeDir("tk-status-shellver-")
    const cwd = makeDir("tk-status-shellver-cwd-")
    makeCarrier(root, cleanRows)
    writeShell(cwd, ".trae/skills", `---\nname: ${ENTRY_SHELL_NAME}\n---\n\n<!-- toolkit-conventions-entry: v${ENTRY_VERSION - 1} -->\n`)
    writeShell(cwd, ".cursor/skills", `---\nname: ${ENTRY_SHELL_NAME}\n---\n\n无标记壳\n`)

    const report = conventionsStatus(root, cwd)
    expect(report.shells).toHaveLength(2)
    const versionItems = report.items.filter((i) => i.message.includes("入口壳标记与当前 toolkit"))
    expect(versionItems).toHaveLength(1)
    expect(versionItems[0]!.message).toContain("共 2 处")
    expect(versionItems[0]!.message).toContain(`.trae/skills/${ENTRY_SHELL_NAME}/${SKILL_ENTRY}（标记 v${ENTRY_VERSION - 1}）`)
    expect(versionItems[0]!.message).toContain(`.cursor/skills/${ENTRY_SHELL_NAME}/${SKILL_ENTRY}（标记 无）`)
    expect(report.summary).toContain("1 项待处理")
  })

  it("壳被 gitignore 覆盖时告警并内联落点路径", () => {
    const root = makeDir("tk-status-shellign-")
    const cwd = makeDir("tk-status-shellign-cwd-")
    makeCarrier(root, cleanRows)
    execSync("git init -q", { cwd })
    writeFileSync(join(cwd, ".gitignore"), ".trae/skills/\n", "utf8")
    writeShell(cwd, ".trae/skills", `---\nname: ${ENTRY_SHELL_NAME}\n---\n\n${ENTRY_MARKER}\n`)

    const report = conventionsStatus(root, cwd)
    expect(report.shells.filter((s) => s.ignored)).toHaveLength(1)
    const ignoredItems = report.items.filter((i) => i.message.includes("被 gitignore 覆盖"))
    expect(ignoredItems).toHaveLength(1)
    expect(ignoredItems[0]!.message).toContain(`.trae/skills/${ENTRY_SHELL_NAME}/${SKILL_ENTRY}`)
    // 版本一致，此处只应有一条问题
    expect(report.warnings).toBe(1)
  })

  it("壳标记版本一致且未被忽略时不产生入口层问题", () => {
    const root = makeDir("tk-status-shellok-")
    const cwd = makeDir("tk-status-shellok-cwd-")
    makeCarrier(root, cleanRows)
    writeShell(cwd, ".trae/skills", `---\nname: ${ENTRY_SHELL_NAME}\n---\n\n${ENTRY_MARKER}\n`)

    const report = conventionsStatus(root, cwd)
    expect(report.shells.filter((s) => s.version === ENTRY_VERSION)).toHaveLength(1)
    expect(report.shells.filter((s) => s.ignored)).toEqual([])
    expect(report.items.filter((i) => i.scope === "入口层")).toEqual([])
    expect(report.warnings).toBe(0)
    expect(report.summary).toContain("入口壳 1 个")
  })
})

describe("表格形态体检", () => {
  it("载体表格被列对齐填充时报一条告警并指向 conventions format", () => {
    const root = makeDir("tk-status-table-")
    const cwd = makeDir("tk-status-table-cwd-")
    makeCarrier(root, `| ${idOf(1)}     | 四级时间源 | 当场打点优先 | common |`)

    const report = conventionsStatus(root, cwd)
    const hits = report.items.filter((i) => i.message.includes("表格存在列对齐填充"))
    expect(hits).toHaveLength(1)
    expect(hits[0]!.level).toBe("warn")
    expect(hits[0]!.scope).toBe("形态")
    expect(hits[0]!.message).toContain("toolkit conventions format")
    // 命中文件以任务区相对路径内联
    expect(hits[0]!.message).toContain("conventions/index.md（1 行）")
  })

  it("表格均为紧凑形态时不产生表格形态告警", () => {
    const root = makeDir("tk-status-table-ok-")
    const cwd = makeDir("tk-status-table-ok-cwd-")
    makeCarrier(root, cleanRows)

    const report = conventionsStatus(root, cwd)
    expect(report.items.filter((i) => i.message.includes("列对齐填充"))).toEqual([])
  })
})

describe("演进记录首列体检", () => {
  // 演进记录假现场：表头 + 分隔行 + 数据行（首列形态由用例给定）
  const makeHistory = (rows: string): string =>
    `${HISTORY_TITLE}\n\n${HISTORY_TABLE_HEADER}\n| --- | --- | --- |\n${rows}\n`

  it("v3 载体首列为规则名而非稳定 ID 时告警，提示人工补录", () => {
    const root = makeDir("tk-status-hid-")
    const cwd = makeDir("tk-status-hid-cwd-")
    makeCarrier(root, cleanRows, { extra: { "history.md": makeHistory("| 四级时间源 | 当场打点优先 | 建档评估 |\n") } })

    const report = conventionsStatus(root, cwd)
    const hits = report.items.filter((i) => i.message.includes("行首列不是稳定的规则 ID"))
    expect(hits).toHaveLength(1)
    expect(hits[0]!.level).toBe("warn")
    expect(hits[0]!.scope).toBe("形态")
  })

  it("v3 载体首列均为行内代码包裹的稳定 ID 时不告警", () => {
    const root = makeDir("tk-status-hid-ok-")
    const cwd = makeDir("tk-status-hid-ok-cwd-")
    makeCarrier(root, cleanRows, { extra: { "history.md": makeHistory(`| \`${idOf(1)}\` | 当场打点优先 | 建档评估 |\n| \`${idOf(2)}\` | 先查后写 | 建档评估 |\n`) } })

    const report = conventionsStatus(root, cwd)
    expect(report.items.filter((i) => i.message.includes("行首列不是稳定的规则 ID"))).toEqual([])
    expect(report.warnings).toBe(0)
  })
})
