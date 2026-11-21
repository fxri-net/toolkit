---
"@fxri/toolkit": major
---

- 修改：顶层命令统一为单数对象名：`tasks → task`、`skills → skill`、`rules → rule`、`conventions → convention`
- 修改：发版域由 `changelog` 改名为 `release`，子命令沿用 `status` / `bump` / `changelog` / `mirror` / `publish` / `audit` / `changeset`
- 优化：旧顶层名在参数解析前重写到新命令并提示弃用，别名保留至 2.1.0；help 只呈现新命令
- 优化：命令模块文件与运行期生成的命令文案（`init` prepare 钩子、各域提示、门禁脚本）同步新名
