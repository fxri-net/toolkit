---
"@fxri/toolkit": patch
---

- 新增：新增 `skillsDelivery` 配置段与 `toolkit skills plan`，技能分发形态改为单一真源推导（全文 / 入口壳 / 不安装），支持 `off` 不安装与残留清理
- 修改：`toolkit skills gate on|off` 改为只写 `skillsDelivery.default`，不再覆盖已配规则；`install --dry-run` 输出分发计划
- 优化：`skillsInstall.gate` 与 `metadata.gate` 作为旧键读时兼容并提示迁移，2.0.0 起移除
