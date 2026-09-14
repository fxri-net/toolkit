---
"@fxri/toolkit": patch
---

文档：规则层锚点由数字版本号改为更新时刻，提交信息规则拆为独立页

- 锚点由 `> 规范版本 x.y` / `> 规则版本 x.y` 改为 `> 规范更新时间 YYYY-MM-DD HH:mm`（`SPEC.md`）与 `> 规则更新时间 YYYY-MM-DD HH:mm`（`docs/ai-rules.md`、`docs/commit-rules.md`），仍位于规则全文可复制块内部首行；复制过旧规则的快照首行格式不同即说明需重新复制对应页面
- 更新纪律写全：任何内容变更（含错别字、标点、链接）以变更时刻更新所属文件锚点，未变更的文件不得刷新，同一批改动取同一时间，只随内容变更递增、不随发版例行抬高
- 提交信息规则从 AI 全局规则中拆出为独立页 `docs/commit-rules.md`，与 AI 全局规则相互独立、可只取其一（该规则替换既有提交惯例，与 Conventional Commits、commitlint 直接互斥，故单独成页）
