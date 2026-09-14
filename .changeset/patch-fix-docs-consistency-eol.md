---
"@fxri/toolkit": patch
---

修复：修复 Windows 检出环境下文档一致性测试的换行误判

- 「更新日志镜像」用例比较前统一把 CRLF 归一为 LF，Windows 检出（`core.autocrlf`）不再把换行差异误报成「漏跑同步脚本或手改镜像页」
- 内容差异（漏跑 `pnpm sync:changelog-doc` 或手改镜像页）仍照常拦截
