---
title: 升级迁移（upgrade）
---

# 升级迁移（upgrade）

`toolkit upgrade` 把 v1 工程迁到当前版本：配置段名与旧闸门键、`package.json` 的 prepare 钩子与旧命令名、
技能旧名登记、规范载体结构、历史 `.bak`。迁移只改形态，不改业务行为；迁移后重跑 `toolkit init` 应零改动。

## 常用命令

```bash
toolkit upgrade --dry-run         # 只看计划，不写盘
toolkit upgrade --diff            # 计划 + 行级差异，不写盘
toolkit upgrade --check           # 只读检查；有可自动处理的残留时退出 1
toolkit upgrade                   # TTY 下逐项确认后执行
toolkit upgrade --yes             # 非交互执行（CI / 脚本）
toolkit upgrade --restore latest  # 从最近一次备份恢复
```

## 参数

| 参数 | 说明 |
| --- | --- |
| `--cwd <path>` | 项目根目录，缺省当前工作目录 |
| `--check` | 只读检查；仅「可自动处理却未处理」的残留计入退出码 |
| `--dry-run` | 输出迁移计划，不写盘 |
| `--diff` | 输出迁移计划与行级差异，不写盘 |
| `--yes` | 非交互执行，跳过确认 |
| `--format json` | 输出八键信封到 stdout |
| `--layers <layers>` | `global` / `project` / `local`，逗号分隔，缺省全部 |
| `--only <ids>` / `--skip <ids>` | 按迁移项 id 只做 / 跳过 |
| `--allow-old-dependency` | 项目依赖低于当前 major 时仍继续（默认拒绝） |
| `--restore [path]` | 从备份恢复；省略或 `latest` 取最近一次 |
| `--overwrite` | 恢复时覆盖迁移之后被修改过的文件 |

## 行为

- 顺序固定：配置 → 工程文件 → 技能 → 规范载体 → 备份收编；规范载体目录取自迁移后的配置。
- 配置以「段」为单位整体迁移：段内有未知子键时整段保留并列入人工项，不做半截搬移。
- 只支持「上一个 major → 当前 major」；跨多个 major 时命令会给出逐级升级步骤，不硬迁。
- 备份集中在 `.toolkit/backup/<时间>/`（全局面为 `~/.toolkit/backup/<时间>/`），清单记录文件哈希；恢复时默认不覆盖迁移后被用户改过的文件。
- 手动项（规则快照正文、CI 文件里的旧命令名、无法确认归属的目录）只告警，不阻断 CI。
- `--diff` 的行级差异只覆盖会被文本改写的配置文件与 `package.json`；技能清理、载体升级等非文本迁移仍以计划清单呈现。

## JSON 契约

`data` 字段：

| 字段 | 内容 |
| --- | --- |
| `plan[]` | 迁移项：`id / surface / action / risk / files / status / reason` |
| `diffs[]` | `--diff` 时的行级差异：`file / patch`（unified diff 文本） |
| `applied` / `failed` | 已执行 / 失败的迁移项 id |
| `backups` | 本次备份目录 |
| `residue` | 复检后仍可自动处理的项 |
| `restore` | 恢复结果：`restored / removed / skipped / dir` |

## 退出码

| 码 | 含义 |
| --- | --- |
| `0` | 成功、已是当前形态，或无 v1 资产 |
| `1` | 存在可自动处理的残留，或应用失败 |
| `2` | 用法错误，或非 TTY 缺少 `--yes` |
| `130` | 交互中取消 |

## 边界与注意

- ⚠️ 迁移会改写 `package.json` 与配置文件；执行前先 `--dry-run`，必要时用 `--restore` 回滚。
- ⚠️ 规则快照保存在各 Agent 的全局规则入口，`upgrade` 无法安全改写，需按提示重新 `toolkit rule compose --copy` 后粘贴。
- ⚠️ 无法确认归属的技能目录不会删除，只列入人工项，避免误删上游安装器产物。

## 相关页面

- [v1 → v2 升级](../upgrade-v2) · [CLI 参考](../cli) · [退出码](./exit-codes)
