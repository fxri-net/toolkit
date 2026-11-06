# 配置参考

> 目标读者：需要按项目定制行为的用户。字段枚举与 `src/config.ts` 解析代码同源。

## 解决什么问题

不同项目对脱敏、告警、语言、导入列映射的需求不同；`.toolkitrc.json` 让这些定制随仓库走、团队共享。个人偏好（关升级提示、个人脱敏规则等）不必污染团队配置，按作用域分两处落：跨项目的放全局文件 `~/.toolkitrc.json`，仅本项目的放本地文件 `.toolkitrc.local.json`（默认不入库）。

## 配置文件三层

| 层 | 文件 | 定位方式 | 用途 |
| --- | --- | --- | --- |
| 全局层 | `~/.toolkitrc.json` | 固定路径 | 个人跨项目偏好，不随 git 分发，换机器需手动迁移 |
| 项目层 | `.toolkitrc.json` | 自 `process.cwd()` 向上逐级查找最近一份（**止于 home**） | 团队共享配置，随仓库走 |
| 本地层 | `.toolkitrc.local.json` | 自 `process.cwd()` 向上逐级查找最近一份（**止于 home**） | 个人按项目、仅本人可见，默认被 git 忽略 |

- **各自独立查找**：项目层与本地层分别向上查找最近一份，不要求命中同一目录——monorepo 子目录只放本地文件时不会吞掉上层团队配置
- **项目层止于 home**：向上查到 `~` 即停，避免把全局层 `~/.toolkitrc.json` 误当项目层读取（同一文件被两层重复读取会让全局配置顶掉团队配置）；cwd 不在 home 之下时该边界不触发，退化为查到盘根为止
- **本地层止于 home**：向上查到 `~` 即停，避免把 `~/.toolkitrc.local.json` 误当项目下的本地层命中（全局层读的是 `~/.toolkitrc.json`，两者并非一对）；⚠️ cwd 不在 home 之下时（如 Windows `D:\…`、home 在 `C:\Users\…`）该边界不触发，退化为查到盘根为止。`toolkit config status` 检测到 home 下存在 `.toolkitrc.local.json` 时会给出 `info` 级提示，指明该文件不参与查找
- **命中路径可能位于仓库根之上**：向上查找不设仓库根边界，父目录散落的本地配置文件也会被命中；`toolkit config status` 可作排查入口——绝对路径仅在 `--format json` 输出可见，文本模式折叠 home 前缀为 `~/…`
- **版本下限**：读取 `.toolkitrc.local.json` 需 toolkit ≥ 1.11.2；旧版本静默忽略该文件（不报错），团队版本不一时会呈「我本地生效、同事机器不生效」

## 合并语义

- **全局层 → 项目层：段级整体覆盖**——项目配置出现的段**整体覆盖**全局同名段（非字段级深合并：项目写了某段，该段内未写的子字段也不会落到全局），项目未配的段取全局
- **项目层 → 本地层：段内字段级浅合并**——本地层只覆盖显式写出的子字段，未写的子字段保留团队值

| 层间跳变 | 粒度 | 数组字段行为 |
| --- | --- | --- |
| 全局层 → 项目层 | 段级整体覆盖 | 整体替换 |
| 项目层 → 本地层 | 段内字段级浅合并 | 整体替换（非追加） |

⚠️ 合并深度**严格一层**（段 → 字段）：字段值本身是对象时整体替换、不递归，更深的嵌套子键不会被保留。

⚠️ **`redact` 等数组字段**的本地层覆盖是**整段替换、非追加**：个人想「补一条」脱敏规则，实际会顶掉团队整组规则（安全相关）——要追加规则应改项目层并与团队协商。

⚠️ 本地层**不支持删除 / 清空团队键**：字段写 `null` 与未写等价（团队值保留）；将来若需清空能力，会以独立提案引入显式哨兵。

⚠️ 任一层的**段值为非对象**（如 `"redact": "off"`、`"tasks": 123`、`"tasks": null`）时告警 + **整段按未写处理**（不覆盖 / 不顶掉其他层的同类段，安全侧优先）。

**三层取值示例**（同一份配置在全局 / 项目 / 本地各写一段，演示两种粒度）：

```json
// ~/.toolkitrc.json（全局层）
{ "updateCheck": { "enabled": false } }

// .toolkitrc.json（项目层）
{ "redact": { "enabled": true, "disable": ["手机号"], "rules": [{ "name": "内网域名", "pattern": "…" }] } }

// .toolkitrc.local.json（本地层）
{ "redact": { "enabled": false }, "tasks": { "dir": ".tasks-mine" } }
```

