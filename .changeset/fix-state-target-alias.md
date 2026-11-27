---
"@fxri/toolkit": patch
---

- 修复：项目态技能目标位于软链路径（如 macOS `/tmp` → `/private/tmp`）下被误判越界而整条丢弃，版本检测与状态读取不再漏计
