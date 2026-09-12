---
"@fxri/toolkit": minor
---

新增 `toolkit skills` 命令域：技能随包分发、与 CLI 同源同版本，升级只需 `pnpm add -g @fxri/toolkit`，告别「CLI 走 npm、技能走 GitHub」两条供应链的版本漂移。

- `toolkit skills install [--copy] [--dir <path>] [--dry-run] [--force]`：取自包内 `skills/` 唯一真源，默认软链（升级自动跟随）；链接创建失败自动降级为副本并打印 ⚠️。目标三层：主目标 `~/.agents/skills/`（多家 agent 共读）→ 内置表内已安装的各 agent 全局技能目录 → `--dir` 兜底表外 agent
- `toolkit skills status [--format json]`：报告链接与副本现场——软链正常 / 悬空 / 指向别处 / 副本已同步 / 副本已漂移 / 缺失 / 同名冲突
- `toolkit skills remove [--dry-run]`：只清理本包状态文件登记的产物，绝不误删用户自装技能；卸载 CLI 前先跑它可避免留下悬空链接
- `toolkit skills path [--format json]`：输出包根路径，便于委托上游安装器覆盖表外 agent
- 新增配置 `skills.autoLink`（默认 `true`）：每次运行 CLI 时自动补链并修复指向错误的链接（CI 环境跳过、失败静默，可用 `.toolkitrc.json` 关闭）
- 新增配置 `skills.autoLinkReplaceForeign`（默认 `true`）：自愈遇到同名实体目录 / 普通文件时先清理再重建为软链；设为 `false` 则一律不动，交由 `toolkit skills install --force` 显式处置
- 升级提示与文档口径统一为一条命令：升级后开新会话即可加载最新技能
