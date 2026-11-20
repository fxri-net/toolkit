---
"@fxri/toolkit": patch
---

- 修复：`toolkit scope` 等交互在中途按 Ctrl+C 后卡住、需要多次按键才能退出；取消统一以退出码 130 结束，不再在残留的 readline 状态上重开提示
- 修复：交互取消的退出码口径不一致（0 / 1 / 130 并存），`usage` / `rules` / `skills` / `scope` 统一为 130
- 新增：`toolkit scope` 交互页提供「← 返回」项与 ESC 返回（回到上层菜单），不再只能用 Ctrl+C 退层
- 修复：`toolkit skills bump` 批量递增确认取消时退出码为 0，改为 130
- 修复：取消判定的正则兜底过宽，普通错误信息含 cancel 时曾被误判为用户取消
