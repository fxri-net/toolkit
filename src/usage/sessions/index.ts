// 会话反查入口：按环境变量与会话目录识别 Agent，再分派到各适配器
import { existsSync } from "node:fs"
import { join } from "node:path"
import { getHomeDir } from "../../config"
import { lookupClaudeSession } from "./claude"
import { lookupDshSession } from "./dsh"
import { lookupTraeSession } from "./trae"
import type { SessionLookup } from "./types"

// 识别 Agent：显式环境变量 > 各 Agent 的会话变量 > 已存在的配置目录
export function detectAgent(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.TOOLKIT_USAGE_AGENT
  if (explicit && explicit.trim() !== "") return explicit.trim()
  if (env.CLAUDE_SESSION_ID || env.CLAUDE_CONFIG_DIR) return "claude"
  if (env.TRAE_SESSION_ID) return "trae"
  if (env.DSH_SESSION_ID) return "dsh"
  const home = getHomeDir()
  if (existsSync(join(home, ".claude"))) return "claude"
  if (existsSync(join(home, ".trae-cn")) || existsSync(join(home, ".trae"))) return "trae"
  if (existsSync(join(home, ".dsh"))) return "dsh"
  return "unknown"
}

// 反查会话调用：识别不出 Agent 或读取失败都返回 null
export function lookupSessionCalls(agent: string, sessionId: string): SessionLookup | null {
  if (agent === "claude") return lookupClaudeSession(sessionId)
  if (agent === "dsh") return lookupDshSession(sessionId)
  if (agent === "trae") return lookupTraeSession()
  return null
}
