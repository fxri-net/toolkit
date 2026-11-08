<!-- toolkit-conventions: v3 -->
# 项目协作规范索引

> 本文件为规范载体唯一入口与唯一权威；规范全貌见下方索引，条文见各分册。
> 读面纪律：`history.md` / `retired.md` 属归档面，仅在审计 / 恢复时读，不在常规读面。

## 一、端清单

> 端名与任务 frontmatter 的 `scope` 取值共用同一套词表；保留字 `index` / `common` 不得作端名。本项目单端（`scope` 取值仅 `toolkit`），规范全归 `common`。

| 端名 | 说明 |
| --- | --- |

## 二、索引

| ID | 规则 | 当前语义 | 归属 | 单一事实源 |
| --- | --- | --- | --- | --- |
| C-2 | 能力终点 = 沉淀 + 自动提交 | 任务终结 → 归档 → 规范沉淀 → 收尾提交自动执行；推送与发版默认须用户明确，不可逆动作默认逐次授权、当前指令已含授权则直接执行 | common | `docs/rules/ai.md` 稳定纪律（作者个人收紧，可裁剪） |
| C-6 | 规则细节只进 skills | 可变流程细节只进 skills，不在 rules 等规则层复述，防用户侧规则快照失同步 | common | `AGENTS.md` 质量门第 5 条 |
| C-7 | 触达核对前置到方案确认 | 能力 / 措辞变更前先 grep 全仓库定位触达点，影响范围按文档清单逐篇核对（已同步 / 无触达及理由） | common | `AGENTS.md` 质量门第 2 条 |
| C-8 | 文档三层职责分离 | 操作手册 = 用户视图层；fxri-* skills = 可变细节唯一演进源；`docs/rules/ai.md` = 薄壳稳定纪律 + 对 skills 的引用 | common | `docs/rules/ai.md`（配套说明）+ `AGENTS.md` 质量门第 5 条 |
| C-12 | 机器可读输出与诊断提示分流 | stdout 只承载机器可读内容（如 `--format json`），提示与诊断（升级提示、链接自愈提示）一律走 stderr | common | `docs/cli.md`（`--format json` 行）+ `docs/config/update.md`（升级提示通道）+ `docs/config/skills.md`（链接自愈提示） |
| C-13 | 验收含类型检查与静态检查 | 类型检查与静态检查是聚合门禁 `pnpm verify` 的内部步骤（步骤定义见 `scripts/verify.mjs`）；不得以 `pnpm lint` / `pnpm build` 替代类型检查 | common | `AGENTS.md`「验收方式」 |
| C-14 | 路径书写 | 仓库内引用用仓库根相对路径（含行号形如 `src/cli.ts L103`），不写指向本机的绝对 `file:///` 链接；active 可留本机资源路径，归档时归一为占位形式（`<本机>/…`、`~/` 或 `%USERPROFILE%`） | common | `AGENTS.md`「协作流程约束」 |
| C-15 | 规则层更新锚点 | `SPEC.md`、`templates/rules/*.md`（六个模块）、`docs/rules/ai.md`、`docs/rules/commit.md`、`docs/rules/usage.md` 各有一行更新锚点：模块文件首行记录该模块内容变更时间，规则页与组合输出首行取所含模块最大值、模块正文外的页面调整不抬锚点；任何内容变更以变更时刻更新所属锚点、未变更不刷新、同批取同一时间、不随发版例行抬高 | common | `SPEC.md` 首部 + `templates/rules/*.md` 与 `docs/rules/*.md` 规则全文首行 + `AGENTS.md` 质量门第 6 条 |
| C-16 | 提交信息规则单一真源与独立成页 | 真源为 `templates/rules/commit.md`（随包分发）；`.trae/rules/git-commit-message.md` 与 `docs/rules/commit.md` 均为投影，正文逐字一致、可单独复制采用，三处同步变更 | common | `templates/rules/commit.md`（真源）+ `.trae/rules/git-commit-message.md`、`docs/rules/commit.md`（投影） |
| C-17 | 测试不复刻被测实现 | 派生 / 镜像类逻辑的测试期望须直接调用真实实现，不得在测试内重写同一份转换逻辑（同错复刻会掩盖实现缺陷） | common | `AGENTS.md`「验收方式」 |
| C-22 | 门禁单源与时点 | 验收步骤清单唯一真源为 `scripts/verify.mjs`、以 `pnpm verify` 暴露，本地与四处 CI 共用，不得另写步骤枚举；关卡设在发布前；任务收尾顺序为「归档与沉淀 → 验收 → 提交」；验收与提交须串联失败即止（`&&` 或分步，禁止 `;` 串联） | common | `AGENTS.md`「验收方式」+「发版链路」+「协作流程约束」+ `scripts/verify.mjs` + `skills/fxri-release-changelog/SKILL.md` + `skills/fxri-plan-to-task/references/task-spec.md`（第 6 节） |
| C-23 | 测试假现场须与真实现场形态一致 | 模拟现场的假数据须与真实形态一致；被测逻辑对现场形态存在分支判据时，每种真实形态都要有对应用例 | common | [common.md](./common.md) |
| C-25 | 版本括注口径 | `（x.y.z 新增）` 类括注只标命令 / 技能 / 配置项 / 单一能力点的首次引入版本且紧邻该对象；跨版本演进清单不挂句末括注，扩展史由 `CHANGELOG.md` 承载 | common | [common.md](./common.md) |
| C-26 | 降级不静默 | 用户显式传入的值（CLI 选项值、配置文件项）无法采纳时不得静默忽略：能继续执行则 stderr 告警「忽略了什么、回落到什么」，无法继续则报错并以非 0 退出码终止 | common | `AGENTS.md`「协作流程约束」+ `docs/cli.md`（`--status` / `--lang` / `--format` 行） |
| C-28 | 规则落门禁 | 规则层新增 / 强化「可自动检出」的要求时，或复核发现既有要求无检测入口时，须同批补落检测入口（`tasks check` / `pnpm verify`）且置于不可逆动作之前 | common | [common.md](./common.md) |
| C-29 | 门禁与测试的环境无关性 | `pnpm verify` 各步须与运行环境无关（hermetic），涉时间比对的测试 / 步骤固定时区口径、按数据来源分两轴：合成数据钉 `TZ=UTC`，读真实任务数据钉 `TZ=Asia/Shanghai` | common | [common.md](./common.md) |
| C-30 | 配置分层 | 三层配置模型：全局 `~/.toolkitrc.json`（段级整体覆盖）→ 项目 `.toolkitrc.json`（向上查最近一份）→ 本地 `.toolkitrc.local.json`（止于 home、默认不入库）；合并粒度分层；`config status` 只列层级 / 命中 / 来源 / 键路径、不打印配置值 | common | `docs/config.md`（合并粒度对照表）+ `docs/cli.md`（`config status` 报告字段说明） |
| C-32 | 现场路径形态须归一 | 生产代码对同一资源的不同路径书写形态做比对 / 归属判定时，须先取磁盘真实形态（`fs.realpathSync.native` 等）再比；纯字符串归一不替代真实形态归一，路径不存在时回退原串 | common | [common.md](./common.md) |
| C-33 | 类型检查须覆盖测试文件 | 类型检查单独走放开测试排除项的 `tsconfig.typecheck.json`（基础 `tsconfig.json` 已排除 `**/__tests__` 等），不得让测试文件落在盲区；eslint 与单测 / 构建不能替代 | common | `AGENTS.md`「验收方式」 |
| C-38 | 任务区不出现参考仓库名 | `.tasks/` 内文本指称外部仓库时一律用通用措辞（如「接入方仓库」「被参考仓库」），不得写实名；判据取「是否以具体名称指涉某个外部仓库」，与「跨仓库改动按视角判定」正交 | common | [common.md](./common.md) |
| C-40 | 文档信息架构 | 页面按用户任务排序而非上线时间；标题只写能力名不带版本号；单页正文 ≤150 行 / 12k 字符（总览页正文 ≤80 行，正文行不计表格 / 代码块 / 标题 / 空行，总行数 >300 仅作拆分提醒）；每页四段：用途与场景 / 常用命令 / 子命令与选项 / 边界与注意，参考类页面按字段或条目主题组织、不套命令页两段；总览页须有命令总览表与场景导航；页脚只列主题参考，导航交给主题 docFooter；自动生成页豁免 | common | [common.md](./common.md) |
| C-41 | AI 优先的人机体验 | 主要使用者是 AI；功能、输出、错误与文档先保证可解析、可自动化、可复用，再兼顾人的可读性与操作便利 | common | [common.md](./common.md) |
| C-42 | 多系统与多 Shell 支持 | 平台分支只允许出现在命令 / 路径生成与适配层，两平台分支各有单测；Windows 命令须同时满足 PowerShell 与 cmd，POSIX 须满足 bash / sh；文档与技能给多平台写法，不得单平台验证即标「已验证」 | common | [common.md](./common.md) |
| C-43 | 段落级可读性 | 正文单段单行 ≤120 字符、单句分号 ≤2 个、并列项 ≥5 个改列表或表格；例外降级为子项、长枚举不进句子；检测入口 `scripts/check-docs-readability.mjs` 挂 `pnpm verify`，与 `C-40`（页级）配套 | common | [common.md](./common.md) |

## 三、用法说明

- **载体形态**：本项目采用「溯源索引式」（条文在外部规则层，本载体只索引）；个别在项目现有规则层中无既有来源的条文按「条文式」落 `common.md`，属两式混用——逐条归属见索引「单一事实源」列（指向 `common.md` 者即条文式）。
- **本项目约定**：单端项目（任务 `scope` 取值仅 `toolkit`），规范全归 `common`，不设端分册与分类标签分册；分册按需创建，一览见索引「单一事实源」列。
- **读写与维护**：读面与读写判定、写入归属、语义修订与退休流程一律见 `skills/fxri-plan-to-task/references/conventions-spec.md`，本载体不另述。
- **技能已承载的条目不入索引**：规则全文已在随包分发的 `skills/` 内的，索引不再列行，直接按对应 SKILL.md 执行；本表只保留规则层与本仓治理类条目。
- **退休条目**：已退休条目的冻结语义见 `retired.md`（Z3 归档面，常规不读），索引不含任何退休条目。
