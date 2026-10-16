// 规范载体结构升级单测（v1 / v2 → v3）：形态识别、ID 发放、演进记录外置、退休迁出与分册小节清理、内部引用改写边界、幂等与异常态拒绝
import { describe, it, expect, afterAll } from "vitest"
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { upgradeConventions } from "../conventions/upgrade"
import { CARRIER_MARKER, CARRIER_VERSION, HISTORY_FILE, HISTORY_TITLE, INDEX_FILE, RETIRED_FILE, detectForm, idOf, readCarrier } from "../conventions/format"

// 各用例独立建临时目录，结束后统一清理
const dirs: string[] = []
function makeDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

// v1 载体假现场：按 conventions-spec v1 形态构造（首行无标记、索引表首列 `#`、演进记录在 index.md 内）
const V1_INDEX = `# 项目协作规范索引

> 唯一入口与唯一权威：端清单在此声明、每条规范在此留一行指针。
> 端名与任务 frontmatter 的 \`scope\` 取值共用同一套词表、逐字一致；保留字 \`index\` / \`common\` 不得作端名。

> 非任务文件，\`toolkit tasks\` 不读取内容、\`check\` 不因内容告警。

## 一、端清单

| 端名 | 说明 |
| --- | --- |

## 二、索引

| # | 规则 | 当前语义 | 归属 | 状态 | 确立来源任务 | 单一事实源 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 四级时间源 | 当场打点优先 | common | 生效 | 20260101-甲 | common.md |
| 2 | 测试不复刻被测实现 | 期望值取真实实现 | common | 生效 | 20260102-乙 | common.md |

## 三、演进记录（修订留痕）

> 元规则：规则语义变更时不得覆盖旧语义直接丢史——本节追加一条，索引表只保留当前语义。
> 表语义边界：本表只记规范语义变更。

| 规则 | 修订内容 | 修订来源任务 |
| --- | --- | --- |
| 四级时间源 | 兜底口径由估算改为系统当前时间 | 20260103-丙 |

## 四、用法说明

（在此写明本项目采用溯源索引式还是条文式）

- 留痕一律写入「演进记录」节。
- 引用规范时用「第 1 条」的稳定序号。
- 外部规则见 \`AGENTS.md\` 质量门第 2 条。
`

// v1 分册假现场：小节标题为序号，正文含一条指向索引条目的活引用
const V1_COMMON = `# 公共规范

## 1. 四级时间源

当场打点优先，禁止估算。

## 2. 测试不复刻被测实现

派生逻辑的测试期望须直接调用真实实现（与索引第 1 条配套）。
`

// v2 载体假现场：首行 v2 标记 + history.md + 索引表首列为稳定 ID，含「状态」「确立来源任务」两列与一条已废弃条目
const V2_MARKER = "<!-- toolkit-conventions: v2 -->"
const V2_INDEX = `${V2_MARKER}
# 项目协作规范索引

## 一、端清单

| 端名 | 说明 |
| --- | --- |
| web | 网页端 |

## 二、索引

| ID | 规则 | 当前语义 | 归属 | 状态 | 确立来源任务 | 单一事实源 |
| --- | --- | --- | --- | --- | --- | --- |
| ${idOf(1)} | 四级时间源 | 当场打点优先 | common | 生效 | 20260101-甲 | common.md |
| ${idOf(2)} | 旧构建口径 | 以 npm 为准 | common | 已废弃 | 20260102-乙 | common.md |

## 三、用法说明

（说明略）
`
const V2_COMMON = `# 公共规范

## ${idOf(1)}. 四级时间源

当场打点优先，禁止估算。

## ${idOf(2)}. 旧构建口径

以 npm 为准（已废弃）。
`
const V2_HISTORY = `${HISTORY_TITLE}

> 元规则：规则语义变更时不得覆盖旧语义直接丢史。

| 规则 ID / 名称 | 修订内容 | 修订来源任务 |
| --- | --- | --- |
| 四级时间源 | 兜底口径由估算改为系统当前时间 | 20260103-丙 |
`

