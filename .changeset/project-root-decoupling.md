---
"@fxri/toolkit": patch
---

- 修改：项目根判定改为 git 根 / 项目配置 / 项目产物，`.tasks` 与 `package.json` 不再参与；任务区外置不再影响项目根
- 修改：`skill mount` 扫描不再把 `.tasks`-only 目录当作项目；非 git Node 项目仍按 `package.json + lock` 发现
- 修改：项目层更新提示写入不再要求 git 根，按项目配置定位
