---
title: changelog 与 changelogDoc（语言与镜像）
---

# changelog 与 changelogDoc：语言与镜像

> 多语言 CHANGELOG 的语言表，以及文档站更新页镜像的路径与页头。

## changelog：语言表

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `languages` | object | 无 | 追加或覆盖语言；内置 `zh`/`en`，配置同名 key 覆盖内置，新 key 追加（同名 key 为**整体覆盖**，非字段级深合并：配了某语言，其未写的段也不会落到内置） |

每个语言为四段结构：

```json
{
  "changelog": {
    "languages": {
      "ja": {
        "groups": [
          { "slot": "breaking", "title": "### 🚨 重大変更" },
          { "slot": "added", "title": "### ✨ 新規機能" },
          { "slot": "fixed", "title": "### 🐛 不具合修正" },
          { "slot": "other", "title": "### 📦 その他" }
        ],
        "replacements": { "### Major Changes": "### 🚨 重大変更" },
        "deps": "- 依存関係を更新",
        "released": "リリース"
      }
    }
  }
}
```

| 字段 | 说明 |
| --- | --- |
| `groups` | 语义分组表（可选、有序，组序即输出顺序）：每项 `{ slot, title, prefixes? }`——`slot` 取全局语义槽位（`breaking`/`added`/`changed`/`improved`/`fixed`/`docs`/`removed`/`deps`/`other`），`title` 为本语言组标题，`prefixes` 为本语言自有类型前缀（可选，识别时与全局前缀表取并集）；缺省时不改分组结构，只剥离可识别前缀并应用 `replacements` |
| `replacements` | 兜底替换映射（源标题 → 目标标题） |
| `deps` | 依赖更新条目文案 |
| `released` | 发布日期后缀（同时用于识别既有日期行） |

## changelogDoc：文档站更新页镜像

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `source` | string | `CHANGELOG.md` | 根 CHANGELOG 路径；`--lang` 非默认语言时追加语言后缀 |
| `target` | string | `docs/changelog.md` | 镜像页路径 |
| `title` | string | `更新日志` | 镜像页 H1 |
| `outline` | string | `[2, 2]` | VitePress frontmatter outline |
| `frontmatter` | boolean | `true` | 是否写 frontmatter；`--no-frontmatter` 可本次关闭 |
| `note` | string | 内置来源说明 | 页头来源说明文案 |

`toolkit changelog doc` 与 `changelog version` 的自动同步共用本段；CLI 显式参数优先。非法值告警后按默认处理。

## 相关页面

- 参考：[配置参考总览](../config) · [完整攻略 · 多语言 CHANGELOG](../guide#多语言-changelog) · [changelog 命令](../cli/changelog)
