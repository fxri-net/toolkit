// init 命令实现：生成 .tasks/ 骨架与 .gitignore 片段，重复执行幂等（已存在一律跳过不覆盖）
import { existsSync, readFileSync, mkdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { writeFileAtomic } from "./write-atomic"
import { todayCompact } from "./date"

// init 时输出的后续步骤提示（getting-started / guide 链接与文档站同源）
export const INIT_LINKS = {
  site: "https://fxri-net.github.io/toolkit/",
  gettingStarted: "https://fxri-net.github.io/toolkit/getting-started",
  guide: "https://fxri-net.github.io/toolkit/guide",
}

// .gitignore 追加片段：排他锁是运行时文件不入库，任务目录其余内容必须入库
const GITIGNORE_SNIPPET = "\n# @fxri/toolkit 归档排他锁（运行时文件，不入库）\n.archive.lock\n"

// 规范载体索引骨架：四节结构与 skills/fxri-plan-to-task/references/conventions-spec.md 一致
const CONVENTIONS_INDEX = `# 项目协作规范索引

> 唯一入口与唯一权威：端清单在此声明、每条规范在此留一行指针；分册（\`common.md\` / \`<端名>.md\`）按需创建。
> 端名与任务 frontmatter 的 \`scope\` 取值共用同一套词表、逐字一致；保留字 \`index\` / \`common\` 不得作端名。

## 一、端清单

| 端名 | 说明 |
| --- | --- |

## 二、索引

| # | 规则 | 当前语义 | 归属 | 状态 | 确立来源任务 | 单一事实源 |
| --- | --- | --- | --- | --- | --- | --- |

## 三、演进记录

| 规则 | 修订内容 | 修订来源任务 |
| --- | --- | --- |

## 四、用法说明

（在此写明本项目采用溯源索引式还是条文式、读写判定要点、规则层源头变更时的同步纪律）
`

// 初始化项目任务区：创建 .tasks/active/{YYYYMM}/、.tasks/archive/、规范载体索引与 .gitignore 片段
// dir 为任务目录（默认 .tasks，支持绝对路径或 ../ 相对路径指向项目外），cwd 为仓库根（.gitignore 所在目录）
export function initWorkspace(dir = ".tasks", cwd = process.cwd()): void {
  const month = todayCompact().slice(0, 6)
  // resolve：dir 为绝对路径（项目外独立仓库）时直接使用，相对路径时基于 cwd 解析
  const root = resolve(cwd, dir)
  mkdirSync(join(root, "active", month), { recursive: true })
  mkdirSync(join(root, "archive"), { recursive: true })
  scaffoldConventions(root)
  appendGitignore(cwd)
}

// 生成规范载体索引骨架；已存在索引、或存在待迁移的旧单文件 conventions.md 时跳过
// 旧文件在时不建空骨架：否则空骨架会抢占目录形态的优先地位，旧内容形同被吞
function scaffoldConventions(root: string): void {
  const dir = join(root, "conventions")
  const index = join(dir, "index.md")
  if (existsSync(index) || existsSync(join(root, "conventions.md"))) return
  mkdirSync(dir, { recursive: true })
  writeFileAtomic(index, CONVENTIONS_INDEX)
}

// 向 .gitignore 追加忽略片段；片段已存在（含人工提前手写）或文件存在但无写权限时跳过
export function appendGitignore(cwd: string): void {
  const file = join(cwd, ".gitignore")
  if (!existsSync(file)) {
    // 无 .gitignore：直接创建并写入片段
    writeFileAtomic(file, GITIGNORE_SNIPPET)
    return
  }
  const raw = readFileSync(file, "utf8")
  if (raw.includes(".archive.lock")) return
  // 统一 LF 处理后追加，保留原换行风格
  const eol = raw.includes("\r\n") ? "\r\n" : "\n"
  const base = raw.endsWith("\n") || raw === "" ? raw : raw + eol
  writeFileAtomic(file, base + GITIGNORE_SNIPPET.replace(/\n/g, eol).replace(/^\r?\n/, ""))
}
