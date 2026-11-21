---
"@fxri/toolkit": patch
---

- 新增：新增 `skillsDelivery` 配置段与 `toolkit skills plan`，技能分发形态改为单一真源推导（全文 / 入口壳 / 不安装），支持 `off` 不安装与残留清理
- 修改：`toolkit skills gate on|off` 改为只写 `skillsDelivery.default`，不再覆盖已配规则；`install --dry-run` 输出分发计划
- 优化：`skillsInstall.gate` 与 `metadata.gate` 作为旧键读时兼容并提示迁移，2.0.0 起移除
- 修复：`install --gate` / `--embed` 改写 `skillsDelivery.default`，不再写入旧键后又被忽略
- 清理：移除 `gate` 的无效 `--all` 占位（与 `gate on` 完全等价）
- 修复：`--refresh` 忽略写选项时向 stderr 告警；`status` JSON 的 `gate` 字段标注为旧键兼容
- 修改：`metadata.gate: false` 提到最高优先级，命令行 `--gate` 不再覆盖技能的单点退出
- 修复：`--gate` 首次开启提示改以 `skillsDelivery.default` 为基线，重复执行不再误报
- 文档：CLI help 与 README / FAQ / 快速开始对齐分发形态新模型
