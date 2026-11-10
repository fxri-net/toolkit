---
"@fxri/toolkit": patch
---

- 修复：`init` 的已装判定改为检查登记产物是否仍在磁盘，目录被删后不再误判「已安装」而跳过 `skills install` 指引
- 修复：技能更新提示中，链接悬空（目标不存在）不再按状态登记算作已装，交由 `skills status` 报悬空
- 修复：来源真源不可读时，`skills status` 的版本改用登记值兜底并标注「（登记值）」，`--format json` 增 `skillVersionsFromState`
