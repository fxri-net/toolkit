---
title: 配置体检（config）
---

# 配置体检（config）

> `list` / `get` / `set` / `unset` 是配置的唯一写入口；`status` 只读查看三层配置文件的生效情况与来源，不打印配置值。

```bash
toolkit config list                      # 列出可写键：生效值与来源层（--layer 只看该层可写键）
toolkit config get task.dir              # 读取单个键（--explain 展示类型、可写层与三层覆盖链）
toolkit config set check.warnings false  # 写入（默认落该键的默认层；--layer global|project|local 切换）
toolkit config unset task.dir            # 删除（默认该键的默认层；删后回收空段并提示回落来源）
toolkit config list --cwd <path>         # 指定查找起点（四个子命令均支持）
toolkit config status                    # 只读体检：三层命中 / 来源层 / 环境变量层（退出码恒 0）
toolkit config status --format json      # JSON 输出：层级明细、展示键来源、环境变量层、待处理项
toolkit config status --cwd <path>       # 指定向上查找的起始目录（缺省当前工作目录）
```

裸 `toolkit config` 打印本域帮助（列出全部子命令）。

| 子命令 | 行为 |
| --- | --- |
| `list` | 列出 `CONFIG_KEYS` 登记的可写键：类型、说明、生效值与来源层；`--layer global\|project\|local` 时只显示**该层可写**的键与该层显式写出的值；未写键显示「未配置（默认 X）」 |
| `get <key>` | 读取单个键的生效值；`--explain` 追加类型、默认写入层、可写层、说明、三层覆盖链与环境变量覆盖提示；`--format json` 另含各层原值与来源 |
| `set <key> <value>` | 写入单个键。默认落该键的 `defaultLayer`，`--layer` 切换；类型 / 枚举 / 十进制正整数 / 可写层校验不通过直接报错退出 1；`--dry-run` 只预览；**非 TTY 环境须显式 `--yes`**，否则按无交互退出码结束（见[退出码](./exit-codes)） |
| `unset <key>` | 删除目标层文件中的该键，删除后逐级回收空对象与空段，并提示删除后实际生效值与来源层；该层未写时按成功退出并说明无需删除；同样支持 `--dry-run` 与非交互 `--yes`，缺 `--yes` 时按无交互退出码结束 |
| `status` | 只读体检、只报不改（无 `--fix`）：依次输出**一句话结论** + **三层命中现场**（每层给出命中文件绝对路径；未命中为「无」。本地层另标 git 忽略态：已忽略 / 未忽略 / 已跟踪（需 `git rm --cached`）/ 不适用（非 git 仓库）/ 不适用（位于仓库工作树之外）/ 忽略判定不可用）+ **展示键来源层**（`task.dir` / `redact.enabled` / `updateCheck.enabled` / `check.warnings` 四键按**叶子键**标注来源层，三层均未显式写出即「默认值」）+ **环境变量层**（`FX_TOOLKIT_REDACT` / `FX_TOOLKIT_NO_UPDATE_CHECK` / `FX_TOOLKIT_CHECK_WARN` 命中的键名，只列来源不列值；**命中 = 已设置且非空，不代表开启**——`FX_TOOLKIT_REDACT=0` / `FX_TOOLKIT_CHECK_WARN=0` 会被列出但实际关闭对应能力，`FX_TOOLKIT_NO_UPDATE_CHECK` 设真值反而关闭更新检查，方向差异需按键名判断）+ **能力旁路**（`CI` 等非配置键覆盖，单列不混入覆盖列）+ **其余已配置段**（除展示键外仍有内容的段名，按「全局层 / 项目层 / 本地层」分组、只列段名不列值）+ **待处理项**（`⚠️` 记 warn、`·` 记 info；含配置降级、本地层忽略态、home 目录下本地配置文件不参与查找的提示、未知段名提示）。**一律不打印配置值**（`redact` 段含个人脱敏规则、`skills` 段含本机路径，落到终端 / CI 日志即外泄）。体检不阻断、**退出码恒 0**（仅 `--format` 非法与 `--cwd` 非法时按参数错误报错退出；配置文件非法 JSON / 顶层非对象经降级后退出码仍为 0，但计入 `warnings` 计数） |

写入语义：

- **键清单是唯一真源**（`src/config-keys.ts` 的 `CONFIG_KEYS`）：每键声明类型、默认层、可写层、默认值与敏感标记，`list` / `get` / `set` / `unset` 共用
- **可写键范围**：仅 `CONFIG_KEYS` 里的简单叶子键（含 `docs.nav.helpChildren` 等字符串数组键）
  `redact.rules`、`changelog.languages`、`docs.nav.locales` 等对象 / 嵌套字段仍手改配置文件
