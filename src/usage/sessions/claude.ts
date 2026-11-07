// Claude Code 反查：会话记录在 <CLAUDE_CONFIG_DIR|~/.claude>/projects/<项目>/<sessionId>.jsonl
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { isAbsolute, join } from "node:path"
import { getHomeDir } from "../../config"
import { parseSessionJsonl } from "./jsonl"
import type { SessionLookup } from "./types"

// 配置目录：CLAUDE_CONFIG_DIR 可为绝对路径或相对 home 的目录名
function claudeConfigDir(): string {
  const env = process.env.CLAUDE_CONFIG_DIR
  if (env) return isAbsolute(env) ? env : join(getHomeDir(), env)
  return join(getHomeDir(), ".claude")
}

// 递归收集 jsonl：限两层（projects/<项目>/*.jsonl）
function collectJsonl(dir: string, depth: number, found: string[]): void {
  if (depth < 0) return
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    const file = join(dir, name)
    let stat
    try {
      stat = statSync(file)
    } catch {
      continue
    }
    if (stat.isDirectory()) collectJsonl(file, depth - 1, found)
    else if (name.endsWith(".jsonl")) found.push(file)
  }
}

// 定位会话文件：优先同名文件，其次最近 24 小时内修改的最新文件
export function findClaudeSessionFile(sessionId: string): string | null {
  const root = join(claudeConfigDir(), "projects")
  if (!existsSync(root)) return null
  const files: string[] = []
  collectJsonl(root, 1, files)
  const exact = files.find((file) => file.endsWith(`${sessionId}.jsonl`))
  if (exact) return exact
  let newest: { file: string; mtime: number } | null = null
  for (const file of files) {
    try {
      const mtime = statSync(file).mtimeMs
      if (Date.now() - mtime > 24 * 60 * 60 * 1000) continue
      if (!newest || mtime > newest.mtime) newest = { file, mtime }
    } catch {
      // 单文件读取失败不影响其它候选
    }
  }
  return newest?.file ?? null
}

// 反查 Claude 会话：读取失败或格式变化时返回 null
export function lookupClaudeSession(sessionId: string): SessionLookup | null {
  try {
    const file = findClaudeSessionFile(sessionId)
    if (!file) return null
    const calls = parseSessionJsonl(readFileSync(file, "utf8"))
    return calls.length > 0 ? { agent: "claude", file, calls } : null
  } catch {
    return null
  }
}
