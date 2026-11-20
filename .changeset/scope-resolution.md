---
"@fxri/toolkit": minor
---

- 新增：`toolkit scope status` / `toolkit scope list`，按项目 / 目录解析 `activation` 配置并给出判定与来源
- 新增：`activation` 配置段（模式、白/黑名单、marker、git 远端），默认 `all` 保持全域生效
- 优化：判定按真实路径与统一大小写口径比较，未配置 git / marker 时不启动子进程
