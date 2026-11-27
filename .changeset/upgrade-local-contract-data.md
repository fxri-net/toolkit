---
"@fxri/toolkit": patch
---

- 新增：`toolkit upgrade` 检测并重写本机契约数据的 `schemaVersion`（技能状态、使用事件与索引、上报队列、上传账本、回收站清单），写前进入备份会话，可 `--restore` 回滚
- 新增：`toolkit upgrade --skip-events` 跳过事件文件重写；`--all` 显式全选
- 修改：`toolkit upgrade` 裸命令在 TTY 下改为交互多选且默认不全选；非 TTY 全量执行须 `--all --yes`；`--all` 与 `--only/--skip` 互斥
- 重大：非交互执行 `toolkit upgrade` 现须 `--all --yes`，只给 `--yes` 会报错；原 `upgrade --yes` 脚本需补 `--all`
- 修改：`toolkit status` 的迁移区块改名为「升级」，分布统计纳入本机数据
- 重大：`toolkit status` 的区块机器 id 由 `migrate` 改为 `upgrade`，按 id 过滤 JSON 的脚本需同步
- 重大：`toolkit usage data purge --all` 在非交互环境须加 `--yes`，否则报错退出 2
- 修改：`toolkit upgrade --prune-backups` 清理含数据迁移的备份时额外提示，数据回滚点随之消失
- 修改：本机数据迁移遇到无法解析或版本缺失的文件时整项判人工，不部分重写
- 新增：概念 `minimal-entry`（极简入口），规范索引新增 C-62 指针
