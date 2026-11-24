---
"@fxri/toolkit": patch
---

- 重大：移除 `scope policy` / `scope skills` / `scope list` 三组子命令；名单与策略统一由 `scope allow` / `deny` 写入，覆盖由 `scope remove` / `default` / `reset` 承担，档案由 `scope profile` 管理
- 修改：`scope allow` / `deny` 按条件选项自动分流——无条件选项写目录名单，出现 `--skill` / `--profile` / `--paths` 等任一条件时写策略
- 修改：`scope status` 新增 `--lists` 与 `--policies` 视图；`scope reset` 默认清名单、策略与档案并一次预览确认
- 修改：v1 顶层 `scope add` / `exclude` 的迁移目标改为 `allow` / `deny`；消息、帮助与文档中的旧命令口径同步
