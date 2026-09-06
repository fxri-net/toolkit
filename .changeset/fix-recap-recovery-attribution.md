---
"@fxri/toolkit": patch
---

修复「未提交任务文件无法恢复会话」的过度归因：恢复读磁盘 `.tasks/` 文件而非 git，同机同目录下未提交也能恢复；git 提交仅保障跨环境（换机/工作区清理）持久性。fxri-session-recap 失败模式表与 docs/guide 反模式句同步修正并补边界说明。
