# CHANGELOG 格式规范

## 1. 文件结构（中文示例）

```markdown
## 1.5.3

> 2026-09-03 发布

### 🐛 补丁修复

- 修复 xxx：……
```

规则：

- 版本标题 `## {版本号}`；隔一行后接引用行 `> {YYYY-MM-DD} 发布`（标题与日期行之间保留一个空行）
- 分组标题 = emoji + 组名，一行一组，按 major → minor → patch 顺序
- 条目一行一条，项目语言句式（中文条目句末不加句号），与仓库既有风格一致

## 2. 分组标题映射（zh 内置）

| 源标题（changesets 输出） | 目标标题 |
| --- | --- |
| `### Major Changes` | `### 🚨 重大变更` |
| `### Minor Changes` | `### ✨ 新增功能` |
| `### Patch Changes` | `### 🐛 补丁修复` |
| `### Dependent Changes` | `### 🔗 依赖变更` |
| `- Updated dependencies` | `- 更新依赖` |

英文基准分组：`### Major Changes` / `### Minor Changes` / `### Patch Changes` / `### Dependent Changes`。

## 3. 多语言扩展

每种语言约定三段结构：

- `replacements`：源标题 → 目标标题映射表（覆盖分组标题与依赖条目）
- `deps`：依赖更新条目固定文案
- `released`：发布日期行后缀（中文为「发布」，英文为「released」）

新增语言时先补全三段，再按映射转换标题、润色条目。
