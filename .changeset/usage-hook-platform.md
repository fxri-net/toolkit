---
"@fxri/toolkit": patch
---

- 修复：Hook 命令改为按平台生成——Windows 经 `powershell -NoProfile -Command "& '…'"` 包装，macOS / Linux 用单引号拼接，解决 PowerShell 下「两个引号串并列」被当表达式导致 Hook 全部失败的问题
- 修复：重跑 `usage hooks install` 会把存量旧形态命令替换为新形态；`hooks status` 与 `doctor` 新增「命令形态过期」提示
- 文档：同步 Agent 接入与 usage 命令页的平台说明
