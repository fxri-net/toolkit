---
title: 回收站（trash）
---

# 回收站（trash）

`toolkit trash` 管理**项目内回收站**：用户可见删除默认先移到这里，由你决定何时恢复或彻底清理。
缓存、锁文件、临时目录与构建产物仍永久删除，不进入回收站。

## 常用命令

```bash
toolkit trash                   # 列出条目（同 list）
toolkit trash list --scope all  # 项目 + 全局
toolkit trash list --command "skill uninstall" --older-than 7
toolkit trash restore latest            # 恢复最近一次
toolkit trash restore <id> --to <目录>  # 恢复到其他目录
toolkit trash prune --keep 10           # 每个根保留最近 10 条
toolkit trash prune --older-than 30     # 清理 30 天前的条目
toolkit trash prune --all               # 清空当前作用域
toolkit trash stats                     # 条数 / 占用 / 来源分布
```

## 参数

| 参数 | 说明 |
| --- | --- |
| `--scope <scope>` | `project` / `global` / `all`；`list` / `restore` / `stats` 缺省 all，`prune` 在项目内缺省 project、`~` 下缺省 global |
| `--command <name>` | `list` 按来源命令精确过滤（如 `skill uninstall`） |
| `--older-than <days>` | `list` 只看早于指定天数的条目；`prune` 清理早于该天数的条目 |
| `--keep <n>` | `prune` 每个回收站根保留最近 n 条 |
| `--all` | `prune` 清空当前作用域；与 `--keep` / `--older-than` 三选一 |
| `--to <dir>` | `restore` 替换目标根，保留条目内相对结构 |
| `--overwrite` | `restore` 目标已存在时覆盖；覆盖前先把现有目标再收进回收站 |
| `--dry-run` | 只预览，不移动 / 不删除 |
| `--yes` | `prune` 非交互环境确认执行 |
| `--format <format>` | `json`，输出八键信封到 stdout |

## 行为

- 用户可见删除默认入回收站：`skill uninstall`、`skill install` 替换 / 改名清理的旧产物、`skill install --prune`、
  `upgrade --prune-backups`、`upgrade --restore`；加 `--no-trash` 才永久删除。
- 条目存放在 `<项目根>/.toolkit/trash/<id>/` 与 `~/.toolkit/trash/<id>/`，`manifest.json` 记录来源命令、原路径与类型；
  `.toolkit/` 已在项目忽略范围内，回收站不随 git 提交。
- 符号链接 / junction 只摘链，不搬目标内容；恢复时只恢复链接本身，链接目标不存在按悬空链接跳过并告警。
- 恢复前校验目标落在原根或 `--to` 根内；越界路径跳过并告警。
- 恢复逐项继续：单项失败记入 `failed` 并在 stderr 报告，条目保留并把 `status` 标记为 `partial`；
  修复现场后可重试，目标已存在时用 `--overwrite`。
- **不自动清理**：是否清空、保留多久由 `trash prune` 决定；`list` / `stats` 只读，退出码恒 `0`。
- 回收站不是备份：只防误删，不防磁盘损坏或外部清理工具。

## JSON 契约

`data` 字段：

| 命令 | 字段 |
| --- | --- |
| `list` | `scope` / `command` / `olderThan` / `entries`（id / createdAt / command / files / bytes / status） |
| `restore` | `id` / `restored` / `skipped` / `failed`（path / message） / `removedEntry` |
| `prune` | `removed` / `kept` / `dryRun` |
| `stats` | `entries` / `bytes` / `oldest` / `newest` / `byCommand` |

## 退出码

复用 [退出码与解析错误](./exit-codes)：`0` 成功、`1` 参数或操作失败、`2` 非交互需要确认、`130` 取消。

## 相关页面

- [技能分发](./skill) · [升级迁移](./upgrade) · [CLI 参考](../cli)