// 建 v1 载体现场（index.md + common.md）
function makeV1(root: string): void {
  mkdirSync(join(root, "conventions"), { recursive: true })
  writeFileSync(join(root, "conventions", "index.md"), V1_INDEX, "utf8")
  writeFileSync(join(root, "conventions", "common.md"), V1_COMMON, "utf8")
}

// 建 v2 载体现场（index.md + common.md + history.md）
function makeV2(root: string): void {
  mkdirSync(join(root, "conventions"), { recursive: true })
  writeFileSync(join(root, "conventions", "index.md"), V2_INDEX, "utf8")
  writeFileSync(join(root, "conventions", "common.md"), V2_COMMON, "utf8")
  writeFileSync(join(root, "conventions", "history.md"), V2_HISTORY, "utf8")
}

const readIndex = (root: string) => readFileSync(join(root, "conventions", "index.md"), "utf8")
const readCommon = (root: string) => readFileSync(join(root, "conventions", "common.md"), "utf8")
// 取索引表表头行，用于核验列结构
const indexHeaderRow = (root: string) => readIndex(root).split(/\r?\n/).find((l) => l.startsWith("| ID |")) ?? ""

describe("载体形态识别", () => {
  it("无 index.md 判未初始化，有 index.md 无 history.md 无标记判 v1", () => {
    expect(detectForm(false, false, false, null)).toBe("none")
    expect(detectForm(true, false, false, null)).toBe("v1")
  })

  it("标记为当前版本且结构齐备判 v3，无标记 / 标 v2 且结构齐备判 v2 存量", () => {
    expect(detectForm(true, true, true, CARRIER_VERSION)).toBe("v3")
    expect(detectForm(true, true, true, null)).toBe("v2")
    expect(detectForm(true, true, true, 2)).toBe("v2")
  })

  it("标记与结构不一致（缺 history.md / 首列非 ID / 未知版本）一律判 abnormal", () => {
    expect(detectForm(true, false, true, CARRIER_VERSION)).toBe("abnormal")
    expect(detectForm(true, true, false, CARRIER_VERSION)).toBe("abnormal")
    expect(detectForm(true, false, true, 2)).toBe("abnormal")
    expect(detectForm(true, true, false, null)).toBe("abnormal")
    expect(detectForm(true, true, true, CARRIER_VERSION + 1)).toBe("abnormal")
  })
})

