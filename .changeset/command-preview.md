---
"@fxri/toolkit": patch
---

- 新增：`toolkit task init`、`toolkit privacy scan --fix`、`toolkit usage setup init` 补齐 `--dry-run`，输出与真实执行同构的动作清单且不写盘
- 修改：`skill install`、`task init` 报告统一为三段式——动作前标明作用层（全局层 / 项目层 / 本机层 / 只读），逐项动作行，动作后汇总完成 / 跳过 / 失败并给出重试命令
- 修改：`skill install --dry-run` 的分发计划标明全局层 / 项目层；`usage setup init --dry-run` 复用 Hook 安装预演
- 文档：`docs/cli/skill.md`、`task.md`、`privacy.md`、`init.md`、`usage.md` 同步输出节奏与 `--dry-run` 说明
