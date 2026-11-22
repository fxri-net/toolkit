---
"@fxri/toolkit": patch
---

- 修复：`skill install` / `skill uninstall` / `skill bump --all` 交互中按 Ctrl+C 时按取消处理（退出码 130、不写文件），不再报「失败」并以 1 退出
