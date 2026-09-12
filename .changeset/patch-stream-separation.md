---
"@fxri/toolkit": patch
---

修复诊断提示污染机器可读输出：链接自愈提示与升级提示改走 stderr，stdout 保持纯 JSON。

- `toolkit tasks --format json` 等机器可读输出不再被追加提示文本，可安全 `JSON.parse` 与管道消费
- `updateCheck` 的缓存文件带 BOM 时不再误判为损坏而重复联网（与配置文件、技能状态文件同口径剥离 BOM）
