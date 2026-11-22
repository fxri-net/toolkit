// 系统剪贴板写入：按平台选择命令，失败时返回错误交由 CLI 明确报错
// Windows 不在 stdin 上送文本：PowerShell 5.1 从重定向管道读 $input 时按 ANSI 代码页解码，
// Node 写出的是 UTF-8 字节，中文会被误解码；改为写入 UTF-8 临时文件，路径经环境变量交给 PowerShell 读取
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ENV_CLIP_FILE } from "../env"

export interface ClipboardResult {
  ok: boolean
  // 成功执行的可执行文件名：供用户提示使用，避免暴露完整命令
  label?: string
  // 完整命令串：仅用于诊断与错误信息
  command?: string
  error?: string
}

// 临时文件路径的环境变量名：带产品标识，避免与其它工具撞名
export const CLIP_FILE_ENV = ENV_CLIP_FILE

// Windows 命令：按 UTF-8 读取环境变量给出的文件全文后写入剪贴板
const WINDOWS_CLIP_COMMAND = `Set-Clipboard -Value (Get-Content -Raw -Encoding UTF8 -LiteralPath $env:${CLIP_FILE_ENV})`

// 平台 → 候选命令；Windows 只保留 PowerShell（clip 走 ANSI 通道，中文必然乱码，不作为兜底）
export function clipboardCommands(platform: string): string[][] {
  if (platform === "win32") return [["powershell", "-NoProfile", "-Command", WINDOWS_CLIP_COMMAND]]
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
  // Windows：文本走临时文件，绕开 stdin 的 ANSI 解码；成功与失败路径都要清理
  if (platform === "win32") {
    const dir = mkdtempSync(join(tmpdir(), "toolkit-clip-"))
    try {
      const file = join(dir, "content.txt")
      writeFileSync(file, text, "utf8")
      const [command, ...args] = clipboardCommands(platform)[0] ?? []
      if (!command) return { ok: false, error: "未找到可用的剪贴板命令" }
      const result = spawn(command, args, {
        env: { ...process.env, [CLIP_FILE_ENV]: file },
        windowsHide: true,
      })
      if (!result.error && result.status === 0) return { ok: true, label: command, command: [command, ...args].join(" ") }
      return { ok: false, error: `${command}：${result.error?.message ?? `退出码 ${String(result.status)}`}` }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
  const errors: string[] = []
  for (const candidate of clipboardCommands(platform)) {
    const [command, ...args] = candidate
    if (!command) continue
    const result = spawn(command, args, { input: text })
    if (!result.error && result.status === 0) return { ok: true, label: command, command: [command, ...args].join(" ") }
    errors.push(`${command}：${result.error?.message ?? `退出码 ${String(result.status)}`}`)
  }
  return { ok: false, error: errors.join("；") }
}
