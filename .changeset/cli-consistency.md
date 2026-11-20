---
"@fxri/toolkit": patch
---

- 文档：`docs/cli.md` 新增裸命令入口矩阵与术语表，退出码表补齐 `3` 与交互适用面
- 优化：各域 `--format` 帮助统一为「json，输出到 stdout」，scope 的 `--yes` 写明跳过写前确认
- 优化：规范一致性检查新增入口矩阵、术语表与退出码断言，`cli-golden` 补裸命令矩阵快照
