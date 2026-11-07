# 规范退休记录

> 元规则：条目作废即从 `index.md` 迁出至本表并冻结退休时语义；编号不回收（见 `skills/fxri-plan-to-task/references/conventions-spec.md` §8）。本表属 Z3 归档、不进常规读面。

| ID | 规则 | 退休时语义（冻结） | 归属 | 后继 | 退休来源任务 | 条文去向 |
| --- | --- | --- | --- | --- | --- | --- |
| `C-31` | 变更集级别判定（按能力量级） | 版本号由变更集 bump 声明决定、与条目前缀正交：破坏性→major、全新大功能 / 独立新能力→minor、存量能力上的修补与增量→patch；不得为凑版本号降级 | common | — | 20261107-唐启云-调整版本级别判定口径 | 外部单一事实源 `skills/fxri-release-changelog/references/changelog-format.md` 改写为「版本口径」小节（用户影响阶梯 + SemVer 偏离 + 迁移护栏）；索引行删除，载体内无分册小节 |
| `C-1` | 四级时间源 | 时间取证优先级：当场打点 > 聊天记录时间戳 > git 提交时间 > 系统时间兜底（标注「收尾补记」） | common | — | 20261107-唐启云-退休技能已覆盖的规范条目 | 技能已完整承载 `skills/fxri-plan-to-task/references/task-spec.md`；索引行删除，载体内无分册小节 |
| `C-3` | conventions 唯一落点 | 任务级与会话级规范写同一载体，`index.md` 为唯一入口与唯一权威；演进记录独立 `history.md`（仅追加、不改旧行） | common | — | 20261107-唐启云-退休技能已覆盖的规范条目 | 技能已完整承载 `skills/fxri-plan-to-task/references/conventions-spec.md` 与 `task-spec.md`；索引行删除 |
| `C-4` | 近窗时间连续性 | 恢复时 ≥1 年空洞隔断的旧归档仅入全量索引、不精读；active 任务 updated 距今 >1 年标注疑似搁置 | common | — | 20261107-唐启云-退休技能已覆盖的规范条目 | 技能已完整承载 `skills/fxri-session-recap/SKILL.md`（模式二）；索引行删除 |
| `C-5` | 触发靠语义不靠字面 | skill 以意图画像 + 近义表达触发并带反例排除；个人口头禅不进通用触发词；触发判据优先取上下文中可观测的事实（动作、产物类型、写入通道、症状），临时 / 一次性 / 不入库不构成豁免 | common | — | 20261107-唐启云-退休技能已覆盖的规范条目 | 各 fxri-* SKILL.md 的 `description` 承载；缺口句先补进 `skills/README.md`，索引行删除 |
| `C-9` | 阻塞解除归属 | 进入阻塞在正文记录原因；解除须用户确认并转回进行中，正文记录解除原因 | common | — | 20261107-唐启云-退休技能已覆盖的规范条目 | 技能已完整承载 `skills/fxri-plan-to-task/SKILL.md`（过程更新）；索引行删除 |
| `C-10` | 修订留痕（元规则） | 规则语义变更不覆盖丢史：先在 `history.md` 留痕，再更新表内当前语义 | common | — | 20261107-唐启云-退休技能已覆盖的规范条目 | `history.md` 首部元规则与 `skills/fxri-plan-to-task/references/conventions-spec.md` 承载；索引行删除 |
| `C-11` | 技能单一真源与同源分发 | 包内 `skills/` 为技能唯一真源、随包同源分发（与 CLI 同一发布批次），改 skills 须发版才触达用户；技能版本双写位（frontmatter `metadata.version` 与正文首部）须一致 | common | — | 20261107-唐启云-退休技能已覆盖的规范条目 | `skills/README.md`（安装方式与版本声明）+ `AGENTS.md` 质量门第 3 条承载；缺口句先补进 `skills/README.md`，索引行删除 |
| `C-18` | CHANGELOG 历史块归一 | 发版链路步骤 1 人工润色后跑一次 `changelog format --history`，把历史块内多余空行归一；归类只重组识别到的语义分区、未识别标题连同条目原样保留，并做条目数自检 | common | — | 20261107-唐启云-退休技能已覆盖的规范条目 | 技能已完整承载 `skills/fxri-release-changelog/SKILL.md`；索引行删除 |
| `C-19` | 建档判据 = 仓库文件改动 | 同主题判别取客观口径：看本次是否产生仓库文件改动（增 / 改 / 删计入，纯读取 / 执行 / 汇报不计入）；有改动则建档（延续标来源链），无则不重复建档、提示已归档日期后直接执行 | common | — | 20261107-唐启云-退休技能已覆盖的规范条目 | 技能已完整承载 `skills/fxri-plan-to-task/SKILL.md`（判别表）；索引行删除 |
| `C-20` | 收尾动作不算任务 | 提交 / 发版 / 推送 / 部署等收尾动作本身及其固有产物（版本号 / 更新日志 / 标签）不构成任务、不单独建档 | common | — | 20261107-唐启云-退休技能已覆盖的规范条目 | 技能已完整承载 `skills/fxri-plan-to-task/SKILL.md`（建档评估）；索引行删除 |
| `C-21` | 归档块不可变 + 事实更正例外 | 已归档块不追加内容、元数据行冻结；唯一例外是事实更正——正文末尾追加「修订记录」保留原结论，口径变更类可改受影响事实字段 | common | — | 20261107-唐启云-退休技能已覆盖的规范条目 | 技能已完整承载 `skills/fxri-plan-to-task/references/task-spec.md`（第 6 节）；索引行删除 |
| `C-24` | conventions 入口壳（一阶触发面） | 载体可另配项目级入口壳 `toolkit-conventions/SKILL.md`（只作入口、指回索引）；`toolkit init` 幂等生成、按标记版本分流；壳标记陈旧或被 gitignore 覆盖时告警 | common | — | 20261107-唐启云-退休技能已覆盖的规范条目 | 技能已完整承载 `skills/fxri-plan-to-task/references/conventions-spec.md`（§1）；索引行删除 |
| `C-27` | 变更集条目书写与归档前检测 | 变更集条目一律逐条以 `- 类型：描述` 书写——`- ` 列表标记让每条独立成条、`类型：` 前缀作归类信号（裸行会被 changesets 并入相邻条目作续行）；`tasks check` 在归档前扫 `.changeset/` 报出缺前缀条目数与未加 `- ` 标记的裸行（阈值 2 行起）及各自条数 / 行号 | common | — | 20261107-唐启云-退休技能已覆盖的规范条目 | 技能已完整承载 `skills/fxri-release-changelog/SKILL.md` 与 `references/changelog-format.md`；索引行删除 |
| `C-34` | 项目面技能分发与真源薄壳 | `skills install` / `status` / `remove` 按 CLI 安装位置自动判定作用域（可 `--scope` 覆盖）；项目面采用「唯一真源 + 多份入口薄壳」；`init` 幂等写 `prepare` 钩子，并附发布型包误打包检查（只提示、不代改） | common | — | 20261107-唐启云-退休技能已覆盖的规范条目 | `skills/README.md` 承载分发形态；误打包检查缺口句先补进 `skills/README.md`，索引行删除 |
| `C-35` | 表格形态（紧凑为规范形态） | 载体内所有表格一律紧凑形态（单元格间只留一个空格、不做列对齐填充）；`init` 托管 `.prettierignore` 从源头阻止填充，存量用 `conventions format` 归一、`status` / `check` 检出 | common | — | 20261107-唐启云-退休技能已覆盖的规范条目 | 技能已完整承载 `skills/fxri-plan-to-task/references/conventions-spec.md`（§9）；索引行删除 |
| `C-36` | 跨仓库改动各自归档 | 任务档只记本仓的改动与动机；同一会话涉及多仓时各仓各自建档归档；判据取视角（描述的是不是本仓的改动），依赖包名 / 被调接口名等本仓事实者照写 | common | — | 20261107-唐启云-退休技能已覆盖的规范条目 | 技能已完整承载 `skills/fxri-plan-to-task/references/task-spec.md` 与 `SKILL.md`；索引行删除 |
| `C-37` | 载体文风与模板 | 索引头注固定两行、用法说明固定三段骨架、「单一事实源」列按载体内 / 外二分写法、分册条文固定「要求 → 反例 → 理由 → 配套」四子项且不写「确立来源」、规范词按 `须` / `应` / `可` / `不得` 分级、标识符与路径一律行内代码 | common | — | 20261107-唐启云-退休技能已覆盖的规范条目 | 技能已完整承载 `skills/fxri-plan-to-task/references/conventions-templates.md`（T1–T6）；索引行删除 |
| `C-39` | 开工门槛与逐任务交付 | 方案确认后、动手前先任务分解（一个任务 = 可独立验收、可独立回滚、单独提交后仓库自洽的最小交付单元，且不跨仓库）；两个及以上任务先出纯展示计划表（跨端跨仓同表、标明仓库与先后、不落档）；随后逐仓逐任务建档，按表顺序逐个交付、逐个任务提交，不跨任务攒批；任务粒度只约束任务与提交单元，不约束发版范围，一次发版可包含多个任务与多个变更集 | common | — | 20261107-唐启云-退休技能已覆盖的规范条目 | 技能已完整承载 `skills/fxri-plan-to-task/SKILL.md`（工作流第 0–1 步）；索引行删除 |
