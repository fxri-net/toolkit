---
"@fxri/toolkit": patch
---

- 修复：项目级技能目录候选移除 `.cursor/skills`、`.trae-cn/skills`（二者为对应 agent 的全局目录，收录会把入口壳写到错误位置）
- 新增：项目级技能目录候选补充 15 个上游专用配置目录（`.augment/skills`、`.codebuddy/skills`、`.continue/skills`、`.crush/skills`、`.devin/skills`、`.goose/skills`、`.grok/skills`、`.hermes/skills`、`.iflow/skills`、`.junie/skills`、`.kiro/skills`、`.openhands/skills`、`.qwen/skills`、`.roo/skills`、`.windsurf/skills`），已在用的项目级目录都会收到入口壳
- 文档：同步项目级技能目录与入口壳落点的枚举，写明拒绝收录的裸 `skills` 与 `data/skills` 理由
