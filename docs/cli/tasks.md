---
title: tasks（任务管理）
---

# tasks（任务管理）

> 任务区的日常操作：看板、归档、校验、归一、统计与导入导出。

## 常用命令

```bash
toolkit tasks                     # 待完成总览（默认）
toolkit tasks --view archived     # 仅已归档
toolkit tasks --view all          # 待完成 + 已归档（状态分组，来源可辨）
toolkit tasks archive             # 归档已完成任务
toolkit tasks archive --task 20261112-唐启云-示例任务 # 只归档指定任务（唯一键）
toolkit tasks archive --dry-run   # 归档预演（只预览，不落盘）
toolkit tasks check               # 校验 active 与变更集写法
toolkit tasks normalize           # 检查归档块（默认只读）
toolkit tasks normalize --fix     # 修复归档问题
toolkit tasks stats               # 周期统计：完成周期 / 滞留 / 吞吐
toolkit tasks stats --format json # 统计结果 JSON 输出
toolkit tasks export 报表.xlsx    # 导出任务（按扩展名识别 csv / xlsx / json）
toolkit tasks import 需求清单.csv --dry-run # 导入预演
toolkit tasks --dir <path>        # 指定任务目录（CLI 参数 > 配置 tasks.dir > 默认 .tasks）
toolkit tasks check --strict      # 任务目录不存在时报错退出（默认容错为空结果）
```

## 任务域选项

| 选项 | 说明 |
| --- | --- |
| `--dir <path>` | 任务目录（优先级：CLI 参数 > 配置 `tasks.dir` > 默认 `.tasks`） |
| `--redact` / `--no-redact` | 开启/关闭隐私脱敏（默认开启） |
| `--warn` / `--no-warn` | 开启/关闭软告警（默认开启；作用于 `check` 的 warn 输出、归档时的变更集提醒） |
| `--strict` | 任务目录不存在时报错退出（默认容错为空结果） |

## 子命令

| 子命令 | 一句话 |
| --- | --- |
| `list` | 待完成看板（等价于裸 `tasks`；隐式子命令，帮助中不展示） |
| `archive` | 把终结态任务按完成日期聚合归档；`--task` 只归档指定任务，`--dry-run` 预演 |
| `check` | 校验 active 任务、规范载体、入口壳、变更集与文件卫生（只报不改） |
| `normalize` | 检查并修复归档块；`--fix` 修复，`--check` 显式声明只读 |
| `stats` | 周期统计（人用视图，不落盘） |
| `export <path>` | 导出到文件（按扩展名识别 csv / xlsx / json） |
| `import <file>` | 从文件导入任务；`--target` 指定 active / archive |

不带子命令时输出待完成看板，末尾汇总与 `stats` 共用同一维度；任务正文的 `> 批次：第 N 批（共 M 批）` 行会被解析进「按批次」汇总。

### archive

- 条件：`status` 为 `已完成` / `已放弃` 且带 `completed`，按完成日期聚合归档
- `--task <唯一键>` 只归档指定任务；键不存在或尚未终结时报错退出（退出码 1），不落到全量
- 未指定 `--task` 且同时归档多个任务时，stderr 提示建议逐个归档以匹配逐任务提交（不阻断）
- 排他锁防并发；缺 `completed` 的终结态任务跳过并提示
- 完成时间晚于当前系统时间超过 14 小时（跨时区容差）或恰为零点整（疑似只填日期被补零）时软告警
- 文件名简述与正文标题不同源时在固化前软告警（归档块标题取自文件名，固化后不再改）

### check

校验 active 任务与下列形态，只报不改：

- **任务字段**：frontmatter 合法性、owner / created / 命名规范、重名、`updated` 早于 `created`（error 级）、`depends_on` 闭环、未闭合待办与 `- [ ]`
- **文件名三段**：日期↔`created`、用户名↔`owner`、简述↔正文标题；简述须源出标题（不翻译 / 不音译 / 不缩写），并检查跨平台非法字符、Windows 保留设备名、结尾点或空格、NFC 与长度（均软告警）
- **时间**：completed 晚于当前系统时间超过 14 小时（跨时区容差）或恰为零点整时软告警
- **范围字段**：顿号 / 逗号疑似多值分隔（请改半角加号）、括号疑似注释（请移入正文）、含空格（端名与分类标签不得含空格）；取值须在 conventions 端清单内（`common` 恒合法），载体缺失时跳过
- **词标记**：只认正文行首子项形态（列表项或「标记词：」开头），跳过标题、代码块与引用块，叙述性引用不再误报
- **文件位置**：游离于 `active/` 层级外的日期前缀文件
- **规范载体**：旧单文件 `conventions.md` 残留待迁移；
   `conventions/` 缺 `index.md`；形态异常（形态标记、`history.md` 与索引表首列 ID 三者不一致）；
   v3 索引表列集合偏离五列；`history.md` / `retired.md` 表头偏离固定列；
载体各文件表头与分隔行列数不等；`history.md` 数据行首列非稳定 ID；
「修订内容」列含禁用语料；
   分册内残留「确立来源」子项；任务区 md 表格列对齐填充（可执行 `toolkit conventions format` 归一）
