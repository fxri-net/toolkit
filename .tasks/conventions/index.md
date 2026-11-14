<!-- toolkit-conventions: v3 -->
# 项目协作规范索引

> 本文件为规范载体唯一入口与唯一权威：只凭本表判断「本轮任务适用哪些规范」，再按「归属」读对应分册。
> `history.md` / `retired.md` 属归档面，仅审计 / 恢复时读。

## 一、端清单

> 端名与任务 `scope` 取值共用同一套词表；保留字 `index` / `common` 不得作端名。本项目单端（仅 `toolkit`），规范按主题归属 `common` / `docs` / `testing` / `platform` / `hygiene`。

| 端名 | 说明 |
| --- | --- |

## 二、索引

> 读法：第三列写「何时适用 + 一句话要求」，命中即读其归属分册或单一事实源；无命中即止。

| ID | 规则 | 当前语义 | 归属 | 单一事实源 |
| --- | --- | --- | --- | --- |
| C-2 | 能力终点与授权 | 做任务收尾时：归档 + 沉淀即终点，提交自动执行，发版与推送须明确授权 | common | `docs/rules/ai.md` 稳定纪律 |
| C-6 | 细节只进 skills | 写规则时：可变流程只进 skills，规则层不复述，防用户快照失同步 | common | `AGENTS.md` 质量门 5 |
| C-7 | 触达核对前置 | 改能力或措辞前：先 grep 全仓定位触达点并另列仓库外平台侧（仓库简介 / social preview / npm 页），影响范围逐篇核对 | common | `AGENTS.md` 质量门 2 |
| C-8 | 文档三层职责 | 写文档或规则时：手册＝用户视图、skills＝细节真源、`ai.md`＝薄壳 | common | `docs/rules/ai.md`、`AGENTS.md` 质量门 5 |
| C-12 | 输出分流 | 对外输出：stdout 只放数据，诊断走 stderr | common | `docs/cli.md`、`docs/config/update.md`、`docs/config/skills.md` |
| C-13 | 验收含类型与静态检查 | 定验收时：类型检查与静态检查属 `pnpm verify` 步骤，不得用 lint / build 替代 | common | `AGENTS.md` 验收方式 |
| C-14 | 路径书写 | 写仓库引用时：用仓库根相对路径；本机绝对路径仅 active 暂留、归档归一 | common | `AGENTS.md` 协作流程约束 |
| C-15 | 规则层更新锚点 | 改规则层：同步锚点、同批同时间、发版不抬 | common | `SPEC.md`、`templates/rules/*.md`、`docs/rules/*.md`、`AGENTS.md` 门 6 |
| C-16 | 提交规则单一真源 | 改提交信息规则时：真源为 `templates/rules/commit.md`，两处投影逐字同步 | common | `templates/rules/commit.md` 及两处投影 |
| C-17 | 测试不复刻实现 | 写派生 / 镜像逻辑测试时：期望直接调用真实实现，不在测试内重写 | common | `AGENTS.md` 验收方式 |
| C-22 | 门禁单源与时点 | 改验收或发版：只认 `verify.mjs`，关卡发布前，归档→验收→提交 | common | `AGENTS.md`、`scripts/verify.mjs`、`task-spec.md` §6 |
| C-23 | 测试现场形态 | 写模拟现场的测试时：每种真实现场形态都要有用例，不得只造一种 | testing | `common.md` |
| C-25 | 版本括注 | 写文档时：版本括注只标单一能力点首次引入且紧邻对象，演进史交 CHANGELOG | docs | `common.md` |
| C-26 | 降级不静默 | 处理用户显式传值时：无法采纳须 stderr 告警并说明回落，否则非 0 退出 | common | `AGENTS.md` 协作流程约束 |
| C-28 | 规则落门禁 | 新增可检出要求时：同批补检测入口，且置于不可逆动作之前 | common | `common.md` |
| C-29 | 门禁环境无关 | 新增或改门禁步骤时：固定时区等环境变量，合成数据 UTC、真实任务数据东八区 | common | `common.md` |
| C-30 | 配置分层 | 读写配置时：三层（全局→项目→本地）分层覆盖，`config status` 只列来源不打印值 | common | `docs/config.md`、`docs/cli.md` |
| C-32 | 路径形态归一 | 比对路径或判归属时：先取磁盘真实形态再比，纯字符串归一不算 | platform | `common.md` |
| C-33 | 类型检查覆盖测试 | 配置类型检查时：测试文件须纳入，走放开排除项的 `tsconfig.typecheck.json` | common | `AGENTS.md` 验收方式 |
| C-38 | 任务区不写外仓名 | 写任务区文本时：指称外部仓库用通用措辞，不写实名 | hygiene | `common.md` |
| C-40 | 文档信息架构 | 写文档页面时：按任务组织、正文 ≤150 行 / 12k 字符、精简不失真、四段模板 | docs | `common.md` |
| C-41 | AI 优先 | 设计输出与文档时：先保证可解析、可自动化，再兼顾人的可读性 | common | `common.md` |
| C-42 | 多系统与多 Shell | 写命令或平台分支时：平台差异只进适配层，两平台各有单测，文档给多平台写法 | platform | `common.md` |
| C-43 | 段落级可读性 | 写正文段落时：单行 ≤120 字符、单句分号 ≤2 个、并列 ≥5 改列表 | docs | `common.md` |

## 三、用法说明

- **载体形态**：以溯源索引式为主，个别无外部来源的条文落分册（见「单一事实源」列）。
- **本项目**：单端 `toolkit`；条文按主题分册承载（见索引归属列），`common` 只放跨面原则。
- **读写与维护**：读取与写入判定见 `skills/fxri-plan-to-task/references/conventions-spec.md`；退休条目看 `retired.md`，常规不读。
- **技能已承载的条目不入索引**：规则全文已在随包 `skills/` 内的，直接按对应 SKILL.md 执行。
