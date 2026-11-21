---
"@fxri/toolkit": patch
---

- 新增：`SKILL.md` 支持 `metadata.delivery`（`full` / `gated`），作为技能包默认分发形态，用户规则仍可覆盖
- 新增：`install --check` 只报告待收敛项并以退出码 1 结束；`status` 输出待收敛计数与 `pending` 数组
- 优化：`prepare` 钩子改为 `--refresh`，只刷新已存在产物、不新增技能，非 TTY / CI 只打印漂移
- 修复：判定为入口壳但来源不可解析的技能报错中止，不静默降级全文
- 修复：`--check` / `--refresh` 在终端不再进入选择与确认交互
