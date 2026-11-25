---
"@fxri/toolkit": patch
---

- 修复：`fxri-plan-task` 复核请求改为内联自足规则（输出结论单表、不写文件），不再要求按 `fxri-plan-review` 的口径执行
- 修复：`fxri-release-changelog` 的前置归档检查改用 `toolkit task` 命令兜底，未安装归档技能也能执行
- 修复：`fxri-writing-docs` 落地步骤去掉「按仓库发版链路发布」，只保留记录 patch 变更集
