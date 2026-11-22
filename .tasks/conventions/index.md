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
| C-2 | 能力终点与授权 | 做任务收尾时：归档 + 沉淀即终点，提交默认需确认（`personal` 模块可覆写为自动提交），发版与推送须明确授权；写方向须命中开工词 + 范围明确 + 方案已定稿才动手，只读请求按意图判 | common | [ai.md](../../docs/rules/ai.md) 稳定纪律、[personal.md](../../templates/rules/personal.md) |
| C-6 | 细节只进 skills | 写全局规则快照时：只做薄引用，可变流程细节只进 skills；`personal` 只收可被其它模块默认值覆写的偏好且覆写成对，不得按「非稳定纪律」删除，通用纪律与真源指向不得入内；与 C-48 配套 | common | [AGENTS.md](../../AGENTS.md) 质量门 5 |
| C-7 | 触达核对前置 | 改能力或措辞前：先 grep 全仓定位触达点并另列仓库外平台侧（仓库简介 / social preview / npm 页），影响范围逐篇核对；触达面清单以 `scripts/touch-surface.mjs` 为单源 | common | [AGENTS.md](../../AGENTS.md) 质量门 2、`scripts/touch-surface.mjs` |
| C-13 | 验收含类型与静态检查 | 定验收时：类型检查与静态检查属 `pnpm verify` 步骤，不得用 lint / build 替代 | common | [AGENTS.md](../../AGENTS.md) 验收方式 |
| C-14 | 路径书写 | 写仓库引用时：用仓库根相对路径；本机绝对路径仅 active 暂留、归档归一 | common | [AGENTS.md](../../AGENTS.md) 协作流程约束 |
| C-15 | 规则层更新锚点 | 改规则层：同步锚点、同批同时间、发版不抬 | common | [SPEC.md](../../SPEC.md)、`templates/rules/*.md`、`docs/rules/*.md`、[AGENTS.md](../../AGENTS.md) 门 6 |
| C-16 | 提交规则单一真源 | 改提交信息规则时：真源为 `templates/rules/commit.md`，两处投影逐字同步 | common | [commit.md](../../templates/rules/commit.md) 及两处投影 |
| C-17 | 测试不复刻实现 | 写派生 / 镜像逻辑测试时：期望直接调用真实实现，不在测试内重写 | common | [AGENTS.md](../../AGENTS.md) 验收方式 |
| C-22 | 门禁单源与时点 | 改验收或发版：只认 `verify.mjs`，关卡发布前，归档→验收→提交 | common | [AGENTS.md](../../AGENTS.md)、`scripts/verify.mjs`、[task-spec.md](../../skills/fxri-plan-task/references/task-spec.md) §6 |
| C-23 | 测试现场形态 | 写模拟现场的测试时：每种真实现场形态都要有用例，不得只造一种（路径写法含真实路径与链接别名） | testing | [testing.md](./testing.md) |
| C-25 | 版本括注 | 写文档时：版本括注只标单一能力点首次引入且紧邻对象，演进史交 CHANGELOG | docs | [docs.md](./docs.md) |
| C-26 | 降级不静默 | 处理用户显式传值时：无法采纳须 stderr 告警并说明回落，否则非 0 退出 | common | [AGENTS.md](../../AGENTS.md) 协作流程约束 |
| C-28 | 规则落门禁 | 新增可检出要求时：同批补检测入口，且置于不可逆动作之前 | common | [common.md](./common.md) |
| C-29 | 门禁环境无关 | 新增或改门禁步骤时：固定时区等环境变量，合成数据 UTC、真实任务数据东八区 | common | [common.md](./common.md) |
| C-30 | 配置分层 | 读写配置时：三层（全局→项目→本地）分层覆盖，`config status` 只列来源不打印值；可写键与默认值以 `src/config-keys.ts` 为单源 | common | [config.md](../../docs/config.md)、[cli.md](../../docs/cli.md)、`src/config-keys.ts` |
| C-32 | 路径归一适用范围 | 判断磁盘同一性时：取真实形态再比；用户规则匹配时：只用字符串归一，不解析符号链接 | platform | [platform.md](./platform.md) |
| C-33 | 类型检查覆盖测试 | 配置类型检查时：测试文件须纳入，走放开排除项的 `tsconfig.typecheck.json` | common | [AGENTS.md](../../AGENTS.md) 验收方式 |
| C-38 | 任务区不写外仓名 | 写任务区文本时：指称外部仓库用通用措辞，不写实名；「只记本仓内容」与「不写他仓名」是两条独立判据，条文同在本条 | hygiene | [hygiene.md](./hygiene.md) |
| C-40 | 文档信息架构 | 写文档页面时：按任务组织、正文体量上限指向 `scripts/check-docs-readability.mjs` 常量、精简不失真、四段模板 | docs | [docs.md](./docs.md) |
| C-41 | AI 优先 | 设计输出与文档时：先保证可解析、可自动化，再兼顾人的可读性 | common | [common.md](./common.md) |
| C-42 | 多系统与多 Shell | 写命令或平台分支时：平台差异只进适配层，两平台各有单测，文档给多平台写法 | platform | [platform.md](./platform.md) |
| C-43 | 段落级可读性 | 写正文段落时：单行长度与分号数上限指向 `scripts/check-docs-readability.mjs` 常量、并列 ≥5 改列表 | docs | [docs.md](./docs.md) |
| C-44 | 自检脚本配假现场 | 改 `scripts/check-*.mjs` 时：每个新增或修改的校验都要有假现场用例（合规通过 / 违规报出），容错分支同样要锁 | testing | [testing.md](./testing.md) |
| C-45 | 命名与封装统一 | 写代码或命名时：动词族与谓词形态固定、参数用 options/config、当前源码不用 fx 前缀（新增前缀须先立目录与白名单）、全局命名带 FX_TOOLKIT_ 标识；展示基建须收敛单模块并落门禁；兼容读取须写明移除版本 | common | [common.md](./common.md) |
| C-46 | 运行时版本基线 | 写代码时：以 engines 为唯一基线、只用基线已稳定 API、最低版本须有 CI 回归入口、类型声明与基线一致 | platform | [platform.md](./platform.md) |
| C-47 | 交互与入口统一 | 新增或改命令入口 / 交互时：交互走 `cli-ui` 基座，写操作预览 + 确认 + `--yes`，裸命令按域类型给视图，入口矩阵以 `docs/cli.md` 为准 | common | [common.md](./common.md)、[cli.md](../../docs/cli.md) |
| C-48 | 单一真源与事实注册表 | 改代码、文档或技能前：同一事实只留一个 owner，按派生 > 指针 > 生成 > 校验选手段，用户可见事实不得只放本仓，新增事实先登记 `F-<n>` | common | [common.md](./common.md) C-48 |
| C-49 | 离线自包含 | 写技能或工具提示时：规范正文、候选清单与升级步骤随包分发，技能内远端链接须标可选，跨技能引用带兜底，升级提示给本地入口 | common | [common.md](./common.md) C-49、`scripts/check-consistency.mjs` |

## 三、用法说明

- **载体形态**：以溯源索引式为主，个别无外部来源的条文落分册（见「单一事实源」列）。
- **本项目**：单端 `toolkit`；条文按主题分册承载（见索引归属列），`common` 只放跨面原则。
- **读写与维护**：读取与写入判定见 `skills/fxri-plan-task/references/conventions-spec.md`；退休条目看 `retired.md`，常规不读。
- **技能已承载的条目不入索引**：规则全文已在随包 `skills/` 内的，直接按对应 SKILL.md 执行。
