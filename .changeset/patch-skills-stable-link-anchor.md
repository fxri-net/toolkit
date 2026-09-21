---
"@fxri/toolkit": patch
---

修复：技能软链锚点改用 pnpm 稳定入口，CLI 升级后链接不再悬空

- 此前软链目标写死为包实体路径（pnpm 全局布局下含版本段 `.pnpm/@fxri+toolkit@x.y.z/...`），CLI 升级时旧版本段目录被 pnpm 剪除即断链；从升级完成到下次运行任意 `toolkit` 命令之间，新会话读不到技能
- 改为锚在 pnpm 稳定入口 `<node_modules>/@fxri/toolkit`（升级时由 pnpm 重写该入口），链接跨版本存活，无需任何修复命令
- 存量旧锚点链接首次运行 `toolkit` 命令即自动迁移到稳定入口；`skills status` 与 `skills remove` 同时接受新旧两种指向，避免误报或漏摘；同步 `docs/ai-rules.md`、`docs/handbook.md`、`docs/guide.md`、`docs/cli.md`、`docs/faq.md`、`skills/README.md` 的表述
