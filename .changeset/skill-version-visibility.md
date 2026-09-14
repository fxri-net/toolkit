---
"@fxri/toolkit": patch
---

新增：技能版本可视化，旧会话可自校验技能内容是否过期

- `toolkit skills status` 常驻打印包内各技能真源版本，`--format json` 新增 `skillVersions` 字段与逐项 `version`，作为磁盘基准值；`toolkit skills install` 报告同样逐项带版本
- 每个 SKILL.md 正文首部显式声明版本（与 frontmatter `metadata.version` 一致），版本随技能内容进会话上下文；被问版本时报上下文声明值，与 `skills status` 打印的磁盘值对照，不一致即说明会话上下文已过期，开新会话即可
- 措辞澄清：技能随包同源分发（与 CLI 同一发布批次），技能内容版本独立编号
