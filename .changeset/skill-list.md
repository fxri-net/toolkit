---
"@fxri/toolkit": patch
---

- 新增：`toolkit skill list` 查看已装技能的名称、简介、版本、形态与目标数，`--all` 含未安装、`--format json` 机器可读
- 修改：技能状态条目增加 `summary`，来源不可解析时列表用登记简介兜底，旧账缺字段照常读取
