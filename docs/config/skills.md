---
title: skills 相关（技能分发）
---

# skills 相关：技能分发与安装偏好

> 软链自愈、全局与项目面安装偏好；分发命令与现场体检见 [skills 命令](../cli/skills)。

## skills：技能分发

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `autoLink` | boolean | `true` | 链接自愈开关：每次执行 `toolkit` 命令时，对状态文件 `~/.agents/.toolkit-skills.json` 记载的**软链**做补链与修链（悬空、指向其他版本即内容与真源不一致的链接重建；内容一致的异地软链不视为错误、不重指） |
| `autoLinkReplaceForeign` | boolean | `true` | 自愈遇到同名**实体目录 / 普通文件**时是否先清理再重建为软链：`true` 清理重建，`false` 一律不动（状态记录保留，需处置时用 `toolkit skills install --force`）；只影响自愈，不影响显式 `install` |

**作用边界**（护栏）：

- **仅作用于全局面软链**：`autoLink` / `autoLinkReplaceForeign` 只做全局技能目录的软链自愈；项目面（仓库内唯一真源副本 + 各候选目录薄壳）不受这两个开关影响，其刷新由 `toolkit init` 写入的 `package.json` `prepare` 钩子（`toolkit skills install --scope project`）承担，产物归属账另存 `<仓库根>/.toolkit/state.json`（非配置文件、随 git 分发）
- **只补链与修链**：不含首次安装（未安装过、无状态文件时不动作），不含副本刷新（副本形式的技能不自动升级，需重跑 `toolkit skills install`）
- **只对状态文件记载的链接生效**：现场被替换成实体目录 / 普通文件时，默认清理后重建为软链；`autoLinkReplaceForeign: false` 改为一律不动——该开关**只豁免实体产物**，悬空与指向其他版本（内容与真源不一致）的链接仍照常修复
- **`CI` 环境自动跳过**：`CI` 为非空且不等于 `0` / `false` / `off` / `no` 时不执行，避免污染流水线；与升级提示共用同一判定
- **任何失败静默**：修链失败不影响命令本身，条目留在状态文件里下次再试
- 修复发生时向 **stderr** 输出一行 `已自动修复 N 个技能链接`（stdout 留给机器可读输出）；不需要自愈可把 `autoLink` 设为 `false` 关闭

```json
{
  "skills": { "autoLink": true, "autoLinkReplaceForeign": false }
}
```

## skillsInstall：全局技能安装偏好

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `selection` | object | 无 | 来源 → 技能名数组；内置源键为 `toolkit`。`toolkit skills install` 成功后写回，重装 / `status` 按此回显选择集；未保存过时按 `mode` 默认（`skills` 装 `core`、`package` 零装） |
| `targets` | string[] | 无 | 长期目标选择：`canonical`（主目标）与各 agent 的 `name`（如 `claude-code`、`cursor`）。安装 / 交互选择后写回；未保存过时首次写全部可用目标；`--no-save-agents` 不写回；`--dir` 自定义目录不进入本字段 |
| `sources` | object | 无 | 永久外部来源登记：本地来源写 `{ "root": "<绝对路径>" }`，远程来源写 `{ "url": "<Git 地址>", "ref": "<可选 ref>" }`。由 `toolkit skills install --from <path|url> --save [name]` 写入；启动时自动解析并纳入安装 / 状态，远程来源使用用户级缓存 `~/.toolkit/cache/skill-sources/`，来源失效时告警跳过 |
| `mode` | string | `skills` | 安装模式：`skills`（core 必装）/ `package`（纯包管理器，全部可选、允许零选）；由 `toolkit skills install --mode` 写入，非法值告警后按 `skills` 处理 |

```json
{
  "skillsInstall": {
    "selection": { "toolkit": ["fxri-plan-to-task", "fxri-session-recap", "fxri-plan-review", "fxri-text-encoding"] },
    "targets": ["canonical", "claude-code"],
    "sources": {
      "play": { "root": "D:/skills/playbook" },
      "remote": { "url": "https://github.com/fxri-net/playbook", "ref": "vX.Y.Z" }
    }
  }
}
```

⚠️ **仅认全局层**：`skillsInstall` 只从全局层 `~/.toolkitrc.json` 读取；写在项目层 `.toolkitrc.json` 或本地层 `.toolkitrc.local.json` 时向 **stderr** 告警并忽略（不静默生效）。写入时只合并 `skillsInstall` 段、保留同文件其他配置段，写前备份 `.bak`、写后原子落盘并失效配置缓存。

## projectSkills：项目面技能安装偏好

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `selection` | string[] | 无 | 项目面选择集（技能名数组），由 `toolkit skills install --scope project` 成功后写回；未保存过时按 `mode` 默认（`skills` 装 `core`、`package` 零装） |
| `targets` | string[] | 无 | 长期薄壳目录选择：仓库根相对的候选目录（如 `.trae/skills`）。安装 / 交互选择后写回；未保存过时首次写全部已存在候选目录；`prepare` 等非交互场景按此刷新，不新增未选择目录 |
| `mode` | string | `skills` | 项目面安装模式：`skills` / `package`；由 `toolkit skills install --scope project --mode` 写入，零选择时不生成技能薄壳与 `.toolkit/state.json` |

```json
{
  "projectSkills": {
    "selection": ["fxri-plan-to-task", "fxri-session-recap", "fxri-plan-review"],
    "targets": [".trae/skills", ".claude/skills"]
  }
}
```

⚠️ **仅认项目层**：`projectSkills` 只从项目层 `.toolkitrc.json` 读取；写在全局层或本地层时告警并忽略。项目面与全局面的选择集相互独立，`--scope all` 时两面共用本次交互结果。

## 分发目标与环境变量

各 agent 的全局技能目录以 `~` 为基准，可被 home 类环境变量改写：

| 变量 | 作用 |
| --- | --- |
| `XDG_CONFIG_HOME` | 改写 amp / devin / goose / opencode / replit / universal 的基准 |
| `AUTOHAND_HOME` / `CLAUDE_CONFIG_DIR` / `GROK_HOME` / `HERMES_HOME` / `VIBE_HOME` | 各自命中时生效；空值或非绝对路径回落默认 |
| `SARVAM_HOME` / `CODEX_HOME` / `APPDATA` / `FLATPAK_XDG_CONFIG_HOME` | 仅参与探测，不改变写入落点 |

Codex / Pi 的全局目录就是主目标（`~/.agents/skills/`），`CODEX_HOME` 只用于判断是否安装，不改变写入落点。

## 相关页面

- 参考：[配置参考总览](../config) · [skills 命令](../cli/skills) · [完整攻略 · AI 技能包](../guide#ai-技能包-skills)
