# 配置参考

> 目标读者：需要按项目定制行为的用户。字段枚举与 `src/config.ts` 解析代码同源。

## 解决什么问题

不同项目对脱敏、告警、语言、导入列映射的需求不同；`.toolkitrc.json` 让这些定制随仓库走、团队共享。个人偏好（关升级提示、个人脱敏规则等）不必污染团队配置，按作用域分两处落：跨项目的放全局文件 `~/.toolkitrc.json`，仅本项目的放本地文件 `.toolkitrc.local.json`（默认不入库）。

## 配置文件三层

| 层 | 文件 | 定位方式 | 用途 |
| --- | --- | --- | --- |
| 全局层 | `~/.toolkitrc.json` | 固定路径 | 个人跨项目偏好，不随 git 分发，换机器需手动迁移 |
| 项目层 | `.toolkitrc.json` | 自 `process.cwd()` 向上逐级查找最近一份（一路查到文件系统根） | 团队共享配置，随仓库走 |
| 本地层 | `.toolkitrc.local.json` | 自 `process.cwd()` 向上逐级查找最近一份（**止于 home**） | 个人按项目、仅本人可见，默认被 git 忽略 |

- **各自独立查找**：项目层与本地层分别向上查找最近一份，不要求命中同一目录——monorepo 子目录只放本地文件时不会吞掉上层团队配置
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

