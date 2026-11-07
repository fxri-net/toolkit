// 系统剪贴板写入：按平台选择命令，失败时返回错误交由 CLI 明确报错
import { spawnSync } from "node:child_process"

export interface ClipboardResult {
  ok: boolean
  command?: string
  error?: string
}

// 平台 → 候选命令：Windows 优先 PowerShell Set-Clipboard（Unicode 稳定），回退 clip
export function clipboardCommands(platform: string): string[][] {
  if (platform === "win32") {
    return [
      ["powershell", "-NoProfile", "-Command", "$input | Set-Clipboard"],
      ["clip"],
    ]
  }
  if (platform === "darwin") return [["pbcopy"]]
  return [
    ["wl-copy"],
    ["xclip", "-selection", "clipboard"],
  ]
}

// 依次尝试候选命令：任一成功即返回；全部失败返回错误明细
export function copyToClipboard(
  text: string,
  platform = process.platform,
  spawn: typeof spawnSync = spawnSync,
): ClipboardResult {
  const errors: string[] = []
  for (const candidate of clipboardCommands(platform)) {
    const [command, ...args] = candidate
    if (!command) continue
    const result = spawn(command, args, { input: text })
    if (!result.error && result.status === 0) return { ok: true, command: [command, ...args].join(" ") }
    errors.push(`${command}：${result.error?.message ?? `退出码 ${String(result.status)}`}`)
  }
  return { ok: false, error: errors.join("；") }
}