- **技能入口壳**：壳标记版本与当前 toolkit 不一致、或被 gitignore 覆盖不会随 git 分发；多落点并存时各合并为一条并内联落点路径
- **变更集写法**：扫 `.changeset` 下待发布变更集，缺类型前缀的顶层条目、未加「- 」列表标记的裸行各转一条并内联条数 / 行数（裸行会被 changesets 并入相邻条目作缩进续行、
   致整段塌成单一条目且只有首行归组剥前缀）；裸行阈值 2 行起报以避开正文误报；前缀识别取全局表与各配置语言自有前缀的并集，缩进续行随父条目迁属不参与
- **归档块**：复用 `tasks normalize` 的同一检查实现（见下）
- **文件卫生**：UTF-8 BOM、行尾多余空白、CRLF / LF 混用，统一软告警不阻断

### normalize

检查归档块，可选修复：

- **检查项**：元数据四字段完整性、疑似任务块、完成时间与归档日期漂移、完成时间晚于当前系统时间超过 14 小时（跨时区容差）或恰为零点整（仅报告，不自动改值）、降序排序、月份目录归属、
   范围字段形态（顿号 / 逗号分隔可 `--fix` 归一为半角加号，括号疑似注释仅提示人工）、git 冲突标记
- **`--fix`**：自动补齐 / 迁移 / 重排 / 范围归一 / 按并集去重 + 降序确定性解决冲突标记（多写者同天归档的 `pull` 冲突）
- `--fix` 与 `--check` 互斥

### stats

- 完成周期与分布（仅「已完成」，已归档任务创建日期从块标题恢复，缺失者跳过并计数）
- 未完成任务滞留时长
- 按完成月吞吐汇总
- 汇总块与 `toolkit tasks` 看板一致：按状态 / 负责人 / 范围 / 批次（范围多值拆段、空值与 `-` 归「未标注」；批次解析正文行 `> 批次：第 N 批（共 M 批）`，无该行归「未分批」）
- `--format json` 输出 JSON（顶层携带 `schemaVersion: 1` 锚点，与 `tasks export` 及各域 `--format json` 同口径），
   过滤选项与视图查询一致（`--view` 默认 `all`，含归档）；JSON 的 `byOwner` / `byScope` 仍是完成样本吞吐口径，统一分布见 `summary` 字段，
   `view` 记录本次统计视图（`all` / `active` / `archived`）

`check` / `normalize` 的问题清单逐条输出为 `文件:行号: 描述`（有行号时便于编辑器跳转）；文件级问题（如重名、游离文件、归档块问题）无对应行，省略行号段，输出为 `文件: 描述`。

## 视图与过滤选项

| 选项 | 说明 |
| --- | --- |
| `--view <view>` | `active`（默认）/ `archived` / `all` |
| `--owner <name>` | 按负责人过滤，逗号分隔多值 |
| `--scope <scope>` | 按范围过滤，逗号分隔多值；任务文件内范围多值以半角加号存储（如 `web+server`），过滤值命中任一段即中 |
| `--status <status>` | 按状态过滤，逗号分隔多值；部分取值非法时 stderr 告警并剔除（能继续执行），全部取值非法时报错退出（退出码 1） |
| `--date <date>` | 单日过滤（`YYYY-MM-DD`），与 `--since`/`--until` 互斥 |
| `--since <date>` | 起始日期（含当天） |
| `--until <date>` | 结束日期（含当天） |

⚠️ 过滤只作用于所选视图；不指定 `--view` 时默认只查待完成，过滤落空会附 `--view` 引导提示。日期口径：待完成看创建/更新，已归档看完成时间。

## 导出与导入

| 子命令 | 说明 |
| --- | --- |
| `export <path>` | 按扩展名驱动：`.csv`（UTF-8 BOM 超集列）/ `.xlsx`（三 sheet）/ `.json`（`{ schemaVersion: 1, summary, items }`）；目录不存在自动创建；支持 `--view` 与过滤参数 |
| `import <file>` | 从 `.csv`/`.xlsx`/`.json` 导入；`--target active`（默认，生成任务文件）/ `--target archive`（直接写归档块）；`--dry-run` 预演；`--owner`/`--scope` 作为导入行缺失字段的默认值 |

`--format json` 只用于 `tasks` 总览与 `tasks stats` 的 stdout；导出文件格式由 `export <path>` 的扩展名决定。

导入细节：兼容本工具三种导出产物（JSON 另兼容裸数组格式）；XLSX 自动跳过名为「汇总」的 sheet、支持表头不在首行；表头自动识别中英文别名（不区分大小写），
`.toolkitrc.json` 的 `tasks.importColumns` 自定义映射优先级最高；
文件名冲突自动追加序号不覆盖；带完成时间的行状态非终结态时自动置「已完成」并告警；
范围列含顿号/逗号/括号时提示按单值写入、多值请用半角加号（只提示不自动转换）。

`--target archive` 的归档契约：按块标题去重——同名任务以**本次导入的内容覆盖**同名块，重复导入同一份文件不会产生重复块（幂等）；
块内元数据状态**取自数据**（如源行状态为「已放弃」则写「已放弃」，不强制改写为「已完成」）；缺完成时间的行无法直接归档，跳过并提示改用 `active` 目标。

## 相关页面

- 参考：[完整攻略 · 任务文件规范](../guide#任务文件规范) · [退出码](./exit-codes)
