---
"@fxri/toolkit": patch
---

- 修改：`usage` 收为 `show` / `data` / `config` / `setup` 四组，`record` / `log` 等上报入口保留在顶层
- 修改：`scope` 的目录名单增删改收进 `scope list` 组，`scope list` 裸命令仍为查看
- 修改：发版域改用 `bump` / `changelog` / `mirror` / `publish` / `audit` 与 `changeset add|list|status`，裸命令默认输出待发布变更集概览
- 优化：`skills path` 下沉为 `skills status --path`，`skills gate` 下沉为 `config get|set skillDelivery.default`（on → gated、off → full）
- 优化：`skills sources` 更名为 `skills source`；`install --from` 收敛为 `install --source <name|path>`，可直接传已登记来源名
- 新增：旧路径在参数解析前重写为新路径并给出弃用提示，命中记录由 `toolkit status` 汇总；旧命令不再注册独立命令
- 优化：`config list/get/set/unset` 的 `--format json` 接入统一信封（command / ok / data / issues）
- 优化：`skills plan`、`skills mount`、`usage log` 等低频命令在 help 中隐藏
