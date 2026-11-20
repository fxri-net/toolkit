---
"@fxri/toolkit": minor
---

- 新增：`toolkit skills install --gate` 开启内容闸门，按 `skillsInstall.gate` 规则把技能改写为入口壳，正文由 `toolkit scope guard <技能名>` 按作用域下发
- 新增：`toolkit scope guard <技能名>` 激活时输出包内正文、参考文件目录走 stderr；未激活退出码 `3` 且 stdout 为空；技能名非法或不存在退出码 `1`
- 新增：`toolkit skills install --embed` 回退全文，`skills status` 显示闸门开关与入口壳形态，开关写入 `skillsInstall.gate`
- 优化：CLI 入口拆分为 guard 快速路径与常规命令分包，guard 启动不再加载完整命令集
- 修复：闸门改按技能身份判定（不再额外限定内置源）；`toolkit scope` 向导新增内容闸门入口；`--gate` 下 `--copy` 明确告警；`skills status` 按实际产物显示闸门状态；guard 快速路径补 Node 下限检查
- 修复：`skills status` 识别与当前版本不一致的过期入口壳（`gate-drift`），提示重跑 `skills install` 刷新，避免升级后误报正常
- 修复：`--gate` / `--embed` 开关改为安装成功后落盘，`--dry-run` 与存在失败条目不写，避免开关与实际产物脱节
- 修改：闸门接管范围改为配置驱动——`skillsInstall.gate` 支持 `{ include, exclude }` 规则（默认全量），不再使用代码内技能清单
- 新增：技能可用 `metadata.gate: false` 退出接管；`skills status` 展示接管规则，首次开启提示接管数量与 `--embed` 回退
- 新增：`toolkit scope guard` 支持按状态文件登记的外部来源解析技能正文
- 修复：`metadata.gate` 非法取值告警一次并按未声明处理，不再静默忽略