describe("v1 → v2 → v3 链式升级", () => {
  it("发稳定 ID / 抽演进记录成 history.md / 内部引用改 ID / 节号重编 / 标题归一", () => {
    const root = makeDir("tk-upgrade-")
    makeV1(root)

    const report = upgradeConventions(root)
    expect(report.status).toBe("upgraded")
    // 期望值取自真实实现，不在测试内重写 ID 生成规则
    expect(report.idMap.map((r) => r.id)).toEqual([idOf(1), idOf(2)])

    const index = readIndex(root)
    expect(index.split(/\r?\n/, 1)[0]).toBe(CARRIER_MARKER)
    expect(index).toContain(`| ${idOf(1)} | 四级时间源 |`)
    expect(index).toContain(`| ${idOf(2)} | 测试不复刻被测实现 |`)
    // 演进记录外置，「四、用法说明」递补为「三」
    expect(index).not.toContain("演进记录（修订留痕）")
    expect(index).toContain("## 三、用法说明")
    expect(index).not.toContain("## 四、")

    const history = readFileSync(join(root, "conventions", "history.md"), "utf8")
    expect(history.split(/\r?\n/, 1)[0]).toBe(HISTORY_TITLE)
    expect(history).toContain("四级时间源")
    expect(history).toContain("兜底口径由估算改为系统当前时间")

    // 分册小节标题序号改稳定 ID，活引用同步改写
    const common = readCommon(root)
    expect(common).toContain(`## ${idOf(1)}. 四级时间源`)
    expect(common).toContain(`## ${idOf(2)}. 测试不复刻被测实现`)
    expect(common).toContain(`与索引\`${idOf(1)}\`配套`)
    expect(report.refs).toContainEqual({ file: "common.md", from: "第 1 条", to: `\`${idOf(1)}\`` })

    // v1 输入链式升到 v3：索引表最终为 v3 五列（「状态」「确立来源任务」两列已删）
    expect(indexHeaderRow(root)).toBe("| ID | 规则 | 当前语义 | 归属 | 单一事实源 |")
    // 升级结果由真实形态识别复验，不靠测试自证
    expect(readCarrier(root).form).toBe("v3")
  })

  it("内部活引用改 ID，带外部文档限定词的引用一律不动", () => {
    const root = makeDir("tk-upgrade-ref-")
    makeV1(root)

    upgradeConventions(root)
    const index = readIndex(root)
    expect(index).toContain(`引用规范时用「\`${idOf(1)}\`」的稳定序号`)
    expect(index).toContain("外部规则见 `AGENTS.md` 质量门第 2 条")
    // 指向原「演进记录」节的表述改指 history.md
    expect(index).toContain(`留痕一律写入\`history.md\`。`)
  })

  it("已为 v3 时幂等：状态为 already-v3 且不改动任何文件", () => {
    const root = makeDir("tk-upgrade-idem-")
    makeV1(root)
    upgradeConventions(root)
    const index = readIndex(root)
    const common = readCommon(root)
    const history = readFileSync(join(root, "conventions", "history.md"), "utf8")

    const second = upgradeConventions(root)
    expect(second.status).toBe("already-v3")
    expect(readIndex(root)).toBe(index)
    expect(readCommon(root)).toBe(common)
    expect(readFileSync(join(root, "conventions", "history.md"), "utf8")).toBe(history)
  })

  it("--dry-run 只出报告不写盘", () => {
    const root = makeDir("tk-upgrade-dry-")
    makeV1(root)

    const report = upgradeConventions(root, { dryRun: true })
    expect(report.status).toBe("upgraded")
    expect(report.changes.length).toBeGreaterThan(0)
    expect(readIndex(root)).toBe(V1_INDEX)
    expect(readCommon(root)).toBe(V1_COMMON)
    expect(existsSync(join(root, "conventions", "history.md"))).toBe(false)
  })
})

