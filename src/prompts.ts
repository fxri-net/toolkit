// 交互组件统一加载：@inquirer/prompts 为 ESM-only 且可能依赖较新 Node 的内置导出，
// 加载失败时把底层模块错误转成可执行中文提示，避免把英文原文透给用户

// 运行时下限真源移到轻量模块，交互组件与 cli 快速路径共用同一份判定
import { MIN_NODE } from "./node-version"

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

// 交互取消的退出码：与 shell 对 SIGINT 的惯例一致
export const CANCEL_EXIT_CODE = 130

export function isPromptCancel(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return CANCEL_ERROR_NAMES.has(error.name) || /force closed/i.test(error.message)
}

// 交互取消的终止出口：置 130 后立即结束进程，避免在残留的 readline 状态上继续开提示；
// 无法拿到原始错误的位置也可直接调用
export function exitWithCancel(): never {
  process.exitCode = CANCEL_EXIT_CODE
  process.exit(CANCEL_EXIT_CODE)
}

// 交互取消统一出口：命中取消即按取消退出，其余错误交回调用方
export function exitOnPromptCancel(error: unknown): boolean {
  if (!isPromptCancel(error)) return false
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

// 组装加载失败提示：保留底层原因，并给出升级与非交互两条出路
export function formatPromptsLoadError(error: unknown, version = process.versions.node): string {
  const reason = error instanceof Error ? error.message : String(error)
  return (
    `交互式选择组件加载失败（当前 Node ${version}）：${reason}；` +
    `可升级到 Node >= ${MIN_NODE.major}.${MIN_NODE.minor} 后重试，或改用非交互参数（如 --yes / --all / --no-optional）`
  )
}
