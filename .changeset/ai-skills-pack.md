---
"@fxri/toolkit": minor
---

新增：新增零依赖 AI 技能包 skills/（fxri-plan-to-task、fxri-release-changelog）

- 按 Agent Skills 开放标准沉淀方案落盘与发版 CHANGELOG 两套工作流，纯 Markdown 规范，不绑定语言与工具
- README 与 SPEC.md 增加技能包交叉引用；skills/README.md 新增 `npx skills add fxri-net/toolkit` 安装方式
- npm 包 `files` 加入 `skills`，安装 @fxri/toolkit 即随包获得技能目录
