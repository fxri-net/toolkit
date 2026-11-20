---
"@fxri/toolkit": patch
---

- 新增：新增 `usage wizard` 交互菜单，状态、统计、开关、Hook、上传与导出清理直接复用对应子命令实现
- 修改：裸 `usage` 非 TTY 改为输出 info 摘要与子命令提示并退出 0，不再以退出码 2 结束
- 修改：`enable` / `disable` / `origins` / `scope` / `capture` / `storage` 支持 `--format json`，`origins` 与 `storage` 文本输出只打印本段
- 修改：`hooks install` / `hooks remove` / `uninstall` 写前统一预览确认，非 TTY 须显式 `--yes`
