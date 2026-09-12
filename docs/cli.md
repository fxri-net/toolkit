# CLI 参考

> 目标读者：需要查命令、参数、默认值、退出码的用户。全部内容与 `toolkit --help` 及各子命令 `--help` 输出同源。

## 解决什么问题

README 只给最常用示例；本篇是完整的命令字典，覆盖全部参数与边界行为。

## 全局

**调用方式**：下文示例统一用 `toolkit <command>` 直调（已全局安装）或 `pnpm exec toolkit <command>`（项目 devDependency，npm 用户 `npx toolkit`）；不安装临时执行用 `pnpm dlx @fxri/toolkit <command>`。

```text
toolkit <command> [options]

命令：
  toolkit tasks       任务管理（总览 / 归档 / 校验 / 归一化 / 导入导出）
  toolkit changelog   多语言 CHANGELOG（封装 changesets）
  toolkit init        初始化项目任务区（1.7.0 新增）
  toolkit skills      AI 技能包分发（安装 / 状态 / 卸载 / 路径，1.9.0 新增）
```

全局开关（顶层命令支持；`-h` 全局与子命令均可用）：

| 参数 | 说明 |
| --- | --- |
| `-h, --help` | 显示帮助（全局或子命令） |
| `-v, --version` | 显示版本号 |
| `--redact` / `--no-redact` | 开启/关闭隐私脱敏（默认开启） |
| `--warn` / `--no-warn` | 开启/关闭软告警（默认开启） |

开关为**双向三档**，优先级从高到低：CLI 参数 > 环境变量 > 配置文件 > 默认开启。对应环境变量：`FX_REDACT`、`FX_CHECK_WARN`（认 `0/1`、`true/false`、`on/off`、`yes/no`）；配置项见[配置参考](./config)。