- **可写层约束**：`usage.*` 与 `skillInstall.*` 仅全局层、`projectSkill.*` 仅项目层；写到其它层直接报错，不静默改名
- **未知键给建议**：拼接错误时按编辑距离给出最接近的候选（最多 3 个），退出码 1
- **敏感值**：`usage.upload.endpoint` 的文本与 JSON 输出默认都打码为 `***`，加 `--reveal` 才输出原文——避免 `--format json` 把带 token 的端点写进 CI 日志
- **降级不静默**：目标路径上已有非对象值（如 `"usage": false`）时报错并给出需手工修正的文件，不覆盖用户配置
- **非仓库目录**：项目层 / 本地层写入前校验 `.git` 或 `.tasks`，缺失时 stderr 提示将写入的路径，仍按指定目录写入、不阻断脚本；
  **家目录除外**：`~` 不作为项目根，项目层 / 本地层写入直接报错并提示改用 `--layer global`
- **落盘**：写前备份同目录 `.bak`、原子写入、写后重置配置缓存；`toolkit task init` 会把项目层 / 本地层配置里的旧段名重写为新段名，
  并用一条 `.toolkitrc.*.bak` 覆盖两份备份，确保不被误提交

| 选项 | 说明 |
| --- | --- |
| `--format <format>` | `--format json` 输出机器可读报告到 stdout（诊断走 stderr）；非法值按参数错误报错退出 |
| `--layer <layer>` | 写入 / 删除 / 列出的目标层：`global` / `project` / `local`；非法值报错退出 |
| `--explain` | 仅 `get`：展示键元数据与三层覆盖链 |
| `--reveal` | `list` / `get` / `set` / `unset`：输出敏感值原文（默认打码） |
| `--dry-run` | 仅 `set` / `unset`：只预览，不写盘 |
| `--yes` | 仅 `set` / `unset`：非交互环境确认写入 / 删除 |
| `--cwd <path>` | `list` / `get` / `set` / `unset` / `status`：查找起点（缺省当前工作目录）；相对路径先 resolve 为绝对；指向不存在 / 非目录的路径时报错退出、不回落当前目录 |

报告（`--format json`）顶层为统一信封（字段见[输出约定](../cli#输出约定)）；下表字段位于 `data`，
`items[]` 同时映射到顶层 `issues[]`（`level` / `scope` / `message`）。`config status` 为只读体检，`extend.exitCode` 恒为 `0`。

| 字段 | 内容 | 稳定性 |
| --- | --- | --- |
| `summary` | 一句话结论 | 稳定契约 |
| `items[]` | `level` / `scope` / `message` | 稳定契约 |
| `warnings` | 告警计数 | 稳定契约 |
| `cwd` / `levels[]` / `displayKeys[]` / `env[]` / `bypass[]` | 实现细节 | 可能随版本变更 |

⚠️ 仅前三项为稳定契约（只增不减，与 `convention status` 公共字段同形）；其余属实现细节，可能随版本变更。`levels[]` 承载三层明细（`file` / `present` / `ignored` / 段名）。

⚠️ **`summary` 为固定三态文案**，层名一律用「全局层 / 项目层 / 本地层」三词、逐字一致：

- 命中 ≥1 层：`共命中 N 层：<层名、顿号分隔>`
- 三层全空：`三层均无配置文件，全部取默认值`
- 非 git 仓库：在主句后附 `；未检测到 git 仓库，忽略判定不适用`（旁注，不替换主句）

⚠️ **`items[].level` 只有 `warn` 与 `info` 两值**（对齐 `convention status`，无 error 级）。

`info` 不计入 `warnings` 计数，仅 `warn` 计入——CI 可据 `warnings` 拦错。

`items[].scope` 当前只有两值：`配置`（配置降级项）与 `本地层`（本地文件忽略态与 home 边界提示），文本渲染形如 `[配置]` / `[本地层]`。

⚠️ **未知段名提示**：`info` 级，文案后附带可用段名（`CONFIG_KNOWN_SECTIONS` 排序输出），便于直接从输出改正拼写；该清单与 `docs/config.md` 的字段总览由单测锁定一致。

⚠️ **文本模式折叠 home**：层级路径与待处理项文案中内嵌的路径都把 home 前缀显示为 `~/…`（避免共享日志 / 截图泄露本机目录结构）；`--format json` 保留绝对路径供脚本定位。

⚠️ **自指关系与取舍**：`task check` 的「本地配置文件未入库」软告警受 `check.warnings` 支配，而该开关可被本地层（那个未入库的文件本身）设成 `false`。

- 后果：告警被同一个文件静音，团队无从察觉
- 处置：**不为该告警开例外**，改由 `config status` 的对应提示兜底
- 该提示**不受任何配置开关影响**（除 `--format` 非法外恒输出），`level` 为 `warn`、计入 `warnings` 计数

⚠️ **与 `convention status` 的参数差异**：

- `convention status` 按**任务目录**定位（提供 `--dir`）
- `config status` 面向**配置文件向上查找**：**不提供 `--dir`**，改用 `--cwd` 指定查找起点
- 两者参数不可互换

⚠️ **与 `task check` 的起点差异**：

- `task check` 恒以**运行 cwd** 判定本地配置文件的忽略状态、**无 `--cwd`**
- `config status` 可用 `--cwd` 指定起点
- 两者「本地配置文件是否已忽略」的判据函数共用、态分类一致，仅起点参数能力不同，不可互相替代

## 相关页面

- 参考：[配置参考](../config) · [完整攻略 · Git 纳管范围](../guide#git-纳管范围)
