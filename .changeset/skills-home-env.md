---
"@fxri/toolkit": patch
---

- 修复：各 agent 全局技能目录跟随 home 类环境变量（`XDG_CONFIG_HOME`、`CLAUDE_CONFIG_DIR`、`CODEX_HOME`、`VIBE_HOME`、`HERMES_HOME`、`AUTOHAND_HOME`、`GROK_HOME`），改写基准目录后不再分发到错误位置
- 修复：`SARVAM_HOME`、`APPDATA`、`FLATPAK_XDG_CONFIG_HOME` 参与已安装探测，自定义目录的 agent 不再误判为未安装
- 文档：补充全局技能目录的环境变量覆盖说明
