---
"@fxri/toolkit": minor
---

- 新增：`toolkit skills install --gate` 开启内容闸门，首批 core 技能（`fxri-plan-to-task` / `fxri-session-recap` / `fxri-plan-review`）改写为入口壳，正文由 `toolkit scope guard <技能名>` 按作用域下发
- 新增：`toolkit scope guard <技能名>` 激活时输出包内正文、参考文件目录走 stderr；未激活退出码 `3` 且 stdout 为空；技能名非法或不存在退出码 `1`
- 新增：`toolkit skills install --embed` 回退全文，`skills status` 显示闸门开关与入口壳形态，开关写入 `skillsInstall.gate`
- 优化：CLI 入口拆分为 guard 快速路径与常规命令分包，guard 启动不再加载完整命令集
- 修复：闸门改按技能身份判定（不再额外限定内置源）；`toolkit scope` 向导新增内容闸门入口；`--gate` 下 `--copy` 明确告警；`skills status` 按实际产物显示闸门状态；guard 快速路径补 Node 下限检查
