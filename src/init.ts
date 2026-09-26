// init 命令实现：生成任务区骨架、规范载体与技能入口壳，补齐 .gitignore 片段
// 重复执行幂等（已存在一律保持不覆盖），逐项返回实际动作供 CLI 如实报告
import { existsSync, readFileSync, mkdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { writeFileAtomic } from "./write-atomic"
import { readTextFile } from "./read-text"
import {
  CARRIER_MARKER,
  CONVENTIONS_DIR,
  HISTORY_FILE,
  HISTORY_SKELETON,
  INDEX_FILE,
  INDEX_TITLE,
  LEGACY_FILE,
  readCarrier,
} from "./conventions/format"
import {
  AGENTS_POINTER_START,
  ENTRY_SHELL_NAME,
  SKILL_ENTRY,
  buildAgentsPointer,
  buildEntryShell,
  isGitIgnored,
  isToolkitSourceRepo,
  resolveProjectSkillDirs,
} from "./conventions/entry"
import { todayCompact } from "./date"
import { hasGlobalSkillsInstalled } from "./skills"

// init 时输出的后续步骤提示（getting-started / guide 链接与文档站同源）
export const INIT_LINKS = {
  site: "https://fxri-net.github.io/toolkit/",
  gettingStarted: "https://fxri-net.github.io/toolkit/getting-started",
  guide: "https://fxri-net.github.io/toolkit/guide",
}

// .gitignore 追加片段：排他锁是运行时文件不入库，任务目录其余内容必须入库
const GITIGNORE_SNIPPET = "\n# @fxri/toolkit 归档排他锁（运行时文件，不入库）\n.archive.lock\n"

// 规范载体索引骨架：三节结构与 skills/fxri-plan-to-task/references/conventions-spec.md 一致
const CONVENTIONS_INDEX = `${CARRIER_MARKER}
${INDEX_TITLE}

> 唯一入口与唯一权威：端清单在此声明、每条规范在此留一行指针；分册（\`common.md\` / \`<端名>.md\`）按需创建。
> 端名与任务 frontmatter 的 \`scope\` 取值共用同一套词表、逐字一致；保留字 \`index\` / \`common\` 不得作端名。
> 演进记录见 \`history.md\`；超长条目升级见分册。

## 一、端清单

| 端名 | 说明 |
| --- | --- |

## 二、索引

| ID | 规则 | 当前语义 | 归属 | 状态 | 确立来源任务 | 单一事实源 |
| --- | --- | --- | --- | --- | --- | --- |

## 三、用法说明

（在此写明本项目采用溯源索引式还是条文式、读写判定要点、规则层源头变更时的同步纪律）
`

// init 实际动作：新建 / 保持 / 追加 / 跳过（跳过必带原因）
export type InitAction = "created" | "kept" | "appended" | "skipped"

// 单条初始化产物：target 为展示用路径或区块名，detail 说明做了什么或为何没做，hint 提示后续可选操作
export interface InitProduct {
  target: string
  action: InitAction
  detail?: string
  hint?: string
}

// init 报告：任务目录 + 逐项产物动作 + 全局技能安装态（供「下一步」按需提示 skills install）
export interface InitReport {
  tasksDir: string
  products: InitProduct[]
  skillsInstalled: boolean
}

// 展示用路径归一为 / 分隔，保证报告与测试跨平台一致
function posix(p: string): string {
  return p.replace(/\\/g, "/")
}

// 初始化项目任务区：任务区骨架 → 规范载体 → .gitignore 片段 → 技能入口层
// dir 为任务目录（默认 .tasks，支持绝对路径或 ../ 相对路径指向项目外），cwd 为仓库根（.gitignore 与 AGENTS.md 所在目录）
export function initWorkspace(dir = ".tasks", cwd = process.cwd()): InitReport {
  const month = todayCompact().slice(0, 6)
  // resolve：dir 为绝对路径（项目外独立仓库）时直接使用，相对路径时基于 cwd 解析
  const root = resolve(cwd, dir)
  const rootExisted = existsSync(root)
  mkdirSync(join(root, "active", month), { recursive: true })
  mkdirSync(join(root, "archive"), { recursive: true })
  const products: InitProduct[] = [
    {
      target: `${posix(dir)}/active/${month}/、${posix(dir)}/archive/`,
      action: rootExisted ? "kept" : "created",
      detail: rootExisted ? "任务区已存在，保持不变" : "已创建",
    },
    ...scaffoldConventions(root, dir),
    ...appendGitignore(cwd),
    ...scaffoldEntryLayer(cwd),
  ]
  return { tasksDir: dir, products, skillsInstalled: hasGlobalSkillsInstalled() }
}

// 生成规范载体骨架（index.md + history.md）；已存在索引、或存在待迁移的旧单文件 conventions.md 时不动
// 旧文件在时不建空骨架：否则空骨架会抢占目录形态的优先地位，旧内容形同被吞
function scaffoldConventions(root: string, display: string): InitProduct[] {
  const dir = join(root, CONVENTIONS_DIR)
  const index = join(dir, INDEX_FILE)
  const target = `${posix(display)}/${CONVENTIONS_DIR}/${INDEX_FILE}`
  if (existsSync(index)) {
    const product: InitProduct = { target, action: "kept", detail: "已存在，保持不变" }
    if (readCarrier(root).form === "v1") product.hint = "当前为 v1 形态，可执行 toolkit conventions upgrade 升为 v2"
    return [product]
  }
  if (existsSync(join(root, LEGACY_FILE))) {
    return [
      {
        target,
        action: "skipped",
        detail: `存在待迁移的旧单文件 ${posix(display)}/${LEGACY_FILE}，不建空骨架`,
      },
    ]
  }
  mkdirSync(dir, { recursive: true })
  writeFileAtomic(index, CONVENTIONS_INDEX)
  writeFileAtomic(join(dir, HISTORY_FILE), HISTORY_SKELETON)
  return [
    { target, action: "created", detail: "已创建（端清单 / 索引 / 用法说明三节）" },
    { target: `${posix(display)}/${CONVENTIONS_DIR}/${HISTORY_FILE}`, action: "created", detail: "已创建（规范演进记录）" },
  ]
}

// 向 .gitignore 追加忽略片段；片段已存在（含人工提前手写）时保持不动
export function appendGitignore(cwd: string): InitProduct[] {
  const file = join(cwd, ".gitignore")
  if (!existsSync(file)) {
    // 无 .gitignore：直接创建并写入片段
    writeFileAtomic(file, GITIGNORE_SNIPPET)
    return [{ target: ".gitignore", action: "created", detail: "已创建并写入 .archive.lock 忽略片段" }]
  }
  const raw = readFileSync(file, "utf8")
  if (raw.includes(".archive.lock")) return [{ target: ".gitignore", action: "kept", detail: "已含 .archive.lock 忽略片段" }]
  // 统一 LF 处理后追加，保留原换行风格
  const eol = raw.includes("\r\n") ? "\r\n" : "\n"
  const base = raw.endsWith("\n") || raw === "" ? raw : raw + eol
  writeFileAtomic(file, base + GITIGNORE_SNIPPET.replace(/\n/g, eol).replace(/^\r?\n/, ""))
  return [{ target: ".gitignore", action: "appended", detail: "已追加 .archive.lock 忽略片段" }]
}

// 技能入口层：生成项目级入口壳 + 在已存在的 AGENTS.md 中幂等追加指针块
// 源仓库靠 fxri-* 技能自举，不生成自己的入口壳（内部判定，不暴露 CLI 参数）
function scaffoldEntryLayer(cwd: string): InitProduct[] {
  if (isToolkitSourceRepo(cwd)) {
    return [
      {
        target: "技能入口层",
        action: "skipped",
        detail: "@fxri/toolkit 源仓库靠 fxri-* 技能自举，不生成入口壳与 AGENTS.md 指针块",
      },
    ]
  }
  const skillDirs = resolveProjectSkillDirs(cwd)
  const products: InitProduct[] = []
  for (const skillDir of skillDirs) {
    const dir = join(cwd, skillDir, ENTRY_SHELL_NAME)
    const file = join(dir, SKILL_ENTRY)
    const rel = `${skillDir}/${ENTRY_SHELL_NAME}/${SKILL_ENTRY}`
    if (existsSync(file)) {
      products.push({ target: rel, action: "kept", detail: "已存在，保持不变" })
      continue
    }
    mkdirSync(dir, { recursive: true })
    writeFileAtomic(file, buildEntryShell())
    const product: InitProduct = { target: rel, action: "created", detail: "已创建（只作入口，不承载条文）" }
    // 落点被忽略时团队看不到：给否定规则提示，是否改 .gitignore 交由用户决定
    if (isGitIgnored(cwd, rel)) {
      product.hint = "该路径被 .gitignore 覆盖，团队无法共享；需要共享时自行补否定规则（如 !.agents/skills/），toolkit 不代改 .gitignore"
    }
    products.push(product)
  }
  // 指针块只指入口壳形态、不写死落点；多候选目录并存时每份壳内容逐字等价
  products.push(...upsertAgentsPointer(cwd))
  return products
}

// AGENTS.md 指针块：仅当文件已存在时幂等追加，不存在不新建（不替用户决定是否引入 AGENTS.md）
function upsertAgentsPointer(cwd: string): InitProduct[] {
  const file = join(cwd, "AGENTS.md")
  if (!existsSync(file)) {
    return [
      {
        target: "AGENTS.md",
        action: "skipped",
        detail: "文件不存在；不新建，需要时手工添加或先建文件再重跑 toolkit init",
        hint: "无该指针块不影响规范可用：本项目规范仍可经全局技能 fxri-plan-to-task 触达（其工作流第一步即读 conventions/index.md）",
      },
    ]
  }
  const raw = readTextFile(file)
  if (raw.includes(AGENTS_POINTER_START)) {
    return [{ target: "AGENTS.md", action: "kept", detail: "已含规范入口指针块，保持不动" }]
  }
  // 保留原换行风格；块前补空行与正文分隔，块尾补换行避免与后续内容粘连
  const eol = raw.includes("\r\n") ? "\r\n" : "\n"
  const base = raw.endsWith("\n") || raw === "" ? raw : raw + eol
  const sep = /(\r?\n){2}$/.test(base) ? "" : eol
  writeFileAtomic(file, `${base}${sep}${buildAgentsPointer().replace(/\n/g, eol)}${eol}`)
  return [{ target: "AGENTS.md", action: "appended", detail: "已追加规范入口指针块（幂等，重复执行不重复追加）" }]
}