另有一个独立环境变量 `FX_NO_UPDATE_CHECK`：设为真值时关闭升级检查提示（1.7.0 新增，行为详见[配置参考 · updateCheck](./config#updatecheck升级检查提示-170-新增)）。

## tasks

```bash
toolkit tasks                     # 待完成总览（默认）
toolkit tasks --view archived     # 仅已归档
toolkit tasks --view all          # 待完成 + 已归档（状态分组，来源可辨）
toolkit tasks archive             # 归档已完成任务
toolkit tasks archive --dry-run   # 归档预演（只预览，不落盘）
toolkit tasks check               # 校验 active
toolkit tasks normalize           # 检查归档块（默认只读）
toolkit tasks normalize --fix     # 修复归档问题
toolkit tasks stats               # 周期统计：完成周期 / 滞留 / 吞吐
toolkit tasks stats --format json # 统计结果 JSON 输出
toolkit tasks --dir <path>        # 指定任务目录（CLI 参数 > 配置 tasks.dir > 默认 .tasks）
toolkit tasks check --strict      # 任务目录不存在时报错退出（默认容错为空结果）
```

### 子命令

| 子命令 | 行为 |
| --- | --- |
| `archive` | 将 `status` 为 `已完成`/`已放弃` 且带 `completed` 的任务按完成日期聚合归档；排他锁防并发；缺 `completed` 的终结态任务跳过并提示；完成时间晚于当前系统时间或恰为零点整（疑似只填日期被补零）时软告警 |
| `check` | 校验 active：frontmatter 合法性、owner/created/命名规范、重名、`depends_on` 闭环、未闭合待办与 `- [ ]`；completed 晚于当前系统时间或恰为零点整（疑似只填日期被补零）软告警；范围字段形态软告警（顿号/逗号疑似多值分隔请改半角加号、括号疑似注释请移入正文）；游离于 `active/` 层级外的日期前缀文件软告警 |
| `normalize` | 检查归档块：元数据四字段完整性、疑似任务块、完成时间与归档日期漂移、完成时间晚于当前系统时间或恰为零点整（仅报告，不自动改值）、降序排序、月份目录归属、范围字段形态（顿号/逗号分隔可 `--fix` 归一为半角加号，括号疑似注释仅提示人工）；`--fix` 自动补齐/迁移/重排/范围归一；`--fix` 与 `--check` 互斥 |
| `stats` | 周期统计（仅人用视图，不落盘）：完成周期与分布（仅「已完成」，已归档任务创建日期从块标题恢复，缺失者跳过并计数）、未完成任务滞留时长、按完成月/负责人/范围吞吐汇总；`--format json` 输出 JSON，过滤选项与查询一致（不含 `--status`） |

### 视图与过滤选项

| 选项 | 说明 |
| --- | --- |
| `--view <view>` | `active`（默认）/ `archived` / `all` |
| `--owner <name>` | 按负责人过滤，逗号分隔多值 |
| `--scope <scope>` | 按范围过滤，逗号分隔多值；任务文件内范围多值以半角加号存储（如 `toolkit+lxgl-web`），过滤值命中任一段即中 |
| `--status <status>` | 按状态过滤，逗号分隔多值；非法值告警并忽略 |
| `--date <date>` | 单日过滤（`YYYY-MM-DD`），与 `--since`/`--until` 互斥 |
| `--since <date>` | 起始日期（含当天） |
| `--until <date>` | 结束日期（含当天） |

⚠️ 过滤只作用于所选视图；不指定 `--view` 时默认只查待完成，过滤落空会附 `--view` 引导提示。日期口径：待完成看创建/更新，已归档看完成时间。

### 导入导出选项

| 选项 | 说明 |
| --- | --- |
| `--export <path>` | 导出到文件，按扩展名驱动：`.csv`（UTF-8 BOM 超集列）/ `.xlsx`（三 sheet）/ `.json`（`{ schemaVersion: 1, summary, items }`）；目录不存在自动创建 |
| `--format json` | JSON 输出到 stdout；诊断与提示信息（升级提示、链接自愈提示）一律走 stderr，不干扰机器解析；与 `--export` 互斥 |
| `--import <file>` | 从 `.csv`/`.xlsx`/`.json` 导入；独立模式，不能与子命令、`--export`、`--format` 同用；`--owner`/`--scope` 可同用，作为导入行缺失字段的默认值 |
| `--target <target>` | 导入目标 `active`（默认，生成任务文件）/ `archive`（直接写归档块） |

导入细节：兼容本工具三种导出产物（JSON 另兼容裸数组格式）；XLSX 自动跳过名为「汇总」的 sheet、支持表头不在首行；表头自动识别中英文别名（不区分大小写），`.toolkitrc.json` 的 `tasks.importColumns` 自定义映射优先级最高；文件名冲突自动追加序号不覆盖；带完成时间的行状态非终结态时自动置「已完成」并告警；范围列含顿号/逗号/括号时提示按单值写入、多值请用半角加号（只提示不自动转换）。

## changelog

```bash
toolkit changelog                       # 创建变更集（等价 changeset）
toolkit changelog version               # 发版 + 格式化（默认中文）
toolkit changelog --lang en version     # 指定语言
toolkit changelog format                # 仅格式化已有 CHANGELOG
toolkit changelog status / publish      # 其余 changeset 子命令透传
```

| 选项 | 说明 |
| --- | --- |
| `--lang <lang>` | 输出语言，默认 `zh`；内置 `zh`/`en`，其余经配置扩展 |

行为细节：

- `version`：先透传 changesets 消费变更集，再对 CHANGELOG 做分组标题格式化、清理变更集条目双前缀伪影（以 `- ` 开头的条目会被 changesets 二次加前缀为 `- - 条目` 并缩进续行，格式化时还原为顶层条目）并补发布日期；存在未归档 active 任务时软告警
- 其余子命令（`add`/`status`/`publish`/…）原样透传给 changesets
- ⚠️ Node 18 下依赖 changesets 的子命令不可用（上游 ESM-only 限制），`format` 等纯格式化不受影响

## init（1.7.0 新增）

```bash
toolkit init
toolkit init --dir ../my-tasks-repo   # 任务区放项目外（独立仓库管理）
```

在当前目录初始化任务区：

- 创建 `<任务目录>/active/{YYYYMM}/`、`<任务目录>/archive/` 目录骨架（默认 `.tasks`，优先级与 `tasks` 同口径：CLI 参数 > 配置 `tasks.dir` > 默认 `.tasks`）
- 向 `.gitignore` 追加忽略片段（含 `.archive.lock`；已有则跳过）
- 输出后续步骤与文档站链接

⚠️ 重复执行安全：已存在的目录与配置不覆盖、不报错。

⚠️ 任务区放项目外（独立文档仓库）：配置 `"tasks": { "dir": "../my-tasks-repo" }` 后，`init` 与全部 `tasks` 子命令都作用于该目录，一次配置永久生效；`.gitignore` 片段仍写入当前项目。

## skills（1.9.0 新增）

```bash
toolkit skills install              # 安装包内技能到各全局技能目录（默认软链真源）
toolkit skills install --copy       # 强制副本形式（不建软链）
toolkit skills install --dry-run    # 预演：只预览将执行的动作，不写文件
toolkit skills install --force      # 覆盖同名非本包产物（默认跳过，避免破坏用户自装技能）
toolkit skills install --dir <path> # 额外目标目录（可多次指定，兜底内置表未收录的 agent）
toolkit skills install --format json # JSON 输出：技能源、包内技能、各目标新建/更新/跳过/冲突/降级/失败
toolkit skills status               # 查看各全局技能目录的现场状态
toolkit skills status --format json # JSON 输出：技能源目录、状态文件、技能清单、各目标逐技能状态
toolkit skills remove               # 卸载本包安装的技能产物
toolkit skills remove --dry-run     # 卸载预演（只预览将移除的条目）
toolkit skills remove --format json # JSON 输出：状态文件、各目标已移除/已不存在/跳过项
toolkit skills path                 # 输出包根路径（内含 skills/）
toolkit skills path --format json   # JSON 输出：包根、技能源目录、技能清单
```

裸 `toolkit skills` 打印本域帮助（列出 4 个子命令）。

| 子命令 | 行为 |
| --- | --- |
| `install` | 以包内 `skills/`（含 `SKILL.md` 者计为技能）为唯一真源分发：逐技能幂等——指向正确跳过、指向错误或悬空重建、同名实体目录 / 普通文件默认跳过（`--force` 覆盖）；未安装的 agent 只报告、不凭空造目录；`--format json` 输出机器可读安装报告到 stdout（含 `dryRun` 标记） |
| `status` | 逐目标逐技能报告 7 态：软链正常 / 软链悬空 / 软链指向别处 / 副本已同步 / 副本已漂移（本包登记副本与真源不一致）/ 缺失 / 同名冲突（同名非本包产物）；末尾汇总需处理条目并按型给出指引：缺失 / 悬空 / 指向错误 / 副本漂移用 `install` 补齐，同名冲突用 `install --force` 覆盖；`--format json` 输出机器可读报告到 stdout（替代人读版，无末尾汇总行） |
| `remove` | 只清理状态文件 `~/.agents/.toolkit-skills.json` 记载的本包产物：链接（含悬空）摘除、副本内容与真源一致才删，其余交人工确认；清理干净后删除状态文件；`--format json` 输出机器可读卸载报告到 stdout（含 `dryRun` 标记） |
| `path` | 输出包根（内含 `skills/`），便于委托上游安装器安装到内置表未收录的 agent；`--format json` 输出包根、技能源目录与技能清单 |

四个子命令的 `--format json` 输出统一携带 `schemaVersion: 1` 锚点（与 `tasks --export` 同口径）；`install` / `remove` 的报告另带 `dryRun` 字段，供消费方区分预演与实跑。

**分发目标三层**（按顺序去重）：

1. 主目标 `~/.agents/skills/`（上游 canonical 目录，多家 agent 共读）
2. 内置表中「已安装」的各 agent 全局技能目录（判据：agent 配置目录存在或探测路径命中）
3. `--dir <path>` 指定的兜底目录

**行为细节**：

- 产物形态默认**软链**（Windows 用 `junction`，免管理员、免开发者模式）；链接创建失败**自动降级副本**并在报告里标注 ⚠️，不静默跳过
- 卸载链接时**只摘链、不碰真源**（包内原始文件完好）
- 配置 `skills.autoLink`（默认 `true`）：命令启动时对状态文件记载的**链接**做补链与修链；现场被替换为同名实体目录 / 普通文件时默认清理重建为软链，置 `skills.autoLinkReplaceForeign: false` 可改为一律不动（**不含首次安装、不含副本升级**；`CI` 环境自动跳过。见[配置参考 · skills](./config#skills技能分发)）
- 状态文件为**用户级**（`~/.agents/.toolkit-skills.json`），与上游安装器的 `skills-lock.json` 相互独立

## 退出码

| 退出码 | 含义 |
| --- | --- |
| `0` | 成功（含 check 通过、归档跳过等正常路径） |
| `1` | 操作失败或校验存在 error 级问题（check 有 error、参数冲突、文件/目录异常等） |

软告警（warn 级）不影响退出码。

## 相关页面

- [完整攻略](./guide)：工作流与任务文件规范
- [配置参考](./config)：`.toolkitrc.json` 全部字段
- [API 参考](./api)：以上能力的库形态