describe("v2 → v3 迁移", () => {
  it("删两列 / 退休条目迁入 retired.md 并物理删分册小节 / 标记升 v3", () => {
    const root = makeDir("tk-upgrade-v2-")
    makeV2(root)

    const report = upgradeConventions(root)
    expect(report.status).toBe("upgraded")

    const index = readIndex(root)
    expect(index.split(/\r?\n/, 1)[0]).toBe(CARRIER_MARKER)
    // 索引表收为 v3 五列
    expect(indexHeaderRow(root)).toBe("| ID | 规则 | 当前语义 | 归属 | 单一事实源 |")
    // 活跃条目保留、退休条目行已迁出，状态文字不留痕
    expect(index).toContain(`| ${idOf(1)} | 四级时间源 | 当场打点优先 | common | common.md |`)
    expect(index).not.toContain(idOf(2))
    expect(index).not.toContain("已废弃")

    // 分册退休小节物理删除，活跃小节保留
    const common = readCommon(root)
    expect(common).toContain(`## ${idOf(1)}. 四级时间源`)
    expect(common).not.toContain(`## ${idOf(2)}.`)

    // retired.md 按需创建：冻结退休时语义、内联条文去向
    const retiredPath = join(root, "conventions", RETIRED_FILE)
    expect(existsSync(retiredPath)).toBe(true)
    expect(readFileSync(retiredPath, "utf8")).toContain(`| ${idOf(2)} | 旧构建口径 | 以 npm 为准 | common | — | — | 已删分册小节 \`common.md\` |`)

    // 升级结果由真实形态识别复验
    expect(readCarrier(root).form).toBe("v3")
    // 「后继」「退休来源任务」机械填「—」须人工补录
    expect(report.reviews.some((m) => m.includes(RETIRED_FILE))).toBe(true)
  })

  it("--dry-run 只出报告不写盘，不创建 retired.md", () => {
    const root = makeDir("tk-upgrade-v2-dry-")
    makeV2(root)

    const report = upgradeConventions(root, { dryRun: true })
    expect(report.status).toBe("upgraded")
    expect(report.changes.length).toBeGreaterThan(0)
    expect(readIndex(root)).toBe(V2_INDEX)
    expect(readCommon(root)).toBe(V2_COMMON)
    expect(existsSync(join(root, "conventions", RETIRED_FILE))).toBe(false)
  })

  it("history 首列为行内代码包裹 ID 时不提示补录，为裸规则名时才提示", () => {
    const root = makeDir("tk-upgrade-hid-")
    makeV2(root)
    // 规范要求引用以反引号包裹：`C-1`
    writeFileSync(
      join(root, "conventions", "history.md"),
      V2_HISTORY.replace("| 四级时间源 |", `| \`${idOf(1)}\` |`),
      "utf8",
    )
    const report = upgradeConventions(root)
    expect(report.reviews.some((m) => m.includes(HISTORY_FILE) && m.includes("首列"))).toBe(false)

    // 首列仍为裸规则名（无 ID）时须提示人工补录
    const root2 = makeDir("tk-upgrade-hid2-")
    makeV2(root2)
    const report2 = upgradeConventions(root2)
    expect(report2.reviews.some((m) => m.includes(HISTORY_FILE) && m.includes("请人工核对是否补录 ID"))).toBe(true)
  })

  it("index.md 正文残留 v2 措辞（确立来源任务 / 状态改为已废弃）列入复核项", () => {
    const root = makeDir("tk-upgrade-stale-")
    makeV2(root)
    const stale = V2_INDEX.replace("（说明略）", "新增条目时填「确立来源任务」；停用条目将「状态」改为「已废弃」。")
    writeFileSync(join(root, "conventions", "index.md"), stale, "utf8")

    const report = upgradeConventions(root)
    expect(report.reviews.some((m) => m.includes(INDEX_FILE) && m.includes("v2 措辞"))).toBe(true)
  })
})

describe("升级前先判，异常态拒绝", () => {
  it("未初始化时报错并提示先执行 toolkit init，不写任何文件", () => {
    const root = makeDir("tk-upgrade-none-")
    mkdirSync(join(root, "conventions"), { recursive: true })
    expect(() => upgradeConventions(root)).toThrow(/先执行 toolkit init/)
  })

  it("仅存在旧单文件 conventions.md 时报错并指向 conventions-spec 迁移", () => {
    const root = makeDir("tk-upgrade-legacy-")
    mkdirSync(join(root, "conventions"), { recursive: true })
    writeFileSync(join(root, "conventions.md"), "# 旧规范\n", "utf8")
    expect(() => upgradeConventions(root)).toThrow(/conventions-spec/)
  })

  it("形态异常（标记为当前版本却缺 history.md）时报错且原文件不动", () => {
    const root = makeDir("tk-upgrade-abnormal-")
    mkdirSync(join(root, "conventions"), { recursive: true })
    const abnormal = `${CARRIER_MARKER}\n# 项目协作规范索引\n\n## 二、索引\n\n| # | 规则 | 当前语义 |\n| --- | --- | --- |\n| 1 | 甲 | 乙 |\n`
    writeFileSync(join(root, "conventions", "index.md"), abnormal, "utf8")

    expect(() => upgradeConventions(root)).toThrow(/形态异常/)
    expect(readIndex(root)).toBe(abnormal)
    expect(existsSync(join(root, "conventions", "history.md"))).toBe(false)
  })
})

// 清理全部临时目录
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})
