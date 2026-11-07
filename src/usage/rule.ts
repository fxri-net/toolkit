// 全局规则文案：与文档站可复制块同源，由 `toolkit usage rule` 输出
// 不自动改写用户全局规则文件，避免替用户做授权决定
import { composeRules } from "../rules"

// usage 模块的组合结果；`toolkit rules compose --module usage` 与它等价
export function usageGlobalRule(): string {
  return composeRules(["usage"])
}
