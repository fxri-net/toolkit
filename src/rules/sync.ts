// 提交规则显式同步：把 templates/rules/commit.md 正文镜像到项目内 .trae/rules/git-commit-message.md
// 规则改动是低频事件，故不挂自动化；由用户显式运行 rule sync，按差异确认后整段覆盖
import { createHash } from "node:crypto"
import { existsSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { createTwoFilesPatch } from "diff"
import { packageVersion } from "../skills"
import { readTextFile } from "../read-text"
import { writeFileAtomic } from "../write-atomic"
import { defaultRulesDir, loadRuleModules } from "./index"

// 目标文件：当前只有 Trae 需要项目内提交规则；其它 agent 走全局规则，不生成项目文件
export const RULE_SYNC_TARGET = ".trae/rules/git-commit-message.md"
// 生成标记：与规则正文分隔，不进可复制块；逐字一致性测试比对时剔除本行
export const RULE_SYNC_NOTE = "<!-- 由 toolkit 生成，更新请跑 toolkit rule sync；勿手改本文件 -->"
// 标记行前缀：读取时据此剔除生成说明，兼容文案微调
const RULE_SYNC_NOTE_PREFIX = "<!-- 由 toolkit 生成"

export interface RuleSyncState {
  // 仓库根相对路径与绝对路径
  target: string
  absolute: string
  exists: boolean
  // 正文与当前版本一致
  upToDate: boolean
  // 当前正文与上次生成时不同（手改，或本功能引入前的手工文件）
  handEdited: boolean
  // 文件记录的生成版本；无标记时为 null
  currentVersion: string | null
  latestVersion: string
  // 最新文件的完整内容与正文
  content: string
  body: string
  // 相对当前文件的 unified diff；文件不存在时为空
  patch: string
  added: number
  removed: number
}

// 真源正文：commit 模块去掉首行更新时间锚点，与规则页可复制块同源
export function ruleSyncBody(dir = defaultRulesDir()): string {
  const mod = loadRuleModules(dir).find((item) => item.id === "commit")
  if (!mod) throw new Error("规则清单缺少 commit 模块，无法同步提交规则")
  return mod.body
}

// 正文摘要：用于识别上次生成后是否被手改
function bodyHash(body: string): string {
  return createHash("sha256").update(body).digest("hex")
}

// 拼装最新文件：frontmatter 只记版本与正文摘要，保证同版本重复同步零改动
export function buildRuleSyncContent(dir = defaultRulesDir()): { version: string; body: string; content: string } {
  const version = packageVersion()
  const body = ruleSyncBody(dir)
  const content = [
    "---",
    "alwaysApply: true",
    "scene: git_message",
    `generated_by: "@fxri/toolkit ${version}"`,
    `generated_sha256: ${bodyHash(body)}`,
    "---",
    "",
    RULE_SYNC_NOTE,
    "",
    body,
    "",
  ].join("\n")
  return { version, body, content }
}

// 拆出 frontmatter 记录与正文：正文剔除生成标记行后归一比较
function parseFile(text: string): { version: string | null; hash: string | null; body: string } {
  const matched = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
  const header = matched?.[1] ?? ""
  const rest = matched ? text.slice(matched[0].length) : text
  const version = /^generated_by:\s*"@fxri\/toolkit\s+([^"]+)"/m.exec(header)?.[1] ?? null
  const hash = /^generated_sha256:\s*"?([0-9a-f]{64})"?/m.exec(header)?.[1] ?? null
  const body = rest
    .split(/\r?\n/)
    .filter((line) => !line.startsWith(RULE_SYNC_NOTE_PREFIX))
    .join("\n")
    .trim()
  return { version, hash, body }
}

// 差异行数：统计 unified diff 的新增 / 删除行，首部文件名行不计
function countChanges(patch: string): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const line of patch.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue
    if (line.startsWith("+")) added += 1
    else if (line.startsWith("-")) removed += 1
  }
  return { added, removed }
}

// 现场检查：只读，不改任何文件
export function inspectRuleSync(cwd = process.cwd()): RuleSyncState {
  const { version, body, content } = buildRuleSyncContent()
  const absolute = join(cwd, RULE_SYNC_TARGET)
  const base = { target: RULE_SYNC_TARGET, absolute, latestVersion: version, content, body }
  if (!existsSync(absolute)) {
    return { ...base, exists: false, upToDate: false, handEdited: false, currentVersion: null, patch: "", added: 0, removed: 0 }
  }
  const raw = readTextFile(absolute).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n")
  const parsed = parseFile(raw)
  const upToDate = parsed.body === body
  // 有摘要即以摘要判定手改；无摘要说明文件不是本命令生成的，同样按手改处理、不默认覆盖
  const handEdited = !upToDate && (parsed.hash === null || parsed.hash !== bodyHash(parsed.body))
  const patch = upToDate
    ? ""
    : createTwoFilesPatch(`a/${RULE_SYNC_TARGET}`, `b/${RULE_SYNC_TARGET}`, raw, content, "", "", { context: 3 })
  const { added, removed } = countChanges(patch)
  return { ...base, exists: true, upToDate, handEdited, currentVersion: parsed.version, patch, added, removed }
}

// 写入：整段覆盖，目录不存在时创建
export function writeRuleSync(state: RuleSyncState): void {
  mkdirSync(dirname(state.absolute), { recursive: true })
  writeFileAtomic(state.absolute, state.content)
}
