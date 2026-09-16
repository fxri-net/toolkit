---
"@fxri/toolkit": patch
---

修复：修复 changelog 与 tasks 两条静默误执行路径

- `toolkit changelog version --help` / `toolkit changelog format --help`：`--help` 原本被选项透传语义当作操作数丢弃，命令照跑——`version` 会真发版、`format` 会真改写 CHANGELOG；现改为打印 changelog 本域帮助并正常退出。`changelog --help` 与 `changelog add --help` 等不受影响，仍交由 changesets 输出其帮助
- `toolkit tasks <未知子命令>`：原本静默回落为「任务总览」且 exit 0 无任何提示，现报 `⚠️ 非法子命令「x」，仅支持 archive / check / normalize / stats（留空查看任务总览）` 并 exit 1
