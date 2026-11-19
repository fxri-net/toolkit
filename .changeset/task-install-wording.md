---
"@fxri/toolkit": patch
---

- 优化：全仓安装写法统一为 `add` 动词——`pnpm add -g` / `npm add -g` / `bun add -g` 通用，yarn 1.x 为 `yarn global add`、2+ 改用 `yarn dlx`；README、常见问题、操作手册、快速开始共 5 处 `pnpm i -g` 一并改写
- 新增：快速开始安装节按包管理器列出四行可直接复制的命令，并说明升级用同一条安装命令
- 修改：全局规则的「环境与版本」段补半句多包管理器写法；该模块体量棘轮由 165 调到 220（为容纳四种管理器说明）
