---
"@fxri/toolkit": patch
---

- 新增：`toolkit skills bump` 递增技能版本，同步改写 frontmatter 与正文首部两处声明
- 新增：`--all` 批量递增、`--set` 直接设定版本，支持 `--dry-run` 与 `--format json`
- 修复：批量抬 minor / major 需交互确认，非交互环境须显式 `--yes`
