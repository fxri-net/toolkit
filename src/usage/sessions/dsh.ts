// DeepSeek Harness 反查：会话记录在 ~/.dsh/sessions/<项目>/session-<id>/session.v4.jsonl.zstd
// Node 20 无内置 zstd 解码，只有本机存在 zstd 命令时才反查；解不开就跳过，不影响基础统计
import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import * as zlib from "node:zlib"
import { getHomeDir } from "../../config"
import { parseSessionJsonl } from "./jsonl"
import type { SessionLookup } from "./types"

// 会话根目录
function dshSessionsRoot(): string {
  return join(getHomeDir(), ".dsh", "sessions")
}

// 解压 zstd：优先 Node 内置（22.15+），否则调用本机 zstd 命令，均不可用返回 null
function decompressZstd(file: string): string | null {
  const builtin = (zlib as unknown as { zstdDecompressSync?: (input: Buffer) => Buffer }).zstdDecompressSync
  if (typeof builtin === "function") {
    try {
      return builtin(readFileSync(file)).toString("utf8")
    } catch {
      return null
    }
  }
  try {
    return execFileSync("zstd", ["-dc", file], { encoding: "utf8", timeout: 1500, maxBuffer: 32 * 1024 * 1024 })
  } catch {
    return null
  }
}

// 定位会话文件：按 session id 匹配目录名；找不到时取最近修改的会话
export function findDshSessionFile(sessionId: string): string | null {
  const root = dshSessionsRoot()
  if (!existsSync(root)) return null
  const candidates: string[] = []
  for (const project of readdirSync(root)) {
    const dir = join(root, project)
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      continue
    }
    for (const name of entries) {
      const file = join(dir, name, "session.v4.jsonl.zstd")
      if (existsSync(file)) candidates.push(file)
    }
  }
  const exact = candidates.find((file) => file.includes(`session-${sessionId}`))
  return exact ?? candidates[candidates.length - 1] ?? null
}

// 反查 dsh 会话：zstd 不可用、文件损坏或格式不符时返回 null
export function lookupDshSession(sessionId: string): SessionLookup | null {
  try {
    const file = findDshSessionFile(sessionId)
    if (!file) return null
    const text = decompressZstd(file)
    if (!text) return null
    const calls = parseSessionJsonl(text)
    return calls.length > 0 ? { agent: "dsh", file, calls } : null
  } catch {
    return null
  }
}