⚠️ **自指关系**：`tasks check` 的上述软告警受 `check.warnings` 支配，而该开关可被本地层（那个未入库的文件本身）设成 `false` → 告警被同一个文件静音、团队无从察觉。故不以 `tasks check` 为唯一自查通道，改由 `config status` 的对应提示兜底（它不受开关影响）。命令用法见 [CLI 参考 · config](./cli#config-1-11-2-新增)。

## 字段总览

```json
{
  "redact":      { "enabled": true, "disable": [], "rules": [] },
  "check":       { "warnings": true, "includeCheckbox": true, "pendingMarkers": true },
  "tasks":       { "importColumns": {} },
  "changelog":   { "languages": {} },
  "updateCheck": { "enabled": true },
  "skills":      { "autoLink": true, "autoLinkReplaceForeign": true }
}
```

## redact：隐私脱敏

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | 总开关；被 CLI `--redact/--no-redact` 与环境变量 `FX_REDACT` 覆盖 |
| `disable` | string[] | `[]` | 按 `name` 禁用内置规则（如 `["手机号"]`），被禁用规则不再匹配，对应信息原样保留 |
| `rules` | object[] | `[]` | 自定义规则，**优先于内置**；同 `name` 可覆盖内置 |

自定义规则结构：

```json
{
  "redact": {
    "rules": [
      { "name": "自定义码", "pattern": "cod-[0-9]{6}", "flags": "i", "replacement": "cod-******" }
    ]
  }
}
```

| 字段 | 说明 |
| --- | --- |
| `name` | 规则名；与内置同名即覆盖，也可放进 `disable` 引用 |
| `pattern` | 正则字符串 |
| `flags` | 正则标志（可选，如 `i`） |
| `replacement` | 替换文本（可选，默认整体掩码） |

内置规则：`内网URL`（含端口）、`邮箱`、`JWT`、`AWS密钥`、`GitHub密钥`、`GitHub细粒度密钥`、`OpenAI密钥`、`OpenAI项目密钥`、`Slack密钥`、`Slack应用令牌`、`手机号`、`身份证`、`IPv4`。密钥类带长度门槛避免误伤。

## check：校验与告警

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `warnings` | boolean | `true` | 软告警总开关（`tasks check` 的 warn 输出、归档/发版提醒、changelog 无类型前缀条目告警）；被 `--warn/--no-warn` 与 `FX_CHECK_WARN` 覆盖 |
| `includeCheckbox` | boolean | `true` | `tasks check` 是否把正文未勾选的 `- [ ]` 扫为未闭合待办 |
| `pendingMarkers` | boolean | `true` | `tasks check` 是否扫描词标记（待办/待实施/…）；只扫正文不扫标题 |

## tasks：任务目录与导入列映射

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `dir` | string | `".tasks"` | 任务目录（配置项 1.7.0 新增）；支持绝对路径或 `../` 相对路径，任务区可放项目外（如独立文档仓库）；被 CLI `--dir` 覆盖，`init`、`tasks` 与 `conventions` 同口径 |
| `importColumns` | object | 无 | 键 = 实际表头列名（匹配不区分大小写），值 = 标准字段名（`title`/`status`/`owner`/`scope`/`created`/`updated`/`completed`/`depends`/`body`）；优先级高于内置别名表 |

```json
{
  "tasks": {
    "dir": "../my-tasks-repo",
    "importColumns": { "我的标题": "title", "Deadline": "completed" }
  }
}
```

## changelog：语言表

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `languages` | object | 无 | 追加或覆盖语言；内置 `zh`/`en`，配置同名 key 覆盖内置，新 key 追加（同名 key 为**整体覆盖**，非字段级深合并：配了某语言，其未写的段也不会落到内置） |

每个语言为四段结构：

```json
{
  "changelog": {
    "languages": {
      "ja": {
        "groups": [
          { "slot": "breaking", "title": "### 🚨 重大変更" },
          { "slot": "added", "title": "### ✨ 新規機能" },
          { "slot": "fixed", "title": "### 🐛 不具合修正" },
          { "slot": "other", "title": "### 📦 その他" }
        ],
        "replacements": { "### Major Changes": "### 🚨 重大変更" },
        "deps": "- 依存関係を更新",
        "released": "リリース"
      }
    }
  }
}
```

| 字段 | 说明 |
| --- | --- |
| `groups` | 语义分组表（可选、有序，组序即输出顺序）：每项 `{ slot, title, prefixes? }`——`slot` 取全局语义槽位（`breaking`/`added`/`changed`/`improved`/`fixed`/`docs`/`removed`/`deps`/`other`），`title` 为本语言组标题，`prefixes` 为本语言自有类型前缀（可选，识别时与全局前缀表取并集）；缺省时退化为纯替换（仅 `replacements` 生效） |
| `replacements` | 兜底替换映射（源标题 → 目标标题） |
| `deps` | 依赖更新条目文案 |
| `released` | 发布日期后缀（同时用于识别既有日期行） |

## updateCheck：升级检查提示（1.7.0 新增）

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | 升级检查总开关；`false` 时 CLI 不发起任何网络请求 |

CLI 每次命令执行时**同步读取本地缓存**，检测到新版本时向 **stderr** 输出一行升级提示；缓存不新鲜时派生一个**分离的后台子进程**联网查询 npm registry 最新版本（1 秒超时，离线/内网/超时静默失败），父进程不联网、不等待结果，**不阻塞命令、不影响退出码**。查询结果缓存在系统临时目录 `{tmpdir}/.toolkit-update-check.json`：成功结果缓存 24 小时、失败结果缓存 1 小时（避免离线环境每条命令都重试联网）。提示只来自缓存，因此首次运行只静默刷新缓存、下一次命令才提示新版本。关闭方式二选一：环境变量 `FX_NO_UPDATE_CHECK` 设为真值（`0/false/off/no` 视为未关闭，其余视为关闭），或本配置项设为 `false`（关闭后不派生后台进程、不发起任何网络请求）。

## skills：技能分发（1.9.0 新增）

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `autoLink` | boolean | `true` | 链接自愈开关：每次执行 `toolkit` 命令时，对状态文件 `~/.agents/.toolkit-skills.json` 记载的**软链**做补链与修链（悬空、指向其他版本即内容与真源不一致的链接重建；内容一致的异地软链不视为错误、不重指） |
| `autoLinkReplaceForeign` | boolean | `true` | 自愈遇到同名**实体目录 / 普通文件**时是否先清理再重建为软链：`true` 清理重建，`false` 一律不动（状态记录保留，需处置时用 `toolkit skills install --force`）；只影响自愈，不影响显式 `install` |

**作用边界**（护栏）：

- **只补链与修链**：不含首次安装（未安装过、无状态文件时不动作），不含副本刷新（副本形式的技能不自动升级，需重跑 `toolkit skills install`）
- **只对状态文件记载的链接生效**：现场被替换成实体目录 / 普通文件时，默认清理后重建为软链；`autoLinkReplaceForeign: false` 改为一律不动——该开关**只豁免实体产物**，悬空与指向其他版本（内容与真源不一致）的链接仍照常修复
- **`CI` 环境自动跳过**：检测到 `CI` 环境变量时不执行，避免污染流水线
- **任何失败静默**：修链失败不影响命令本身，条目留在状态文件里下次再试
- 修复发生时向 **stderr** 输出一行 `已自动修复 N 个技能链接`（stdout 留给机器可读输出）；不需要自愈可把 `autoLink` 设为 `false` 关闭

```json
{
  "skills": { "autoLink": true, "autoLinkReplaceForeign": false }
}
```

## 相关页面

- [完整攻略 · 隐私脱敏](./guide#隐私脱敏)：脱敏效果示例
- [CLI 参考](./cli)：三档开关的命令行覆盖方式
