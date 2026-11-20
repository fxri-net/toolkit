---
"@fxri/toolkit": minor
---

- 新增：新增 `scope exclude` / `scope default` / `scope reset` 与 `scope remove --from/--to`，补齐黑名单与默认值的非交互入口
- 修改：`scope add/exclude/remove` 需显式目录，写前统一预览并输出结果块；相对路径按目标层项目根解析
- 修改：`mode: denylist` 兼容读为 `all`，`status` / `list` 明确标注并在写入时归一
