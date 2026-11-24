---
"@fxri/toolkit": patch
---

- 重大：移除 `scope wizard` / `usage setup wizard` / `skill plan` 三个入口，不保留别名；替代写法分别为裸 `toolkit scope`、裸 `toolkit usage setup`、`toolkit skill install --dry-run`
- 修改：裸 `toolkit scope` / `toolkit usage setup` 直接进交互；非 TTY 需要强制交互时统一用 `--interactive`（无终端按无交互退出码结束）
- 修改：`command-registry` 同步入口登记与 v1 `usage wizard` 的迁移目标；`src/exit-codes.ts` 场景口径改指 `--interactive`
- 文档：入口矩阵、作用域 / 使用情况 / 技能分发 / 初始化页与退出码场景同步
