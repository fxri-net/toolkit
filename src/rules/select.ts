// 规则组合的交互计划：预设选项与自定义选择的归一，保持纯函数便于单测
import { formatChoiceLine } from "../prompt-line"
import type { RulePreset } from "./index"

// 自定义选项的哨兵值：与真实预设名不冲突
export const CUSTOM_PRESET = "__custom__"

// 预设选项：显示名取预设 label，模块清单与说明同行展示，末尾追加「自定义」
export function buildPresetChoices(presets: Record<string, RulePreset>): Array<{ name: string; value: string }> {
  return [
    ...Object.entries(presets).map(([name, preset]) => ({
      name: formatChoiceLine({ name: `${preset.label}（${preset.modules.join(" → ")}）`, description: preset.summary }),
      value: name,
    })),
    { name: "自定义…", value: CUSTOM_PRESET },
  ]
}

// 自定义选择归一：只保留已知模块，并按清单定义顺序输出（与列表展示一致）
export function normalizePickedModules(moduleIds: string[], picked: string[]): string[] {
  const wanted = new Set(picked)
  return moduleIds.filter((id) => wanted.has(id))
}
