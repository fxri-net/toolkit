// 语言映射：源标题 → 目标标题（兜底替换，供手工模式与幂等复用）
export type LanguageMap = Record<string, string>

// 语义槽位：CHANGELOG 的分组维度，与版本号（bump）维度正交
export type SemanticSlot = "breaking" | "added" | "changed" | "improved" | "fixed" | "docs" | "removed" | "deps" | "other"

// 槽位识别前缀：全局一份、全语言共用，故任一语言的条目在任何输出语言下都能正确归组
export const SLOT_PREFIXES: Record<SemanticSlot, string[]> = {
  breaking: ["重大：", "Breaking:"],
  added: ["新增：", "Added:"],
  changed: ["修改：", "Changed:"],
  improved: ["优化：", "Improved:", "技能：", "skills："],
  fixed: ["修复：", "Fixed:"],
  docs: ["文档：", "Docs:"],
  removed: ["清理：", "Removed:"],
  deps: ["依赖："],
  other: [],
}

// 历史组标题 → 槽位：早期版本的组标题与当前语言标题不同（如「🐛 补丁修复」已被「🐛 问题修复」取代）。
// 与 SLOT_PREFIXES 同属全局一份、全语言共用，供 --history 追溯历史块时按组标题归位
export const LEGACY_TITLE_SLOTS: Record<string, SemanticSlot> = {
  "### 🐛 补丁修复": "fixed",
}

// 一个语义分组：槽位 + 本地化标题；prefixes 为可选追加的本语言自有前缀（识别时与全局表取并集）
export interface LanguageGroup {
  // 语义槽位
  slot: SemanticSlot
  // 本地化组标题（含 emoji）
  title: string
  // 本语言自有前缀（可选）
  prefixes?: string[]
}

// 单个语言的格式化配置
export interface ChangelogLanguage {
  // 语义分组（有序，组序即输出顺序）；缺省时退化为纯替换（仅 replacements 生效）
  groups?: LanguageGroup[]
  // 兜底替换映射
  replacements: LanguageMap
  // 依赖更新条目文案
  deps: string
  // 发布日期行后缀（同时用于识别既有日期行）
  released: string
}

export const languages: Record<string, ChangelogLanguage> = {
  zh: {
    groups: [
      { slot: "breaking", title: "### 🚨 重大变更" },
      { slot: "added", title: "### ✨ 新增功能" },
      { slot: "changed", title: "### 🔧 功能调整" },
      { slot: "improved", title: "### ⚡ 优化改进" },
      { slot: "fixed", title: "### 🐛 问题修复" },
      { slot: "docs", title: "### 📝 文档更新" },
      { slot: "removed", title: "### 🧹 清理移除" },
      { slot: "deps", title: "### 🔗 依赖变更" },
      { slot: "other", title: "### 📦 其他变更" },
    ],
    replacements: {
      "### 重大变更": "### 🚨 重大变更",
      "### 新增功能": "### ✨ 新增功能",
      "### 补丁修复": "### 🐛 问题修复",
      "- Updated dependencies": "- 更新依赖",
    },
    deps: "- 更新依赖",
    released: "发布",
  },
  en: {
    groups: [
      { slot: "breaking", title: "### 🚨 Breaking Changes" },
      { slot: "added", title: "### ✨ Added" },
      { slot: "changed", title: "### 🔧 Changed" },
      { slot: "improved", title: "### ⚡ Improved" },
      { slot: "fixed", title: "### 🐛 Fixed" },
      { slot: "docs", title: "### 📝 Docs" },
      { slot: "removed", title: "### 🧹 Removed" },
      { slot: "deps", title: "### 🔗 Dependency Updates" },
      { slot: "other", title: "### 📦 Other" },
    ],
    replacements: {},
    deps: "- Updated dependencies",
    released: "released",
  },
}

export const DEFAULT_LANG = "zh"
