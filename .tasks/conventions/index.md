<!-- toolkit-conventions: v3 -->
# 项目协作规范索引

> 本文件为规范载体唯一入口与唯一权威；规范全貌见下方索引，条文见各分册。
> 读面纪律：`history.md` / `retired.md` 属归档面，仅在审计 / 恢复时读，不在常规读面。

## 一、端清单

> 端名与任务 frontmatter `scope` 取值共用同一套词表；保留字 `index` / `common` 不得作端名。本项目单端（`scope` 取值仅 `toolkit`），规范全归 `common`。

| 端名 | 说明 |
| --- | --- |

## 二、索引

| ID | 规则 | 当前语义 | 归属 | 单一事实源 |
| --- | --- | --- | --- | --- |
| C-1 | 四级时间源 | 时间取证优先级：当场打点 > 聊天记录时间戳 > git 提交时间 > 系统时间兜底（标注「收尾补记」） | common | `skills/fxri-plan-to-task/references/task-spec.md`（口径随版本走） |
| C-2 | 能力终点 = 沉淀 + 自动提交 | 任务终结 → 归档 → 规范沉淀 → 收尾提交自动执行；推送与发版须用户明确 | common | `docs/ai-rules.md` 稳定纪律（作者个人收紧，可裁剪） |
| C-3 | conventions 唯一落点 | 任务级与会话级规范写同一载体，`index.md` 为唯一入口与唯一权威；演进记录独立 `history.md`（仅追加、不改旧行） | common | `skills/fxri-plan-to-task/references/conventions-spec.md`（载体结构）+ `skills/fxri-plan-to-task/references/task-spec.md`（目录树） |
| C-4 | 近窗时间连续性 | 恢复时 ≥1 年空洞隔断的旧归档仅入全量索引、不精读；active 任务 updated 距今 >1 年标注疑似搁置 | common | `skills/fxri-session-recap/SKILL.md`（模式二） |
| C-5 | 触发靠语义不靠字面 | skill 以意图画像 + 近义表达触发并带反例排除；个人口头禅不进通用触发词 | common | 各 fxri-* SKILL.md 的 `description` |
| C-6 | 规则细节只进 skills | 可变流程细节只进 skills，不在 ai-rules 等规则层复述，防用户侧规则快照失同步 | common | `AGENTS.md` 质量门第 5 条 |
| C-7 | 触达核对前置到方案确认 | 能力 / 措辞变更前先 grep 全仓库定位触达点，影响范围按文档清单逐篇核对（已同步 / 无触达及理由） | common | `AGENTS.md` 质量门第 2 条 |
| C-8 | 文档三层职责分离 | 操作手册 = 用户视图层；fxri-* skills = 可变细节唯一演进源；ai-rules.md = 薄壳稳定纪律 + 对 skills 的引用 | common | `docs/ai-rules.md`（配套说明）+ `AGENTS.md` 质量门第 5 条 |
| C-9 | 阻塞解除归属 | 进入阻塞在正文记录原因；解除须用户确认并转回进行中，正文记录解除原因 | common | `skills/fxri-plan-to-task/SKILL.md`（过程更新） |
| C-10 | 修订留痕（元规则） | 规则语义变更不覆盖丢史：先在 `history.md` 留痕，再更新表内当前语义 | common | [history.md](./history.md) |
| C-11 | 技能单一真源与同源分发 | 包内 `skills/` 为技能唯一真源、随包同源分发（与 CLI 同一发布批次），改 skills 须发版才触达用户；技能版本双写位（frontmatter `metadata.version` 与正文首部）须一致 | common | `skills/README.md`（安装方式）+ `AGENTS.md` 质量门第 5 条 |
| C-12 | 机器可读输出与诊断提示分流 | stdout 只承载机器可读内容（如 `--format json`），提示与诊断（升级提示、链接自愈提示）一律走 stderr | common | `docs/cli.md`（`--format json` 行）+ `docs/config.md`（updateCheck / skills 段） |
| C-13 | 验收含类型检查与静态检查 | 类型检查与静态检查是聚合门禁 `pnpm verify` 的内部步骤（步骤定义见 `scripts/verify.mjs`）；不得以 `pnpm lint` / `pnpm build` 替代类型检查 | common | `AGENTS.md`「验收方式」 |
| C-14 | 路径书写 | 仓库内引用用仓库根相对路径（含行号形如 `src/cli.ts L103`），不写指向本机的绝对 `file:///` 链接；active 可留本机资源路径，归档时归一为占位形式（`<本机>/…`、`~/` 或 `%USERPROFILE%`） | common | `AGENTS.md`「协作流程约束」 |
| C-15 | 规则层更新锚点 | `SPEC.md` / `docs/ai-rules.md` / `docs/commit-rules.md` 各有一行更新锚点，位于规则全文可复制块内部首行；任何内容变更以变更时刻更新所属文件锚点、未变更不刷新、同批取同一时间、不随发版例行抬高 | common | `SPEC.md` 首部 + `docs/ai-rules.md` 与 `docs/commit-rules.md` 规则全文首行 + `AGENTS.md` 质量门第 6 条 |
| C-16 | 提交信息规则单一真源与独立成页 | 真源为 `.trae/rules/git-commit-message.md`（本仓库自用、不随包分发）；`docs/commit-rules.md` 为其用户侧投影，正文逐字一致、可单独复制采用，两处同步变更 | common | `.trae/rules/git-commit-message.md`（真源）+ `docs/commit-rules.md`（投影） |
| C-17 | 测试不复刻被测实现 | 派生 / 镜像类逻辑的测试期望须直接调用真实实现，不得在测试内重写同一份转换逻辑（同错复刻会掩盖实现缺陷） | common | `AGENTS.md`「验收方式」 |
| C-18 | CHANGELOG 历史块归一 | 发版链路步骤 1 人工润色后跑一次 `changelog --history format`，把历史块内多余空行归一；归类只重组识别到的语义分区、未识别标题连同条目原样保留，并做条目数自检 | common | `AGENTS.md`「发版链路」步骤 1 + `skills/fxri-release-changelog/SKILL.md` |
| C-19 | 建档判据 = 仓库文件改动 | 同主题判别取客观口径：看本次是否产生仓库文件改动（增 / 改 / 删计入，纯读取 / 执行 / 汇报不计入）；有改动则建档（延续标来源链），无则不重复建档、提示已归档日期后直接执行 | common | `SPEC.md` 协作模型第 1 条 + `skills/fxri-plan-to-task/SKILL.md`（判别表） |
| C-20 | 收尾动作不算任务 | 提交 / 发版 / 推送 / 部署等收尾动作本身及其固有产物（版本号 / 更新日志 / 标签）不构成任务、不单独建档 | common | `SPEC.md` 协作模型第 3 条 + `docs/ai-rules.md` 稳定纪律 |
| C-21 | 归档块不可变 + 事实更正例外 | 已归档块不追加内容、元数据行冻结；唯一例外是事实更正——正文末尾追加「修订记录」保留原结论，口径变更类可改受影响事实字段 | common | `SPEC.md` 协作模型第 1 条 + `skills/fxri-plan-to-task/references/task-spec.md`（第 6 节） |
| C-22 | 门禁单源与时点 | 验收步骤清单唯一真源为 `scripts/verify.mjs`、以 `pnpm verify` 暴露，本地与四处 CI 共用，不得另写步骤枚举；关卡设在发布前；任务收尾顺序为「归档与沉淀 → 验收 → 提交」 | common | `AGENTS.md`「验收方式」+「发版链路」+「协作流程约束」+ `scripts/verify.mjs` + `skills/fxri-release-changelog/SKILL.md` + `skills/fxri-plan-to-task/references/task-spec.md`（第 6 节） |
| C-23 | 测试假现场须与真实现场形态一致 | 模拟现场的假数据须与真实形态一致；被测逻辑对现场形态存在分支判据时，每种真实形态都要有对应用例 | common | [common.md](./common.md) |
| C-24 | conventions 入口壳（一阶触发面） | 载体可另配项目级入口壳 `toolkit-conventions/SKILL.md`（只作入口、指回索引）；`toolkit init` 幂等生成、按标记版本分流；壳标记陈旧或被 gitignore 覆盖时告警 | common | `skills/fxri-plan-to-task/references/conventions-spec.md`（§1 载体结构） |
| C-25 | 版本括注口径 | `（x.y.z 新增）` 类括注只标命令 / 技能 / 配置项 / 单一能力点的首次引入版本且紧邻该对象；跨版本演进清单不挂句末括注，扩展史由 `CHANGELOG.md` 承载 | common | [common.md](./common.md) |
| C-26 | 降级不静默 | 用户显式传入的值（CLI 选项值、配置文件项）无法采纳时不得静默忽略：能继续执行则 stderr 告警「忽略了什么、回落到什么」，无法继续则报错并以非 0 退出码终止 | common | `AGENTS.md`「协作流程约束」+ `docs/cli.md`（`--status` / `--lang` / `--format` 行） |
| C-27 | 变更集条目类型前缀与归档前检测 | 变更集条目一律以 `类型：` 前缀开头（只按顶层 `- ` 条目判定）；`tasks check` 在归档前扫 `.changeset/` 报出缺前缀条目数与首条行号 | common | `AGENTS.md` 质量门第 4 条 + `skills/fxri-release-changelog/SKILL.md` |
| C-28 | 规则落门禁 | 规则层新增 / 强化「可自动检出」的要求时，或复核发现既有要求无检测入口时，须同批补落检测入口（`tasks check` / `pnpm verify`）且置于不可逆动作之前 | common | [common.md](./common.md) |
| C-29 | 门禁与测试的环境无关性 | `pnpm verify` 各步须与运行环境无关（hermetic），涉时间比对的测试 / 步骤固定时区口径、按数据来源分两轴：合成数据钉 `TZ=UTC`，读真实任务数据钉 `TZ=Asia/Shanghai` | common | [common.md](./common.md) |
| C-30 | 配置分层 | 三层配置模型：全局 `~/.toolkitrc.json`（段级整体覆盖）→ 项目 `.toolkitrc.json`（向上查最近一份）→ 本地 `.toolkitrc.local.json`（止于 home、默认不入库）；合并粒度分层；`config status` 只列层级 / 命中 / 来源 / 键路径、不打印配置值 | common | `docs/config.md`（合并粒度对照表）+ `docs/cli.md`（`config status` 报告字段说明） |
| C-31 | 变更集级别判定（按能力量级） | 版本号由变更集 bump 声明决定、与条目前缀正交：破坏性→major、全新大功能 / 独立新能力→minor、存量能力上的修补与增量→patch；不得为凑版本号降级 | common | `skills/fxri-release-changelog/references/changelog-format.md` |
| C-32 | 现场路径形态须归一 | 生产代码对同一资源的不同路径书写形态做比对 / 归属判定时，须先取磁盘真实形态（`fs.realpathSync.native` 等）再比；纯字符串归一不替代真实形态归一，路径不存在时回退原串 | common | [common.md](./common.md) |
| C-33 | 类型检查须覆盖测试文件 | 类型检查单独走放开测试排除项的 `tsconfig.typecheck.json`（基础 `tsconfig.json` 已排除 `**/__tests__` 等），不得让测试文件落在盲区；eslint 与单测 / 构建不能替代 | common | `AGENTS.md`「验收方式」 |
| C-34 | 项目面技能分发与真源薄壳 | `skills install` / `status` / `remove` 按 CLI 安装位置自动判定作用域（可 `--scope` 覆盖）；项目面采用「唯一真源 + 多份入口薄壳」；`init` 幂等写 `prepare` 钩子，并附发布型包误打包检查（只提示、不代改） | common | `docs/guide.md`（项目面分发）+ `docs/cli.md`（`skills --scope` / `init --no-hooks`）+ `docs/faq.md` + `skills/README.md` |
| C-35 | 表格形态（紧凑为规范形态） | 载体内所有表格一律紧凑形态（单元格间只留一个空格、不做列对齐填充）；`init` 托管 `.prettierignore` 从源头阻止填充，存量用 `conventions format` 归一、`status` / `check` 检出 | common | `skills/fxri-plan-to-task/references/conventions-spec.md`（§9 表格形态） |
| C-36 | 跨仓库改动各自归档 | 任务档只记本仓的改动与动机；同一会话涉及多仓时各仓各自建档归档；判据取视角（描述的是不是本仓的改动），依赖包名 / 被调接口名等本仓事实者照写 | common | `SPEC.md` 协作模型第 5 条 + `docs/ai-rules.md` 稳定纪律 + `skills/fxri-plan-to-task/SKILL.md`（建档评估） |
| C-37 | 载体文风与模板 | 索引头注固定两行、用法说明固定三段骨架、「单一事实源」列按载体内 / 外二分写法、分册条文固定「要求 → 反例 → 理由 → 配套」四子项且不写「确立来源」、规范词按 `须` / `应` / `可` / `不得` 分级、标识符与路径一律行内代码 | common | `skills/fxri-plan-to-task/references/conventions-spec.md`（§13 载体文风与模板） |
| C-38 | 任务区不出现参考仓库名 | `.tasks/` 内文本指称外部仓库时一律用通用措辞（如「接入方仓库」「被参考仓库」），不得写实名；判据取「是否以具体名称指涉某个外部仓库」，与 `C-36` 的视角判据正交 | common | [common.md](./common.md) |

## 三、用法说明

- **载体形态**：本项目采用「溯源索引式」（条文在外部规则层，本载体只索引）；个别在项目现有规则层中无既有来源的条文按「条文式」落 `common.md`，属两式混用——逐条归属见索引「单一事实源」列（指向 `common.md` 者即条文式）。
- **本项目约定**：单端项目（任务 `scope` 取值仅 `toolkit`），规范全归 `common`，不设端分册与分类标签分册；分册按需创建，一览见索引「单一事实源」列。
- **读写与维护**：读面与读写判定、写入归属、语义修订与退休流程一律见 `skills/fxri-plan-to-task/references/conventions-spec.md`，本载体不另述。