- `redact`：全局层未配该段，项目层的 `disable` / `rules` 生效；本地层**字段级浅合并**只把 `enabled` 改成 `false`，`disable` / `rules` 仍在（这正是本地层相对段级覆盖的价值）
- `tasks.dir`：仅本地层写 → 取本地层的 `.tasks-mine`（个人任务区，团队不受影响）
- `updateCheck.enabled`：仅全局层写 → `false`
- 若项目层也写了 `changelog` 段，则**整段覆盖**全局同名段、全局层配置的语言表整体失效——这是「全局层 → 项目层」段级覆盖的体现

## 其余规则

- 覆盖链：CLI `--flag` > 环境变量 > 本地层 > 项目层 > 全局层 > 默认值
- 某级文件存在但非法（JSON 解析失败、或顶层非对象）：跳过该级继续向上，都不合法视为无配置。**降级不静默**：命中时 stderr 告警一次（同一进程内同一「文件 + 键」只提示一次），提示按「未配置」处理
- 配置段显式写出但类型不符（非对象）同样告警后按未配置处理
- **字段级类型校验**：`tasks.dir`（须**非空**字符串）、`redact.enabled` / `updateCheck.enabled` / `check.warnings`（须布尔）类型不符时 stderr 告警并**按未写处理**（回落团队值 / 默认值）；`tasks.dir` 写空字符串同样告警并按未写处理、回落默认 `.tasks`
- 带 UTF-8 BOM 的配置文件可正常解析（Windows 下 PowerShell 写出场景）
- 未找到：全部使用默认值
- 不设强制 schema/版本字段：未知字段忽略，配置项变更随主版本记录于 CHANGELOG，读取向后兼容
- **`tasks.dir` 相对路径的解析基准为 `process.cwd()`**（非配置文件所在目录），monorepo 子目录运行时须留意

## 本地配置文件为何默认被 git 忽略

本地层属个人私有配置，默认不入库，落地三机制：

1. `toolkit init` 幂等向 `.gitignore` 追加忽略行（已被既有规则覆盖则跳过；存量项目升级后需**重跑 `toolkit init`** 补写，幂等可安全重跑）。不想改团队 `.gitignore` 者，可自行把该行写进 `.git/info/exclude`（本地排除、不进版本控制，同样被 `git check-ignore` 识别）
2. `toolkit tasks check` 检测到该文件存在但未被忽略时**软告警**（warn 级，不阻断）；已跟踪态提示 `git rm --cached`（`git check-ignore` 对已跟踪文件恒返回「未忽略」，须先移除跟踪）；非 git 仓库、或文件位于**当前仓库工作树之外**时判定不适用、不告警
3. `toolkit config status` 只读展示三层生效情况与来源，其「本地配置文件未纳入忽略」提示**不受任何配置开关影响**（除 `--format` 非法外恒输出）

⚠️ **自指关系**：`tasks check` 的上述软告警受 `check.warnings` 支配，而该开关可被本地层（那个未入库的文件本身）设成 `false` → 告警被同一个文件静音、团队无从察觉。故不以 `tasks check` 为唯一自查通道，改由 `config status` 的对应提示兜底（它不受开关影响）。命令用法见 [CLI 参考 · config](./cli/config)。

## 字段总览

```json
{
  "redact":        { "enabled": true, "disable": [], "rules": [] },
  "check":         { "warnings": true, "includeCheckbox": true, "pendingMarkers": true },
  "tasks":         { "importColumns": {} },
  "changelog":     { "languages": {} },
  "changelogDoc":  { "source": "CHANGELOG.md", "target": "docs/changelog.md" },
  "updateCheck":   { "enabled": true },
  "skills":        { "autoLink": true, "autoLinkReplaceForeign": true },
  "skillsInstall": { "mode": "skills" },
  "projectSkills": { "mode": "skills" },
  "usage":         { "enabled": false, "sources": {}, "skills": {}, "capture": {}, "storage": {}, "upload": {} }
}
```

⚠️ `usage` 段只读全局层 `~/.toolkitrc.json`；项目层与本地层误写只告警、不生效，避免克隆仓库后被动开启采集。

## 配置分页

| 分组 | 内容 |
| --- | --- |
| [redact（隐私脱敏）](./config/redact) | 内置规则清单、按名禁用与自定义规则 |
| [check 与 tasks（校验与任务区）](./config/check-tasks) | 软告警开关、勾选框与词标记扫描、任务目录与导入列映射 |
| [changelog 与 changelogDoc（语言与镜像）](./config/changelog) | 语言表与文档站更新页镜像 |
| [updateCheck（升级检查）](./config/update) | 提示频率、通道、registry、缓存与诊断 |
| [skills 相关（技能分发）](./config/skills) | 软链自愈、全局与项目面安装偏好 |
| [usage（技能使用情况）](./usage/configuration) | 总开关、来源、技能范围、字段、存储与上传；仅全局层 |

## 相关页面

- 参考：[完整攻略 · 隐私脱敏](./guide#隐私脱敏) · [CLI 参考](./cli)
