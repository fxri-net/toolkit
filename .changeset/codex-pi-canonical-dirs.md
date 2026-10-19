---
"@fxri/toolkit": patch
---

- 修复：Codex 与 Pi 的全局技能目录对齐上游 canonical（`~/.agents/skills`），不再分别写到 `~/.codex/skills`、`~/.pi/agent/skills`，避免与共读面重复分发
- 修复：`CODEX_HOME` 改为仅参与安装探测，不再改写 Codex 的写入落点
- 文档：更新 canonical 共读 agent 清单与环境变量说明
