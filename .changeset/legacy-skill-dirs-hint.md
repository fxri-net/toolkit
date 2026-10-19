---
"@fxri/toolkit": patch
---

- 新增：`skills status` 识别 Codex / Pi 的历史落点残留（`~/.codex/skills`、`~/.pi/agent/skills`），标注为「历史落点」并在报告末尾单列提示清理，JSON 输出新增 `legacyTargets` 字段
