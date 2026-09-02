// 语言映射：源标题 → 目标标题
export type LanguageMap = Record<string, string>

// 单个语言的格式化配置
export interface ChangelogLanguage {
  replacements: LanguageMap
  deps: string
  released: string
}

export const languages: Record<string, ChangelogLanguage> = {
  zh: {
    replacements: {
      "### Major Changes": "### 🚨 重大变更",
      "### 重大变更": "### 🚨 重大变更",
      "### Minor Changes": "### ✨ 新增功能",
      "### 新增功能": "### ✨ 新增功能",
      "### Patch Changes": "### 🐛 补丁修复",
      "### 补丁修复": "### 🐛 补丁修复",
      "### Dependent Changes": "### 🔗 依赖变更",
      "### 依赖变更": "### 🔗 依赖变更",
      "- Updated dependencies": "- 更新依赖",
    },
    deps: "- 更新依赖",
    released: "发布",
  },
  en: {
    replacements: {
      "### Major Changes": "### 🚨 Major Changes",
      "### Minor Changes": "### ✨ Minor Changes",
      "### Patch Changes": "### 🐛 Patch Changes",
      "### Dependent Changes": "### 🔗 Dependent Changes",
    },
    deps: "- Updated dependencies",
    released: "released",
  },
}

export const DEFAULT_LANG = "zh"
