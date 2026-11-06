// Hook 命令的生成与形态判定：平台差异只允许集中在本模块
// Windows 的 Agent 经 PowerShell 执行命令，POSIX 经 bash/sh 执行；两种宿主的调用语法与引号规则不同，必须分别生成
import { realpathSync } from "node:fs"

// 归一为真实路径：fnm / nvm 等版本管理器下 process.execPath 常是会话级路径，
// 直接写进 Hook 会在 shell 清理后失效；realpath 取到稳定目标，失败时回退原串
export function stablePath(path: string | undefined): string {
  if (!path) return ""
  try {
    return realpathSync.native(path)
  } catch {
    return path
  }
}

// POSIX 单引号转义：把 ' 写成 '\''，保证内容原样传给 shell
function posixQuote(text: string): string {
  return text.replace(/'/g, `'\\''`)
}

// PowerShell 单引号转义：单引号串内的 ' 以 '' 表示
function powershellQuote(text: string): string {
  return text.replace(/'/g, "''")
}

// Windows 包装前缀：显式经 PowerShell 执行，cmd / Git Bash 亦能拉起；
// 内部用调用运算符 & 拼接带引号的可执行文件，避免「两个引号串并列」被当成表达式
const WINDOWS_WRAPPER = "powershell -NoProfile -Command"

// 生成 Hook 命令：platform 可注入，便于单测覆盖两条分支
export function buildHookCommand(
  agent: string,
  cliPath = process.argv[1],
  nodePath = process.execPath,
  platform = process.platform,
): string {
  const node = stablePath(nodePath)
  const cli = stablePath(cliPath)
  if (platform === "win32") {
    return `${WINDOWS_WRAPPER} "& '${powershellQuote(node)}' '${powershellQuote(cli)}' usage ingest --agent ${agent}"`
  }
  return `'${posixQuote(node)}' '${posixQuote(cli)}' usage ingest --agent ${agent}`
}

// 判定已安装命令是否按当前平台生成：旧版「双引号并列」在 PowerShell 下不可执行，需重装
export function isCurrentHookCommand(command: string, agent: string, platform = process.platform): boolean {
  if (!command.includes(`usage ingest --agent ${agent}`)) return false
  if (platform === "win32") return command.startsWith(`${WINDOWS_WRAPPER} "& `)
  return command.startsWith("'")
}
