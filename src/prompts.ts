// 交互组件统一加载：@inquirer/prompts 为 ESM-only 且可能依赖较新 Node 的内置导出，
// 加载失败时把底层模块错误转成可执行中文提示，避免把英文原文透给用户

// 运行时下限真源移到轻量模块，交互组件与 cli 快速路径共用同一份判定
import { MIN_NODE } from "./node-version"
import { line } from "./term-style"
import { EXIT } from "./exit-codes"

// 再导出保持既有引用面不变（测试与命令层仍从本模块取）
export { MIN_NODE, nodeVersionAtLeast } from "./node-version"

// 加载交互组件：失败时抛出带当前版本与替代参数的中文错误，由命令层统一打印
export async function loadPrompts(): Promise<typeof import("@inquirer/prompts")> {
  try {
    return await import("@inquirer/prompts")
  } catch (error) {
    // 保留底层错误作为 cause，便于排查加载失败的具体模块与导出
    throw new Error(formatPromptsLoadError(error), { cause: error })
  }
}

// 判断是否用户取消（Ctrl+C / 程序 cancel）：inquirer 以专用错误名抛出
const CANCEL_ERROR_NAMES = new Set(["ExitPromptError", "AbortPromptError", "CancelPromptError"])

// 交互取消 / 无交互终端的退出码：数值唯一定义在 exit-codes，这里仅作兼容再导出
export const CANCEL_EXIT_CODE = EXIT.CANCEL

// 需要交互但当前环境不支持的退出码：脚本据此区分「环境不支持」与业务失败
export const INTERACTIVE_EXIT = EXIT.INTERACTIVE

// 列表统一分页：各命令不再各写一个数字
export const LIST_PAGE_SIZE = 15

// 统一「返回」项：置于菜单末位，选中即回上一层
export const BACK_CHOICE = { name: "← 返回", value: "back" } as const

// 统一「退出」项：顶层菜单末位
export const EXIT_CHOICE = { name: "退出", value: "exit" } as const

// 交互可用性：唯一 TTY 判定，避免各处重复拼 stdin / stdout
export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY)
}

// 交互前置：无交互等价路径时报 2；有等价路径时返回 false，交由调用方回落
export function requireInteractive(options: { action: string; hint: string; fallback?: boolean }): boolean {
  if (isInteractive()) return true
  if (options.fallback) return false
  console.error(`⚠️ 当前环境不支持交互（${options.action}）：${options.hint}`)
  process.exitCode = INTERACTIVE_EXIT
  return false
}

// 取消提示：诊断统一走 stderr，stdout 只放数据
export function reportCancelled(message = "已取消，未修改任何文件"): void {
  console.error(line.hint(message))
}

export function isPromptCancel(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return CANCEL_ERROR_NAMES.has(error.name) || /force closed/i.test(error.message)
}

// 区分「用户中断」与「输入被关闭」：TTY 内的取消属用户操作（130）；
// 非 TTY / EOF 导致的 prompt 关闭属环境不支持（2），不应冒充用户取消
export function classifyPromptCancel(error: unknown): "user" | "environment" | null {
  if (!isPromptCancel(error)) return null
  return process.stdin.isTTY ? "user" : "environment"
}

// 交互取消的终止出口：置 130 后立即结束进程，避免在残留的 readline 状态上继续开提示；
// 无法拿到原始错误的位置也可直接调用
export function exitWithCancel(): never {
  process.exitCode = CANCEL_EXIT_CODE
  process.exit(CANCEL_EXIT_CODE)
}

// 交互取消统一出口：用户中断按 130，输入被关闭按无交互环境（2）；其余错误交回调用方
export function exitOnPromptCancel(error: unknown): boolean {
  const kind = classifyPromptCancel(error)
  if (kind === null) return false
  if (kind === "environment") {
    console.error(line.hint("交互输入已关闭（非 TTY / EOF）：按无交互环境结束，请在终端运行或改用非交互参数"))
    process.exitCode = INTERACTIVE_EXIT
    process.exit(INTERACTIVE_EXIT)
    return true
  }
  process.exitCode = CANCEL_EXIT_CODE
  process.exit(CANCEL_EXIT_CODE)
  return true
}

// 提示返回结果：value 为正常应答，back 表示用户按 ESC 返回上一级
export type AskResult<T> = { value: T } | { back: true }

// ESC 返回：@inquirer 的提示未绑定 escape，这里在提示存活期间自建监听并调用其 cancel()，
// 走 inquirer 自身的清理，不产生 SIGINT，也就不会留下 raw mode / readline 的中间态
export async function askWithBack<T>(factory: () => Promise<T>): Promise<AskResult<T>> {
  const prompt = factory()
  const cancel = (prompt as unknown as { cancel?: () => void }).cancel
  const onKey = (_input: string, key?: { name?: string }): void => {
    if (key?.name === "escape") cancel?.()
  }
  process.stdin.on("keypress", onKey)
  try {
    return { value: await prompt }
  } catch (error) {
    if (error instanceof Error && error.name === "CancelPromptError") return { back: true }
    throw error
  } finally {
    process.stdin.removeListener("keypress", onKey)
  }
}

// 统一提问入口：back 打开 ESC 返回；返回值形状一致，调用方只判断 back / value
export async function ask<Value>(factory: () => Promise<Value>, options: { back?: boolean } = {}): Promise<AskResult<Value>> {
  return options.back ? await askWithBack(factory) : { value: await factory() }
}

// 命令层交互收口：取消以 130 结束，其余异常统一提示并以 1 收尾
export async function runInteractive(fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
  } catch (error) {
    if (exitOnPromptCancel(error)) return
    console.error(`⚠️ ${(error as Error).message}`)
    process.exitCode = 1
  }
}

// 组装加载失败提示：保留底层原因，并给出升级与非交互两条出路
export function formatPromptsLoadError(error: unknown, version = process.versions.node): string {
  const reason = error instanceof Error ? error.message : String(error)
  return (
    `交互式选择组件加载失败（当前 Node ${version}）：${reason}；` +
    `可升级到 Node >= ${MIN_NODE.major}.${MIN_NODE.minor} 后重试，或改用非交互参数（如 --yes / --all / --no-optional）`
  )
}
