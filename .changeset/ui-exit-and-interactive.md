---
"@fxri/toolkit": patch
---

- 修改：`toolkit setup` 勾选「安装 AI 技能」「配置全局规则」后进入各自的交互选择，上次结果只作默认勾选、须确认才执行；`--yes` 仍按默认值直接执行
- 修复：`toolkit scope` 首步选配置层补「退出」项，不再只能靠 Ctrl+C 退出
- 修复：`toolkit rule compose` / `rule sync`、`toolkit upgrade`、`toolkit usage setup init`、`toolkit task add` 的首步与原生提示补齐「退出」与 ESC 取消；ESC 一律按 `0` 结束，`130` 只保留给 Ctrl+C
- 优化：交互基座统一多选操作提示与取消文案，确认问句按动作区分（卸载 / 移除不再问「继续写入」）
- 修复：`skill install` 目标选择改为末位「← 返回」，安装 / 卸载 / 批量递增的取消一律按 `0` 结束，不再混用 `130`
- 修复：`usage setup init` 的选择步骤补「← 返回」，`usage setup uninstall` 两问可退回上一问，`usage config upload setup` 三步可退回上一步
