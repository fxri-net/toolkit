// 全局规则文案：与文档站可复制块同源，由 `toolkit usage rule` 输出
// 不自动改写用户全局规则文件，避免替用户做授权决定
import { composeRules } from "../rules"

// usage 模块的组合结果；`toolkit rules compose --module usage` 与它等价
export function usageGlobalRule(dir?: string): string {
  try {
    return composeRules(["usage"], { dir })
  } catch (error) {
    throw new Error(`无法读取规则模板：${(error as Error).message}；请确认 @fxri/toolkit 的 templates/rules 随包分发`, {
      cause: error,
    })
  }
}
