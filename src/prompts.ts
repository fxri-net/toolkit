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

// 判断是否用户取消（Ctrl+C / ESC）：inquirer 以 ExitPromptError / AbortPromptError 抛出
export function isPromptCancel(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.name === "ExitPromptError" || error.name === "AbortPromptError" || /force closed|cancel/i.test(error.message)
}

// 组装加载失败提示：保留底层原因，并给出升级与非交互两条出路
export function formatPromptsLoadError(error: unknown, version = process.versions.node): string {
  const reason = error instanceof Error ? error.message : String(error)
  return (
    `交互式选择组件加载失败（当前 Node ${version}）：${reason}；` +
    `可升级到 Node >= ${MIN_NODE.major}.${MIN_NODE.minor} 后重试，或改用非交互参数（如 --yes / --all / --no-optional）`
  )
}
