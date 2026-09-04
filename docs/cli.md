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
```

全局开关（`tasks` 与 `changelog` 均支持）：

| 参数 | 说明 |
| --- | --- |
| `-h, --help` | 显示帮助（全局或子命令） |
| `-v, --version` | 显示版本号 |
| `--redact` / `--no-redact` | 开启/关闭隐私脱敏（默认开启） |
| `--warn` / `--no-warn` | 开启/关闭软告警（默认开启） |

开关为**双向三档**，优先级从高到低：CLI 参数 > 环境变量 > 配置文件 > 默认开启。对应环境变量：`FX_REDACT`、`FX_CHECK_WARN`（认 `0/1`、`true/false`、`on/off`）；配置项见[配置参考](./config)。

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
toolkit tasks --dir <path>        # 指定任务目录（CLI 参数 > 配置 tasks.dir > 默认 .tasks）
toolkit tasks check --strict      # 任务目录不存在时报错退出（默认容错为空结果）
```

### 子命令

| 子命令 | 行为 |
| --- | --- |
| `archive` | 将 `status` 为 `已完成`/`已放弃` 且带 `completed` 的任务按完成日期聚合归档；排他锁防并发；缺 `completed` 的终结态任务跳过并提示 |
| `check` | 校验 active：frontmatter 合法性、owner/created/命名规范、重名、`depends_on` 闭环、未闭合待办与 `- [ ]`；游离于 `active/` 层级外的日期前缀文件软告警 |
| `normalize` | 检查归档块：元数据四字段完整性、疑似任务块、完成时间与归档日期漂移、降序排序、月份目录归属；`--fix` 自动补齐/迁移/重排；`--fix` 与 `--check` 互斥 |

### 视图与过滤选项

| 选项 | 说明 |
| --- | --- |
| `--view <view>` | `active`（默认）/ `archived` / `all` |
| `--owner <name>` | 按负责人过滤，逗号分隔多值 |
| `--scope <scope>` | 按范围过滤，逗号分隔多值 |
| `--status <status>` | 按状态过滤，逗号分隔多值；非法值告警并忽略 |
| `--date <date>` | 单日过滤（`YYYY-MM-DD`），与 `--since`/`--until` 互斥 |
| `--since <date>` | 起始日期（含当天） |
| `--until <date>` | 结束日期（含当天） |

⚠️ 过滤只作用于所选视图；不指定 `--view` 时默认只查待完成，过滤落空会附 `--view` 引导提示。日期口径：待完成看创建/更新，已归档看完成时间。

### 导入导出选项

| 选项 | 说明 |
| --- | --- |
| `--export <path>` | 导出到文件，按扩展名驱动：`.csv`（UTF-8 BOM 超集列）/ `.xlsx`（三 sheet）/ `.json`（`{ summary, items }`）；目录不存在自动创建 |
| `--format json` | JSON 输出到 stdout；与 `--export` 互斥 |
| `--import <file>` | 从 `.csv`/`.xlsx`/`.json` 导入；独立模式，不能与子命令、`--export`、`--format` 同用 |
| `--target <target>` | 导入目标 `active`（默认，生成任务文件）/ `archive`（直接写归档块） |

导入细节：兼容本工具三种导出产物；表头自动识别中英文别名（不区分大小写），`.toolkitrc.json` 的 `tasks.importColumns` 自定义映射优先级最高；文件名冲突自动追加序号不覆盖；带完成时间的行状态非终结态时自动置「已完成」并告警。

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

- `version`：先透传 changesets 消费变更集，再对 CHANGELOG 做分组标题格式化并补发布日期；存在未归档 active 任务时软告警
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
