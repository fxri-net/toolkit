---
"@fxri/toolkit": patch
---

- 新增：`toolkit upgrade` 检测并重写本机契约数据的 `schemaVersion`（技能状态、使用事件与索引、上报队列、上传账本、回收站清单），写前进入备份会话，可 `--restore` 回滚
- 新增：`toolkit upgrade --skip-events` 跳过事件文件重写；`--all` 显式全选，配合 `--yes` 供脚本使用
- 修改：`toolkit status` 的迁移区块改名为「升级」（机器 id `upgrade`），分布统计纳入本机数据
- 修改：`upgrade` 条目超过 5 项时改为交互多选且默认不全选，条目不多时一次确认执行
- 新增：概念 `minimal-entry`（极简入口），规范索引新增 C-62 指针
