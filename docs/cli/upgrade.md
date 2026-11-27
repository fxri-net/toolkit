---
title: 升级迁移（upgrade）
---

# 升级迁移（upgrade）

`toolkit upgrade` 把 v1 工程迁到当前版本：配置段名与旧闸门键、`package.json` 的 prepare 钩子与旧命令名、
技能旧名登记、规范载体结构、历史 `.bak`。迁移只改形态，不改业务行为；迁移后重跑 `toolkit task init` 应零改动。

## 常用命令

```bash
toolkit upgrade --dry-run         # 只看计划，不写盘
toolkit upgrade --diff            # 计划 + 行级差异，不写盘
toolkit upgrade --check           # 只读检查；有可自动处理的残留时退出 1
toolkit upgrade                   # TTY 下逐项确认后执行
toolkit upgrade --yes             # 非交互执行（CI / 脚本）
toolkit upgrade --restore latest  # 从最近一次备份恢复
toolkit upgrade --prune-backups   # 清理迁移备份（--dry-run 预览、--keep 1 保留最近一次）
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
| `--layers <layers>` | `global` / `project` / `local`，逗号分隔，缺省三层全迁（含全局面） |
| `--only <ids>` / `--skip <ids>` | 按迁移项 id 只做 / 跳过 |
| `--prune-legacy` | 删除已被新段覆盖或写错层的旧段（本就不生效）；`--dry-run` / `--diff` 可预览 |
| `--allow-old-dependency` | 项目依赖低于当前 major 时仍继续（默认拒绝） |
| `--restore [path]` | 从备份恢复；省略或 `latest` 取最近一次 |
| `--overwrite` | 恢复时覆盖迁移之后被修改过的文件 |
| `--prune-backups` | 清理迁移备份目录与本包已知的 `.bak`；与 `--restore` 互斥，`--dry-run` 预览；缺省只清当前项目（`~` 下只清全局面） |
| `--keep <n>` | 配合 `--prune-backups`：每个备份根保留最近 n 个目录（缺省 0，全部清理） |
| `--no-trash` | 永久删除迁移备份与旧产物（默认进项目内回收站） |

## 行为

- 顺序固定：配置 → 工程文件 → 技能 → 规范载体 → 备份收编；规范载体目录取自迁移后的配置。
- 缺省迁移三层（含全局面）：在项目内执行会一并迁移 `~` 下的全局配置，只迁当前项目用 `--layers project`。
- 配置以「段」为单位整体迁移：段内有未知子键时整段保留并列入人工项，不做半截搬移。
- 新旧段并存且内容不同、或段写错层时在检测阶段即判人工项（`--check` 不计入残留），提示含文件路径、两段内容与可执行命令；
  确认保留新段后加 `--prune-legacy` 删除旧段 / 误放段，只删本就不生效的内容。
- 只支持「上一个 major → 当前 major」；跨多个 major 时命令会给出逐级升级步骤，不硬迁。
- 备份集中在 `.toolkit/backup/<时间>/`（全局面为 `~/.toolkit/backup/<时间>/`），清单记录文件哈希；恢复时默认不覆盖迁移后被用户改过的文件。
- `--prune-backups` 只删已知备份根下含 `manifest.json` 的直接子目录与固定清单内的 `.bak`（配置文件、技能状态旁），
  外来目录跳过并回报；`--keep` 只作用于备份目录，`.bak` 随清理一并删除。
- `--restore` 只接受清单里位于项目根或家目录内的路径；越界路径跳过并在 stderr 告警，不删除或覆盖允许根外的文件。
- 迁移备份与旧产物默认进项目内回收站；`--no-trash` 才永久删除。
- `--prune-backups` 的缺省范围与迁移相反：项目内只清当前项目、`~` 下只清全局面；要清全局面需显式 `--layers global`。
- 手动项（规则快照正文、CI 文件里的旧命令名、无法确认归属的目录）只告警，不阻断 CI。
- 交互多选按「迁移项 id｜动作」展示，超宽截断为单行；答案行只显示 id；按 ESC 取消（提示文案已标注）、以 `0` 结束，Ctrl+C 才按取消退出码 `130`，均不写任何文件。
- `--diff` 的行级差异只覆盖会被文本改写的配置文件与 `package.json`；技能清理、载体升级等非文本迁移仍以计划清单呈现。
- 家目录不作为项目根：在 `~` 执行时自动跳过 project / local 层并向 stderr 提示，只迁移全局层；版本门禁仅在本计划含项目层项时生效。

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
| `pruneBackups` | 清理结果：`removed / skipped / kept / dryRun` |

## 退出码

| 码 | 含义 |
| --- | --- |
| `0` | 成功、已是当前形态，或无 v1 资产 |
| `1` | 存在可自动处理的残留、应用失败，或参数组合非法（如 `--prune-backups` 与 `--restore` 同用） |
| `2` | 用法错误，或非 TTY 缺少 `--yes` |
| `130` | 交互中取消 |

## 边界与注意

- ⚠️ 迁移会改写 `package.json` 与配置文件；执行前先 `--dry-run`，必要时用 `--restore` 回滚。
- ⚠️ 建议在项目根执行；从子目录执行时，恢复允许根为「当前目录 + 项目根 + 家目录」，祖先目录的配置与 `.bak` 仍可恢复 / 收编。
- ⚠️ `--restore` 只恢复配置、工程文件与状态文件；迁移时删除的技能产物已进回收站，需用 `toolkit trash restore` 找回。
- ⚠️ 规则快照保存在各 Agent 的全局规则入口，`upgrade` 无法安全改写，需按提示重新 `toolkit rule compose --copy --no-cache` 后粘贴（`--no-cache` 避免这次快照改写默认组合）。
- ⚠️ 无法确认归属的技能目录不会删除，只列入人工项，避免误删上游安装器产物。

## 相关页面

- [v1 → v2 升级](../upgrade-v2) · [CLI 参考](../cli) · [退出码](./exit-codes)
