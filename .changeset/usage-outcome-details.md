---
"@fxri/toolkit": patch
---

- 修改：技能事件按返回体推断结果——Trae 的 `Skill` 工具返回 `skill_path` / `skill_detail` 判 `success`，显式错误字段仍优先判 `failure`；dsh 桥接为纯文本，保持 `unknown`
- 修改：`usage stats --by trigger` 每条增加最近调用时间，便于查看单个技能的调用明细
- 新增：`usage hooks status --all` 可列出本机未安装的 Agent，便于清理残留配置
- 文档：同步上述用法，并写明 dsh 的 `outcome` 限制
