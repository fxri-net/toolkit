---
outline: [2, 2]
---

# 更新日志

> 完整变更历史以根 `CHANGELOG.md` 为准，本页由 `toolkit changelog doc` 自动同步，请勿手改。

## 1.16.12

> 2026-11-12 发布

### ✨ 新增功能

- `docs` 配置段，导航阈值、产物目录、sitemap 策略与搜索实现可在 `.toolkitrc` 中覆盖，默认值即规范口径
- `docs.rules` 按规则 id 覆盖严重度或关闭规则，命令输出打印覆盖清单
- `site-nav.json` 支持对象形态侧栏（多路径侧栏）与 `locales` 多语言结构
- `docs.nav.locales` 为各语言包声明首末项与帮助必备项，未声明时只跑语言无关规则并告警
- `docs nav init` 迁移助手，从站点配置抽取 `nav` / `sidebar` 字面量生成 `site-nav.json`
- `nav/config-not-wired` 规则，站点配置未引用 `site-nav.json` 时报错，避免改数据不生效的假绿

### ⚡ 优化改进

- 导航与产物校验的规则版本分别升至 `1.4.0` 与 `1.1.0`，并明确「规则或结构变更须递增」的纪律
- 助手遇到变量引用、函数调用、展开语法等动态写法时直接报错，不落半截文件
- 检测到 `locales` 多语言配置时拒绝自动抽取，避免把单个语言包误当成全站数据

### 🐛 问题修复

- 未校验搜索索引时不再宣称索引通过，输出如实标注
- 多语言站的导航校验输出标明语言包数量，不再把首个语言包当成全站
- `docs nav check` 的结构定义允许顶栏下拉再分一级，避免二级分组导航被误判为结构错误
- 导航结构定义补齐 VitePress 官方的 `activeMatch` / `rel` / `target` / `noIcon` / `base` / `docFooterText`，不再把合法字段判为未知字段
- 检查器遇到未支持的 schema 关键字时直接报错，不再静默忽略

### 📝 文档更新

- 升级提示跳过清单同步为 `docs` 全域，补规则版本对照表与主题不参与规则覆盖的说明

## 1.16.11

> 2026-11-12 发布

### ✨ 新增功能

- `docs nav check` 与 `docs dist check`，文档站导航与产物校验随包分发为单一实现，各站点不再各自维护校验脚本
- 随包分发 `schemas/site-nav.schema.json`，导航数据改为 `docs/site-nav.json` 单一真源，`docs nav check` 先校验结构再判定规则

### ⚡ 优化改进

- CLI 按能力域拆分为 `src/commands/` 九个独立模块（skills / init / tasks / changelog / conventions / config / docs / rules），`cli.ts` 由 2536 行收敛为 116 行的命令装配入口
- `skills` 的源能力与安装流程按职责拆分到独立子模块，原文件保留为统一出口
- `usage` 子命令按组拆分，`commands.ts` 由 995 行收敛为 32 行的域入口；`tasks` 校验按类别拆分，`validate.ts` 保留公开出口与编排
- 命令顺序、help 文案、退出码与输出逐字不变；新增 81 条 CLI 行为基线快照用例持续守护
- `docs nav check` 支持 `--format json`，输出含独立于包版本的 `ruleVersion`
- 删去重复的静态 `sitemap.transformItems` 断言，404 排除由产物断言覆盖

## 1.16.10

> 2026-11-12 发布

### ✨ 新增功能

- `toolkit tasks archive --task <唯一键>` 只归档指定任务，键不存在或未终结时报错退出
- 项目面旧名副本命中曾用名时，`skills status` 标注「已改名为 X，确认后手工删除」（只提示，不自动删除）
- fxri-plan-review 复核增加证据门槛，无触发证据的前瞻性加固只作提示、不升格为任务
- 外部技能来源支持 `previousNames` 曾用名声明（`skills.json` 条目或 `SKILL.md` frontmatter 的 `metadata.previousNames`），安装时按别名迁移选择集与状态并清理旧名产物
- `skills uninstall --skills <旧名>` 支持清理状态里未登记、但形态可确认归属的旧名产物
- `skills status` 单列「来源内未选择」技能与「疑似残留」链接（均只提示、不自动删除）
- `skills status` 的疑似残留提示直接给出含实际名字的可复制清理命令
- `skills uninstall --all` 全量卸载已登记产物与疑似残留，非交互须加 `--yes`
- 复核与代码规范增加「用户最短路径」纪律，默认无参路径须可用、能交互补齐的不要求手填

### 🔧 功能调整

- 对外工作流规则补「修缺陷优先于扩能力」稳定纪律
- `skills install` 的 JSON 报告在各目标下新增 `migrated`（旧名 → 新名），文本模式回显「已改名迁移」
- 曾用名与现用名或其他别名冲突、或声明格式非法时整源报错，不静默剔除
- `skills status` 的旧名残留汇总改为给出含实际名字的可复制卸载命令，不再使用占位符
- `skills uninstall` 裸命令改为交互多选（全局 / 项目 / 疑似残留，默认全不选），非交互直接报错给用法，不再默认全量删除
- 依赖裸命令全量卸载的脚本需改用 `--all --yes`

### ⚡ 优化改进

- 一次归档多个任务时在 stderr 提示建议逐个归档，以匹配逐任务提交（不阻断）
- `skills uninstall --skills <旧名>` 清理后目标目录若已空则一并回收，与常规卸载口径一致
- 项目面 `skills status` 增加「来源内未选择」汇总行，与全局面同口径（零选择时不打印）
- `tasks archive --task` 帮助文案收敛为单任务描述
- 全局规则工作流补一句「批量执行只决定推进顺序与请示频率，提交仍逐任务，不并档」
- `toolkit skills sources` 的技能清单标注「（已失效）」旧名，JSON 输出保持不变
- `fxri-plan-to-task` 补齐任务拆分判据，明确批量执行不改变提交粒度
- 明确变更集数量与任务数量无对应关系，一个变更集不得跨任务
- `fxri-release-changelog` 补充变更集归属单一任务的口径

### 🐛 问题修复

- 曾用名须为单段名字，含路径分隔符或点段的声明整源报错，避免清理时越出目标目录
- `skills install --dry-run` 的改名迁移行补 `[预演]` 前缀，避免把计划误读为已执行
- 改名迁移前确认新名已就绪，新名冲突或写入失败时不再误删旧名产物
- 项目面状态按目录合并多来源登记，避免只看首个来源把其他来源的产物误判为同名冲突
- 旧名副本无法确认归属时按失败条目回报并给出人工清理指引，不再提示无效的 `--force`
- 技能改名后旧名断链不再从状态登记里静默消失，`status` 可报出、`uninstall` 可按名字清理
- 来源整份选择名单失效时按默认口径重算（内置取 `core`、外部取全部）并向 stderr 告警，不再静默漏装新技能
- 本次零装的来源不再把选择集写成空数组，避免一次性的名单失效被固化成永久排除
- 疑似残留检测补全扫描范围，未选中目标目录里的改名残留不再漏检（仍只提示不删除）
- 疑似残留扫描按真实路径合并目录，同一物理目录的 junction 别名不再重复列出残留
- `skills uninstall --skills` 显式名字完全未命中时告警说明未执行删除，不再静默成功

### 📝 文档更新

- 补充 install 报告的 `migrated` 字段与「文本层补充视图不进 JSON」的口径

## 1.16.9

> 2026-11-10 发布

### ⚡ 优化改进

- 技能版本检测改为按需计算——帮助、版本、裸命令、`--format json` 与非 0 退出的命令不再读取技能文件
- 多个目标指向同一真源时，版本文件按真实路径去重只读一次

### 🐛 问题修复

- 软链（link）模式下的技能更新提示不再误报——已装版本改读目标目录 `SKILL.md` 的实际版本，升级全局包后无需等下次 `skills install`；`copy` / `shell` 是独立产物，仍以状态登记为准
- `init` 的已装判定改为检查登记产物是否仍在磁盘，目录被删后不再误判「已安装」而跳过 `skills install` 指引
- 技能更新提示中，链接悬空（目标不存在）不再按状态登记算作已装，交由 `skills status` 报悬空
- 来源真源不可读时，`skills status` 的版本改用登记值兜底并标注「（登记值）」，`--format json` 增 `skillVersionsFromState`

### 📝 文档更新

- 版本比较口径补充「已装版本按落点形态取证」

## 1.16.8

> 2026-11-09 发布

### ⚡ 优化改进

- `tasks archive` 在固化前提示「文件名简述与标题不同源」（归档块标题取自文件名，固化后不再改）
- 任务命名规范改述为「简述由标题派生」，SPEC、技能包与文档站口径同步

### 🐛 问题修复

- 任务文件名新增三段真源校验——简述须源出正文标题（不翻译 / 不音译 / 不缩写，判据不绑定语种）、用户名须与 `owner` 一致，另查跨平台非法字符 / Windows 保留设备名 / 结尾点或空格 / NFC / 长度（均软告警）

## 1.16.7

> 2026-11-08 发布

### ✨ 新增功能

- `toolkit conventions status` 对索引「当前语义」超过 120 字符软告警，提示改写为路由写法（何时适用 + 一句话要求；只提示不阻断）

### 📝 文档更新

- 规范载体读取模型改为索引路由——只读索引、按归属读命中分册，无命中即止，`common.md` 不再恒读
- 分册可同时按端或按主题命名，归属列即路由键
- 文档站页面、根 README、SPEC 与技能正文按段落级可读性判据（单段行宽 ≤120 字符、单句分号 ≤2 个）重排，语义与命令契约不变
- 项目级技能候选目录与 canonical 共读 agent 清单改为表格，不再内联进句子
- fxri-plan-to-task 的规范载体规范拆为结构篇与维护篇，主技能按场景分别加载

## 1.16.6

> 2026-11-08 发布

### ✨ 新增功能

- `conventions check` 作为 `status` 的别名
- `tasks list` 作为任务看板入口（等价于裸 `tasks`）
- `tasks check` 校验 `scope` 取值是否在 conventions 端清单内（`common` 恒合法）

### 🔧 功能调整

- `rules compose` 在 `--out` / `--copy` 时不再改写组合缓存
- `env` 规则模块正文升级为「## 环境与版本」二级标题，单独组合时不再呈现为工作流末尾的加粗条目
- `usage doctor --format json` 的诊断项改为带 `code` / `level` 的结构化条目

### ⚡ 优化改进

- `config status` 的未知配置段提示附带可用段名，段名清单由单测与 docs/config.md 锁定一致
- 规则组合器显示「当前：自定义」状态并提供「全部取消」入口
- `docs:dev` 启动前自动同步规则数据，生成脚本改为临时文件加改名落盘
- `fxri-plan-review` 补充口语触发示例、复核前读全量 active 与「仅作提示」归档出口
- `fxri-plan-to-task` 落档后回答建议类问题改按复核单表口径输出
- `fxri-plan-to-task` 澄清落档与执行授权的边界，补动作型短语、连续讨论与批量执行口径
- 任务粒度上限明确为「单个方案 / 单次建档批次」的量级参考，active 总量不受此限
- 任务看板与 `tasks stats` 的汇总统一为状态 / 负责人 / 范围 / 批次维度，范围空缺归「未标注」，批次解析正文 `> 批次：第 N 批（共 M 批）`
- `tasks stats` 标注统计口径（含归档 / 仅未完成 / 仅已归档）

### 🐛 问题修复

- 文档站规则组合器点预设只补选不取消，选了全量后无法切回小预设；现改为整体覆盖选择与顺序，与 `rules compose --preset` 口径一致
- `config status` 不再把合法的全局 `usage` 配置段误报为未知段
- rule 通道下不再误报 dsh profile 未写入桥接条目
- 任务区词标记扫描只认行首子项形态，跳过标题、代码块与引用块，正常引用不再误报

## 1.16.5

> 2026-11-08 发布

### ✨ 新增功能

- 全局规则拆为 core / output / workflow / env / commit / usage 六个可组合模块，正文随包分发
- 文档站新增「规则组合」页：勾选模块、拖拽排序、实时预览、一键复制，选择记在本机浏览器（本地存储不可用时静默降级）
- `toolkit rules` 提供命令行同能力：`list` / `compose` / `reset`；`--copy` 与 `--out` 互斥，空 `--module` 报错，`--out` 自动创建父目录
- 配置参考增加「缓存目录」页，说明布局、清理方式与不在此目录的状态 / 数据
- `fxri-session-recap` 收尾流程增加技能使用补报，回看本会话 Skill 调用并按次数补报

### 🔧 功能调整

- 规则更新时间锚点改为模块级，页面与组合输出取所含模块的最新时间；措辞由「本页」改为「本规则」，已复制规则的用户需重新复制
- 全局规则索引页改为「规则组合」入口，三篇规则页补模块来源说明；预设「完整」更名「AI 全篇」
- `usage init` 预设文案去掉歧义的「本地 +」表述，明确「数据只留本机，不上传」与「配置上传」
- usage 顶层描述与文档中的「本地统计」统一为「本机统计」，「本地」只保留来源与路径语义
- 技能使用情况规则改为每次调用 Skill 工具后立即上报，只写本机队列、不受只读与授权纪律限制，并要求回复前自检
- AI 全局规则工作流补一行条件提醒，降低 usage 规则排在末尾被忽略的概率

### ⚡ 优化改进

- 用户级缓存统一到 `~/.toolkit/cache`，升级检查缓存与技能远程来源缓存首次访问时自动迁移，迁移失败不留半截路径
- 文档站类型检查纳入 `pnpm verify`：覆盖 `.ts` / `.mts` 与组件 `.vue`，补上 VitePress 只转译不检查的盲区
- 文档站规则数据改由 `templates/rules` 生成并校验未漂移，不再依赖 `?raw` 导入，IDE 与 `vue-tsc` 均可解析

### 🐛 问题修复

- `toolkit usage rule` 在规则模板缺失时输出可读错误并以非 0 退出

## 1.16.4

> 2026-11-07 发布

### 🔧 功能调整

- `usage init` 向导默认启用并覆盖一方与第三方技能，末尾「确认写入配置」默认是，一路回车不再得到空配置
- `usage init --yes` 未给 `--preset` 时报错退出并提示合法取值，不再静默按关闭处理

### 📝 文档更新

- 同步 `usage init` 的默认值与 `--yes` 约束说明

## 1.16.3

> 2026-11-07 发布

### ✨ 新增功能

- `usage hooks install --agent dsh` 支持 DeepSeek Harness——写 `~/.dsh/hooks.json`，并在各 profile 的 `cordis.patch.yml` 维护桥接插件条目，配合 Claude Code 兼容层桥接插件记录技能使用
- `usage hooks status --all` 可列出本机未安装的 Agent，便于清理残留配置
- `usage.channel` 配置与 `usage channel [rule|hook]` 命令——规则上报与 Agent Hook 二选一，非法值报错退出，切换时提示清理另一侧配置
- `usage init --channel`（默认 `rule`）——规则通道只写采集配置、不安装 Hook、不依赖 Agent 检测；`--preset off` 与 `--channel` 同现时 `off` 优先
- `usage record --skill <名称> [--skill ...]` 规则通道批量上报——入队即返回，同一技能调用几次就记几次；只统计 toolkit 管理且命中 `usage` 配置的技能，成功静默、退出码恒 0、失败只走 stderr
- 上报由后台 worker 或下一次 `usage` 命令消费（内部命令 `usage flush`），消费时反查会话记录补齐触发词 / 参数 / 结果 / 耗时（Claude Code 可读；dsh 为 v4 事件流暂未适配；Trae 暂无可读会话），反查失败只丢字段；`usage info` 展示队列积压

### 🔧 功能调整

- `hooks install` 只处理本机已检测到的 Agent，显式指定未安装的 Agent 告警跳过（全部跳过时非 0 退出），不再凭空创建配置；`hooks remove` / `uninstall` 仍可清理已卸载工具的残留
- `fxri-plan-to-task` 增加讨论态 / 方案态 / 执行态三态闸门，需求清单、意见与「继续评估」不构成执行授权，「开始」按批次失效
- `fxri-plan-to-task` 区分「落档」与「继续评估」并给出落档的动作边界；任务档在规划态的修订不进入提交，提交只在归档后一次
- `fxri-plan-review` 落档由 `fxri-plan-to-task` 执行且不提交，闸门判定改指三态
- `fxri-plan-to-task` 把「开始」定义为建档 + 校验 + 开工——先按展示表（或无表时的方案步骤）建完全部任务档、`tasks check` 通过后才改第一处文件，单任务同样适用；「先落档」等讨论态表达不构成执行授权
- 任务档须自包含（背景 / 方案 / 影响范围 / 验证 + 计划位置 / 前置 / 后继），禁止指向对话的指代；模板与自查清单同步，任务增删须回写互链
- `fxri-plan-review` 复核清单补「是否全部任务已建档、每档是否自包含」
- `fxri-release-changelog` 承载唯一的版本口径——bump 按用户影响阶梯判定（整体重做 major、破坏既有用法需改 minor、其余含新增小能力与同能力替代实现 patch），并写明与 SemVer 的显式偏离
- 版本口径补迁移护栏（minor 附迁移映射并标注不兼容、patch 只增不改）与技能内容版本口径（小修 +patch、能力级 +minor，与包版本互不推导）
- 版本口径的归属域即该技能，退出方式为卸载本技能；SKILL.md 新增读取地图指向口径小节
- 退休 conventions `C-31`（版本级别由技能承载），`AGENTS.md` 质量门第 3 条的递增细节改为引用技能
- `fxri-release-changelog` 补「发布触发」与判断法——变更集只登记随发布物交付的可感知变化，纯开发侧脚本 / 文档 / 历史更正不单独发版，口径与语言、包管理器、交付形态无关
- `skills/README.md` 补齐三处缺口——技能触发只靠语义（个人口头禅不进通用触发词、可观测事实优先）、改 `skills/` 须发版才触达用户、发布型包误打包检查只提示不代改
- `skills/README.md` 增加规则归属判据——写进技能前先问该技能的定位是否就是这类规则的归属域
- conventions 载体退休 18 条技能已完整承载的条目，索引只保留规则层与本仓治理类条目，退休语义迁入 `retired.md`
- 技能事件按返回体推断结果——Trae 的 `Skill` 工具返回 `skill_path` / `skill_detail` 判 `success`，显式错误字段仍优先判 `failure`；dsh 桥接为纯文本，保持 `unknown`
- `usage stats --by trigger` 每条增加最近调用时间，便于查看单个技能的调用明细
- `usage info`、`hooks status`、`doctor` 展示采集通道，并在「通道与 Hook 实际状态不一致」时告警；`hooks install` 在规则通道下提示 Hook 不会写入
- `usage rule` 文案改为「每批工具调用结束后合并上报一次」，与 `docs/rules/usage.md` 同源；配置不会统计任何技能时先向 stderr 提示空转
- 技能识别改用「包内清单 + 状态文件登记来源」的托管名单，不再按 `fxri-` 前缀猜测

### ⚡ 优化改进

- `fxri-plan-to-task` 主文件由 178 行 / 7684 字符收敛到 147 行 / 6500 字符以内——落档的动作边界表下沉 `references/task-spec.md`，讨论态意图、失败模式与可选加速合并同类项，闸门语义与能力不变
- `fxri-text-encoding` 常驻 description 由 537 字符压到 300 以内，触发细节留在正文
- `fxri-session-recap` 的归档 / 沉淀顺序条款改为指向 `task-spec.md` §6，不再与 `fxri-plan-to-task` 各写一份

### 🐛 问题修复

- dsh 安装提示改为 CLI 安装，并说明桌面版「添加插件」只接受声明 `dsh.bundle` 的组合包、会拒绝桥接插件
- 官方桥接插件与 dsh 0.2.x 不兼容，默认改用社区实现 `@dsh-cc/hooks-claude-code`；条目按已安装的包名写入（官方版恢复兼容后自动切回）
- `cordis.patch.yml` 非顶层数组时跳过写入并告警，避免写坏用户配置
- 技能远程来源的 git 调用改为参数数组直传，不再经 shell 拼接，Windows 上缓存目录含空格时不再克隆失败
- Hook 命令改为按平台生成——Windows 经 `powershell -NoProfile -Command "& '…'"` 包装，macOS / Linux 用单引号拼接，解决 PowerShell 下「两个引号串并列」被当表达式导致 Hook 全部失败的问题
- 重跑 `usage hooks install` 会把存量旧形态命令替换为新形态；`hooks status` 与 `doctor` 新增「命令形态过期」提示

### 📝 文档更新

- Claude Code 的接入状态由「已验证」改为「已接入，需实测」，与实际验证范围一致
- 补齐各 Agent 的启用、关闭与卸载步骤，新增 DeepSeek Harness 接入说明
- dsh 的 Hook 进程受运行时文件沙箱限制、可能写不了家目录统计库，说明排查症状与改用规则通道的自报方式
- `task-spec.md` 新增「落档的动作边界（规划态）」小节，承接原主文件表格
- 同步 Agent 接入与 usage 命令页的平台说明
- 同步上述用法，并写明 dsh 的 `outcome` 限制
- 补规则 / Hook 两通道对比、DeepSeek Harness 运行沙箱限制、明细字段可得性与补救（`usage log` 补录 / 改用 Hook 通道），同步 CLI、配置与事件 Schema
- 补充 Trae Hook 需在 IDE 内启用的前置条件、运行方式选择与重启生效说明

## 1.16.2

> 2026-11-06 发布

### ✨ 新增功能

- 验收接入文档站产物断言，404 页不得进入站点地图与站内搜索索引
- 文档站 404 兜底页，旧地址不做重定向
- 文档一致性测试增加导航规范断言（项数、首末项、帮助必备项、分组名长度、旧称呼）与页面体量告警
- README 与文档站文档索引补「全局规则索引」入口
- 文档站「全局规则」分类，三份可复制规则集中到 `docs/rules/`（索引页 + AI 全局规则 / 提交信息规则 / 技能使用情况规则）
- `tasks export <path>` 与 `tasks import <file>` 子命令，替代域级 `--export` / `--import`

### 🔧 功能调整

- `changelog` 的 `version` / `format` / `doc` / `audit` 改为真子命令，各自拥有独立帮助与选项
- `changelog --audit-net` 改为 `changelog audit`
- `--check` / `--from` / `--to` / `--title` / `--outline` / `--no-frontmatter` 归 `changelog doc`，`--history` / `--no-sync-doc` 归 `changelog version`
- `changelog --history format` 改为 `changelog format --history`，`changelog --lang en version` 改为 `changelog version --lang en`
- 同步发版技能 `fxri-release-changelog` 至 1.3.2，命令写法与选项位置说明随子命令化更新
- `toolkit skills remove` 更名为 `toolkit skills uninstall`，与 `skills install` 对称
- `toolkit usage status` 更名为 `usage info`，避免与 `usage stats` 一字之差
- `usage skills` 更名为 `usage scope`、`usage sources` 更名为 `usage origins`，避免与顶层 `skills` / `skills sources` 同名不同义
- `usage hooks uninstall` 更名为 `usage hooks remove`，与域级 `usage uninstall` 区分
- `usage ingest` 改为隐藏命令，不再出现在 `usage --help`
- `usage rule print` 简化为 `usage rule`
- `usage origins` / `usage capture` 的布尔开关改为 `--x` / `--no-x` 成对写法，旧的 `on|off` 取值移除
- `usage purge --older-than` 改为接受 `30d` / `24h` / `60m`，裸数字按非法值报错
- `usage uninstall` 新增 `--dry-run` 预演，`--purge-data` 更名为 `--purge`
- `usage export` / `usage import` 的文件格式参数由 `--format` 更名为 `--type`，`--format` 只用于 stdout
- `skills install --yes` 拆分为 `--yes` 与 `--use-saved`，两者语义区分
- 页面标题「新手指南」「FAQ」统一为「快速开始」「常见问题」，CLI help 与文档站链接文案同步
- `usage stats` 合并 `top` / `sessions` / `triggers`，改用 `--by skill|session|trigger` 与 `--limit`
- `usage upload --once` 改为 `usage upload send` 子命令，`--dry-run` / `--limit` 随之归入
- `docs theme --check` / `--write` 改为 `docs theme check` / `docs theme write` 子命令
- `skills sources notify` 的频率取值改为 `--frequency always|daily|weekly|off`
- AI 全局规则页由 `docs/ai-rules.md` 迁至 `docs/rules/ai.md`、提交信息规则页由 `docs/commit-rules.md` 迁至 `docs/rules/commit.md`，旧地址不再提供
- 技能使用情况规则页由裸文案改为与其他规则一致的页头结构，「可选」移出规则全文，规则全文首行补「规则更新时间」锚点
- `toolkit usage rule` 输出同步新锚点与标题（`Skill usage（技能使用情况）`），与文档站复制块逐字一致
- `tasks` 的 `archive` / `check` / `normalize` / `stats` 改为真子命令，各自拥有独立帮助与选项
- 移除域级 `--check` / `--fix` / `--target`，分别下沉到 `tasks normalize` 与 `tasks import`
- `tasks --export <path>` 改为 `tasks export <path>`，`tasks --import <file>` 改为 `tasks import <file>`
- Hook 命令写入前对 Node / CLI 路径做 realpath 归一，避免 fnm / nvm 会话级临时软链失效
- `usage hooks status` 与 `usage doctor` 检测 Hook 命令中的失效路径，并提示重跑 `hooks install`
- `usage hooks status` 对已安装但从未触发的 Hook 输出明确提示
- `usage status` / `usage info` 不再重复输出「上传」行，改为单行含待上传数量
- `usage init` 重复执行时沿用历史选择，已配置时默认「保持当前配置」并只重装 Hook
- `usage init` 的「自定义」预设逐项回填现有配置，推荐 / 第三方 / 高级仍按预设语义取值
- `usage upload setup` 的启用确认默认沿用当前上传开关

### ⚡ 优化改进

- 文档一致性测试补 404 两条断言（`search: false`、`sitemap.transformItems`）
- 404 页加 `search: false`，不进入站内搜索索引
- 文档站顶栏收敛为 5 项、侧栏重排为 6 组，「技能使用情况」分组改名「使用统计」，常见问题与更新日志统一进「帮助」
- 404 页从站点地图过滤，避免被搜索引擎当正常页面收录
- 三篇全局规则页统一页首表述与「相关页面」链接，补齐规则索引、技能使用情况规则与 FAQ 入口

## 1.16.1

> 2026-11-06 发布

### 🔧 功能调整

- `toolkit telemetry` 更名为 `toolkit usage`，中文统一为「技能使用情况」，旧命令不再保留
- 全局配置段 `telemetry` 更名为 `usage`，环境变量 `TOOLKIT_TELEMETRY_DIR` 更名为 `TOOLKIT_USAGE_DIR`，默认数据目录改为 `~/.toolkit/usage`
- 检测到旧配置段、旧环境变量、旧数据目录或旧版 Hook 时输出一次性提示，不读取也不迁移
- 文档站相关页面迁至 `usage`，命令帮助与全局规则文案同步改写；已复制旧版全局规则或安装过旧版 Hook 的需按新命令重做

## 1.16.0

> 2026-11-06 发布

### ✨ 新增功能

- 发版技能支持同版本变更集的净变更合并：只保留用户可见的最终结果，明确判定边界、类型归并与折叠清单留痕
- 技能使用遥测内核与 `toolkit telemetry` 命令域：本地记录、过滤、去重、统计、导出与诊断，默认关闭且数据只存本机；配置只读全局层，项目层与本地层误写只告警
- 遥测初始化向导与 Trae / Claude Code Hook 接入：安装与采集开启分离授权、触发词缓存、`init --yes` 非交互入口、`uninstall` 卸载与状态汇总；`hooks status` 以本地时间显示最近触发，补充 Agent 接入矩阵与可复制全局规则
- Cursor / Codex / Copilot 适配与 transcript / 手工补录：兼容 snake_case 与 camelCase 事件字段，按 sessionId + toolUseId 跨适配器去重
- 可选上传：Webhook / OTLP/HTTP / 本地文件，含 `upload setup --yes`、dry-run 预览与按 eventId 幂等的上传账本；事件 schema 独立发布并补隐私边界文档，未启用路径不发起网络请求
- `toolkit changelog --audit-net`：扫描待发布变更集，列出同对象净变更候选；支持显式标识与自然语言相似片段，只提示不自动改写

## 1.15.6

> 2026-11-05 发布

### 🔧 功能调整

- `fxri-plan-to-task` 主文件收敛为「场景 → 必读 → 可跳过」读取地图，删除同义复述，保留流程步骤、目录创建与 conventions 加速提示；字符数 7,441 → 5,917
- `fxri-release-changelog` 把「记录变更」拆为写法、级别、早期自查三个子项，补明 patch 也可挂「新增：」前缀
- `fxri-plan-review` 合并同义触发句，保留「审查任务拆分」触发示例
- `fxri-session-recap` 收敛为三模式入口并新增读取地图，保留归档五步、端名示例、四级时间源与分类标签分册加载等全部约束；主文件 6,982 → 5,490 字符
- `fxri-text-encoding` 主文件收敛为决策流，触发判据保留「或出现乱码」，基线、写盘与排查细则下沉 references；主文件 7,497 → 3,721 字符
- `scope` 软告警补空格分支——端名与分类标签含空格时提示改用半角加号连接

### ⚡ 优化改进

- 文档站重构：CLI 参考按用户任务拆为总览 + 分页，配置参考拆为总览 + 五个分页，跨页锚点改为指向分页；收敛跨页重复并统一「相关页面」页脚，完整攻略压到 250 行内、技能分发页压到 12k 字符内，命令契约与限制不变

### 🐛 问题修复

- `conventions status --dir` 与 `tasks check --dir` 跨仓体检改为按任务目录所属仓库推导扫描根，无标记时回落 cwd，不再漏报入口壳告警

## 1.15.5

> 2026-11-04 发布

### 🔧 功能调整

- `docs/ai-rules.md` 补「验证有上限」纪律——同一改动提交前跑一次聚合门禁即可，失败才重跑全量，不为自我确认额外加跑

## 1.15.4

> 2026-11-04 发布

### 🔧 功能调整

- `skills/README.md` 发布前核对清单不再手写门禁步骤枚举，改以 `pnpm verify` 为单一真源，并标注该节仅本包维护者适用
- `fxri-plan-to-task` 的表格形态判据去掉本仓源码路径，通用技能不再引用用户侧不存在的文件

## 1.15.3

> 2026-11-04 发布

### 🔧 功能调整

- `fxri-plan-to-task` 与 `task-spec.md` / `conventions-spec.md` 里的本仓路径、本仓历史案例改为通用措辞，通用技能只保留可移植纪律

## 1.15.2

> 2026-11-04 发布

### 🔧 功能调整

- `fxri-release-changelog` 的镜像页页头统一要求已撤回——属项目风格偏好，不构成通用契约；`outline` 与 frontmatter 由项目自行决定

## 1.15.1

> 2026-11-04 发布

### ✨ 新增功能

- 新增 `scripts/check-consistency.mjs` 并挂入 `pnpm verify`，校验技能版本四处一致、技能表用途列片段与任务登记的触达路径
- `toolkit conventions status` 输出 `checkCoverage`（`covered` / `uncovered` / `unknownIds`），一句话结论追加「其中 N 条无检测入口」；检测代码可用 `// C-<n>` 标注对应规范
- 新增 `toolkit skills bump` 递增技能版本，支持 `--all` 批量、`--set` 直接设定、`--dry-run` 与 `--format json`
- 任务正文可用 `- 文档触达：<路径>` 登记触达文件，仓库自检核对路径存在性；`fxri-plan-to-task` references 补触达登记、检测入口标注与「归档前运行改动比对」时点
- `FX_DEBUG_UPDATE_CHECK=1` 输出每轮提示判定依据到 stderr；`skills status` 展示上次检查时间与下次可提示时间，JSON 补 `checkedAt` / `nextHintAt`

### 🔧 功能调整

- `fxri-plan-review` 输出列名改为「后续是否落档」，取值 `直接落档` / `需要确认` / `仅作提示`；会话内评估 / 建议表格必须带该列，未分类默认 `仅作提示`，技能表与 README 同步
- 明确「方案确认 ≠ 执行授权」：只读检查可在规划态执行，写操作须明确授权；不可逆动作默认逐次授权，当前指令已含授权则直接执行
- 发版技能补授权边界与会话级授权有效期，`fxri-session-recap` 同步收尾口径；`SPEC.md`、`docs/ai-rules.md`、`AGENTS.md` 与 conventions C-2 同步授权语义
- 触发与只读判据改为按意图与最终动作判定，短语降为示例并标注非穷举；`fxri-plan-to-task`、`fxri-plan-review`、`fxri-session-recap` 与 `skills/README.md` 自查清单同步，不再并列成词表
- `docs/ai-rules.md` 补「只读型请求默认只读」稳定纪律，规则更新时间锚点同步

### ⚡ 优化改进

- `pnpm verify` 门禁提速——单测与覆盖率合并为一次运行、本地按改动面跳过无关步骤、类型 / 静态 / 规范检查并行，检查项与 CI 口径不变

### 🐛 问题修复

- `config status` 把 `skillsInstall` / `projectSkills` / `changelogDoc` 误报为未知配置段
- 升级提示与版本比较统一：外部来源按技能自身 `metadata.version` 比较，安装报告显示真实版本与「当前 → 目标」，提示显示「当前 → 最新」，版本不可比时区分来源侧 / 已装侧
- 版本比较口径统一——段数不等补零、预发布低于同号正式版、忽略构建元数据、无法解析时不提示；批量抬 minor / major 需交互确认，非交互环境须显式 `--yes`
- `skills sources` 不再列出内置源；`refresh --dry-run` 显示当前版本，无版本时 JSON 返回 `null`，帮助文案同步
- `docs/cli.md` 升级提示渠道与技能 JSON 子命令范围表述过期；`docs/ai-rules.md` 技能分工补上落档后复核
- 只有表态明确指向「接受评估结论并落档」才自动写入，「继续评估 / 可以吧」等不再触发落档
- 执行 `skills install` 后同一版本不再重复提示，来源版本变化或 CLI 升级后自动恢复

## 1.15.0

> 2026-11-04 发布

### ✨ 新增功能

- `fxri-plan-review` 技能（core），复核已落档任务拆分，输出新增疏漏、建议与修订计划表
- 复核结果按 `无需确认` / `需要确认` / `仅作提示` 标记默认处置，支持语义化接受后自动落档，未标记项不写入
- `references/review-checklist.md` 与 `references/trigger-examples.md`，提供清单、反例与触发回归样例
- 技能版本提示支持内置技能与第三方来源分别配置，内置默认 `inherit`，第三方支持 `channels.externalSkills` 与 `sources.<name>` 逐源覆盖
- `skills sources` 展示来源版本与生效提示频率；`skills sources notify <name> <频率>` 支持 `--scope global|project` 与 `--format json`
- `skills sources refresh [name]` 刷新来源缓存与版本，支持 `--dry-run` 与 `--format json`，只更新元数据、不自动安装
- `skills status` 的 `versionStatus` 增加 `channels`、`sources` 与两面 `skillsOutdated`
- 统一版本提示器，命令成功时按 `updateCheck.notify`（默认 `always`）在结尾输出一句话，TTY 走 stderr、非 TTY 走 stdout
- `updateCheck` 支持 `notify` / `channels.cli.notify` / `registry` 配置，registry 按配置 > 环境变量 > 项目 / 家目录 `.npmrc` > 默认解析，支持 `NPM_TOKEN` 与 `_authToken`
- `skills status` 文本与 `--format json` 增加版本检查块 / `versionStatus`，展示 CLI 当前版本、最新版本、registry 来源与提示频率

### 🐛 问题修复

- 升级提示仅在命令成功时输出，帮助、业务失败、解析失败、`skills path`、`skills status`、JSON 与 changelog 透传不再产生额外文本
- 明确任务粒度只约束任务与提交单元，不约束发版范围；一次发版可包含多个任务与多个变更集
- 同步 `SPEC.md`、`task-spec.md`、`docs/ai-rules.md` 与 `fxri-plan-to-task` 四处口径，并新增条款一致性测试

## 1.14.8

> 2026-11-03 发布

### ⚡ 优化改进

- 统一 package.json 元数据（author、repository、homepage、keywords 与字段顺序）

## 1.14.7

> 2026-11-03 发布

### ⚡ 优化改进

- 文档站主题升到 2.1，行内代码与主按钮改用中性/本站强调色，首页氛围按 `--fx-hero-angle` 生效

### 🐛 问题修复

- 暗色主按钮改用近黑文字，避免提亮强调色上的白字对比不足

## 1.14.6

> 2026-11-03 发布

### ⚡ 优化改进

- 文档站主题升到 2.0，改为中性底 + 单站强调色，渐变只保留首页首屏
- 主题令牌统一为 `--fx-*` 前缀，`--write` 自动迁移 1.x 的 `--site-*` 令牌

## 1.14.5

> 2026-11-03 发布

### ⚡ 优化改进

- 文档站主题升到 1.1，渐变改为铺满视口的全页柔光，版本标记改为两段式

## 1.14.4

> 2026-11-03 发布

### 🔧 功能调整

- 推荐技能包页不再固定外部来源的版本与技能名，改为以来源仓清单为准

## 1.14.3

> 2026-11-03 发布

### ✨ 新增功能

- `toolkit docs theme` 命令，统一文档站主题模板并提供 `--check` 漂移校验与 `--write` 刷新

## 1.14.2

> 2026-11-03 发布

### ⚡ 优化改进

- `changelog format` 对无 `###` 分组的版本块按类型前缀生成规范分组并剥离前缀，默认只处理最新一块，`--history` 处理全部版本块
- `--history` 追溯时按前缀纠正已分组块内放错组的条目，历史无分组块一并归一
- 语言未声明 `groups` 时只剥离可识别前缀，不再退化为纯替换

## 1.14.1

> 2026-11-03 发布

### ✨ 新增功能

- `toolkit changelog doc` 将根 CHANGELOG 同步为文档站镜像页，支持 `--check`、路径 / 标题 / outline / frontmatter 配置
- `changelog version` 发版后自动同步镜像页，失败只告警不阻断
- 文档站推荐技能包页面，汇总本仓内置技能源与 playbook 外部来源
- `skills install --mode package` 纯包管理器模式，允许零选择且 core 不再强制
- `--no-skills` 仅本次零装，不改模式与已保存选择
- `skills install --from` 支持 Git 远程地址与 `#ref`，本地与远程共用一套来源解析
- 远程来源浅克隆到用户级缓存，项目面状态只记地址与 ref，不写本机缓存路径

### ⚡ 优化改进

- 镜像逻辑收敛进 CLI，各项目不再维护本地 `sync-changelog-doc.mjs`
- 对外文档大标题去掉英文副标题，规则页与变更集说明改用中文主题
- 状态与安装报告输出当前模式，零选择时 `selection` 为空数组
- 临时 `--from` 来源不写选择集与来源配置

### 🐛 问题修复

- 项目层配置查找止于 home，避免把全局层 `~/.toolkitrc.json` 误当项目层读取

## 1.14.0

> 2026-11-02 发布

### ✨ 新增功能

- `skills install --from <path>` 纳入外部本地技能源（根 SKILL.md / skills/\*/SKILL.md / skills.json 清单三种格式），临时来源只写副本，`--save [name]` 登记为永久来源并默认软链
- `skills sources` 查看来源、`skills sources remove <name> --prune` / `skills remove --source` 按来源注销与清理
- 安装 / 卸载操作锁（pid / host / startedAt，5 分钟过期接管），避免多进程同时改写状态与产物
- 外部来源同名、目录越界与清单 `formatVersion` 非 1 时明确报错，不静默回退
- 技能按 `metadata.tier` 分层（`core` 必装、`optional` 可选），安装时 TTY 方向键多选，支持 `--skills` / `--all` / `--no-optional` / `--yes`，首次只装 core
- 按 `SKILL.md` frontmatter `metadata.requires` 自动补全依赖技能，缺失依赖告警后跳过
- 技能选择后选择目标——全局面按 canonical + 已检测 agent 多选，项目面按候选薄壳目录多选；只用 `--agent` / `--all-agents` 可显式指定，`--no-save-agents` 只影响本次，`--dir` 始终一次性
- 全局层 `skillsInstall` 与项目层 `projectSkills` 安装偏好（技能选择 + 目标选择），误写层告警并忽略；`prepare` 非交互按已保存目录刷新
- `skills install --prune` 清理未选择（技能或目标）且内容与本包真源一致的旧产物；`skills remove --skills` 只清指定技能

### 🔧 功能调整

- 技能状态文件改为 `format` + `schemaVersion` + `sources` 结构，旧结构首次读取时一次性导入并备份 `.bak`
- `skills status` 的 `missing` 只表示已选择但缺失，新增「未选择但已安装」单列（技能与目标两级）且不计入问题
- `skills remove` 按「配置 → 产物 → 状态」顺序清理
- `fxri-text-encoding` 触发判据改为上下文中可观测的写入 / 生成 / 执行通道与症状，显式取消临时、一次性、不入库任务豁免
- 技能描述与规则层同步，写脚本、配置、数据交换文本及跨进程管道前按读取方定字节形态
- 判据改为按读取方默认解码与字节形态推导，不按语言 / 扩展名白名单，补 PHP 与按平台编码编译的源文件
- 补命令行参数、环境变量、API 请求体、模板渲染与远端元数据的跨边界判据，故障判定以与原文比对为准

## 1.13.1

> 2026-11-01 发布

### 🐛 问题修复

- `conventions status` 与 `tasks check` 的稳定 ID 校验收紧为去补零形态，`C-001` 这类补零写法现会告警并提示改写为 `C-1`

## 1.13.0

> 2026-10-24 发布

### ✨ 新增功能

- `fxri-text-encoding` 技能按「乱码三问」定归属（谁的字节 / 还能救吗 / 错在第几跳），附读取方默认解码对照与按 mojibake 特征串选 `iconv` 方向的反向转码命令
- 技能给出 `.ps1` / `.psm1` / `.psd1` / `.bat` / `.sh` / `.xml` / `.properties` / C 系与 Java 源文件及 Excel CSV 的 UTF-8、BOM 与行尾基线
- 技能对照 AI 写入工具与 `powershell.exe` / `pwsh` / .NET / Node / Python / `.editorconfig` / `.gitattributes` 的写盘 BOM 与默认编码行为，含 `-Encoding UTF8` 在两种 shell 下同名不同义、`Export-Csv` 省略 `-Encoding` 写 ASCII、Node 读侧残留 `\uFEFF`
- 技能提供落盘后首三字节自查与 `git ls-files` 全仓巡检，改完即可验
- 技能覆盖运行期管线断点——控制台代码页、`$OutputEncoding` 与 `>` 重定向、`Get-Content` 解码、Python locale、容器 CI `LANG=C`、Java `file.encoding`
- 技能记录 `core.autocrlf` 检出转换与 `eol=lf` 不回溯已提交内容、Windows「Beta: 使用 Unicode UTF-8 提供全球语言支持」造成的同文件异机差异、Excel 另存 CSV 的编码走向、不可见字符、全角标点、`�` 不可逆、二次转码等场景

### 🔧 功能调整

- `docs/ai-rules.md` 代码规范补脚本字节形态铁律（`.ps1` UTF-8 with BOM、`.sh` 无 BOM + LF、`.bat` / `.cmd` 不带 BOM + CRLF），以系统内置的 `powershell.exe` 指代该 shell，指向该技能

## 1.12.6

> 2026-10-19 发布

### ⚡ 优化改进

- `conventions-spec.md` 声明 `.tasks/` 外层骨架以 `task-spec.md` 为真源，避免两份目录树各自演进漂移

### 🐛 问题修复

- `fxri-session-recap` 恢复模式二按相对路径引用 `conventions-migration.md`，补包内真源兜底；载体形态 v1 / v2 判定与 `retired.md` 按需读清单与主文件 R3 及 `docs/guide.md` 口径一致
- `fxri-plan-to-task` 的 v2 → v3 升级步骤直接写出 `retired.md` 固定表头，迁移不再需要反向查 `conventions-spec.md`

## 1.12.5

> 2026-10-19 发布

### ✨ 新增功能

- `skills status` 单列「经 canonical 共读的 agent」，DeepSeek Harness 等共读 agent 不再被误判为不支持（JSON 输出新增 `canonicalReaders` 字段）
- 项目面候选目录增加 eve 的 `agent/skills`，该目录已存在时落入口薄壳
- `skills status` 识别 Codex / Pi 的历史落点残留（`~/.codex/skills`、`~/.pi/agent/skills`），标注为「历史落点」并在报告末尾单列提示清理，JSON 输出新增 `legacyTargets` 字段
- 项目级技能目录候选补充 15 个上游专用配置目录（`.augment/skills`、`.codebuddy/skills`、`.continue/skills`、`.crush/skills`、`.devin/skills`、`.goose/skills`、`.grok/skills`、`.hermes/skills`、`.iflow/skills`、`.junie/skills`、`.kiro/skills`、`.openhands/skills`、`.qwen/skills`、`.roo/skills`、`.windsurf/skills`），已在用的项目级目录都会收到入口壳

### 🐛 问题修复

- Codex 与 Pi 的全局技能目录对齐上游 canonical（`~/.agents/skills`），不再分别写到 `~/.codex/skills`、`~/.pi/agent/skills`，避免与共读面重复分发
- `CODEX_HOME` 改为仅参与安装探测，不再改写 Codex 的写入落点
- 项目级技能目录候选移除 `.cursor/skills`、`.trae-cn/skills`（二者为对应 agent 的全局目录，收录会把入口壳写到错误位置）
- 各 agent 全局技能目录跟随 home 类环境变量（`XDG_CONFIG_HOME`、`CLAUDE_CONFIG_DIR`、`VIBE_HOME`、`HERMES_HOME`、`AUTOHAND_HOME`、`GROK_HOME`），改写基准目录后不再分发到错误位置
- `SARVAM_HOME`、`APPDATA`、`FLATPAK_XDG_CONFIG_HOME` 参与已安装探测，自定义目录的 agent 不再误判为未安装

### 📝 文档更新

- 补充 canonical 共读 agent 清单、DeepSeek Harness 全局 / 项目级技能目录与环境变量覆盖说明
- 同步项目级技能目录与入口壳落点枚举，写明拒绝收录的裸 `skills` 与 `data/skills` 理由
- `skills install --dir` 说明只在当次安装写入，技能增删后需带相同 `--dir` 重跑

## 1.12.4

> 2026-10-19 发布

### ✨ 新增功能

- `docs/ai-rules.md` 补「规划先行」「逐仓逐任务建档」「按序交付、逐任务提交」三条稳定纪律，多任务方案先出纯展示计划表再逐仓逐任务建档

### 🔧 功能调整

- `fxri-plan-to-task` 新增任务分解与展示型计划表步骤，建档改为逐仓逐任务，交付改为按序推进、逐任务提交；任务粒度判据与反例下沉 `task-spec.md`
- `fxri-session-recap` 收尾时按仓逐任务建档，恢复时按任务正文的顺序线索重建执行顺序

### ⚡ 优化改进

- `fxri-plan-to-task` references 改为按场景读取，正文压缩，迁移与文风模板拆为 `conventions-migration.md` / `conventions-templates.md` 按需加载，日常只读主文件
- `fxri-session-recap` 合并重复纪律，模式二 / 三下沉 references，主文件保留概要、关键护栏与读取指针，模式一仍内联
- `fxri-release-changelog` 精简触发词与失败模式说明，`changelog-format.md` 自查说明改为指向检测入口

### 🐛 问题修复

- 修正文档触达面清单的过期枚举，改为遍历 docs 全量页面，避免新增页面漏检
- `fxri-release-changelog` 修正 `changelog-format.md` 文件结构示例仍带类型前缀、与「归类后剥离前缀」规则冲突

### 📝 文档更新

- `SPEC.md`、README、guide/handbook/getting-started 同步开工门槛与逐任务交付口径；移除全局规则页重复的升级说明，明确 SKILL.md 不链接为常驻规则
- 技能版本表与加载口径同步——`description` 常驻匹配、正文触发时加载、`references/` 按需读取，不再声称「零上下文占用」「未声明不会自动介入」
- 发布核对清单与单元测试新增加载体积守卫——主干 `SKILL.md` 不超过 8,000 字符

### 🧹 清理移除

- `AGENTS.md` 发版链路删除与「验收方式」重复的步骤定义指针，`docs/ai-rules.md` 删除与「规划先行」重复的稳定纪律条目

## 1.12.3

> 2026-10-18 发布

### 📝 文档更新

- 明确 T5 规范词适用范围覆盖 history 留痕行

## 1.12.2

> 2026-10-16 发布

### 📝 文档更新

- 修正历史日志块的条目前缀残留与错挂归组——1.9.2 块一处子项剥离遗留的 `修复：` 前缀，1.9.0 块两处独立修复由父项缩进子项拆为顶层条目

## 1.12.1

> 2026-10-16 发布

### ✨ 新增功能

- `toolkit tasks check` 增报变更集「未加 `- ` 列表标记」的裸行（含首个行号与本文件行数），与既有「缺类型前缀」检测并列

### 🐛 问题修复

- 修复变更集裸行写法漏检——以往多条裸行会被 changesets 并入相邻条目作缩进续行、致整段塌成单一条目，只有首行参与归类与前缀剥离

## 1.12.0

> 2026-10-16 发布

### ✨ 新增功能

- 规范载体升 v3——`.tasks/conventions/` 按读面拆「常驻索引 / 按需分册 / 归档」三分区，新增 `retired.md` 退休台账承载作废条目（冻结退休时语义并记录后继与条文去向），条目作废走三层清理（索引行迁出、分册小节物理删除、外部单一事实源同步收敛），从源头抑制常驻读面的规范膨胀
- `toolkit conventions upgrade` 支持 v1 / v2 → v3 链式升级——v2 升级自动删除索引表「状态」「确立来源任务」两列、把作废条目迁入 `retired.md` 并物理删除分册对应小节，`--dry-run` 可预演
- 载体支持分类标签分册（如 `build.md` 等非端分册），归属取已存在的分册名即合法
- `conventions-spec` 新增 §13「载体文风与模板」（T1–T6）——索引头注固定两行、用法说明固定「载体形态 → 本项目约定（可选）→ 读写与维护」三段骨架、「单一事实源」列按载体内 / 外二分写法（载体分册用相对链接、载体外文件用行内代码）、分册条文固定「要求 → 反例 → 理由 → 配套」四子项且不写「确立来源」、规范词按 `须` / `应` / `可` / `不得` 分级、标识符与路径一律行内代码

### 🔧 功能调整

- `toolkit conventions status` 新增校验——退休台账可定位性、退休 ID 与活跃 ID 重叠、common 归属却语义提及端名
- 任务 `scope` 字段校验新增路径分隔符软告警（`/` 与 `\`）
- `toolkit conventions upgrade` 新增 `index.md` 正文 v2 措辞复核——表外自由文本残留「确立来源任务」「状态改为已废弃」等表述时列入 `reviews`（只报不改）
- `toolkit tasks check` 与 `toolkit conventions status` 新增演进记录首列形态校验——v3 载体的 `history.md` 数据行首列须记为行内代码包裹的稳定 ID `C-<n>`，检出规则名等非 ID 首列时软告警（只报不改，历史行只追加故补齐须人工确认）
- 规范载体三表表头统一为稳定 ID `ID`——索引表（`| ID | 规则 | 当前语义 | 归属 | 单一事实源 |`）、`history.md`（`| ID | 修订内容 | 修订来源任务 |`）、`retired.md` 首格同归一；表头与分隔行由列名常量单源派生，杜绝列集合形态漂移
- `toolkit conventions upgrade` 的 v2→v3 升级新增 `history.md` 表头首格归一为稳定 ID `ID`
- `toolkit tasks check` 与 `toolkit conventions status` 新增表形态速检——v3 载体索引表残留 v2 独有列（「状态」「确立来源任务」）或 `history.md` / `retired.md` 表头首格非 `ID` 时软告警（只报不改）
- 表形态校验从「速检」升级为完整比对——v3 索引表列集合须恰为 `ID | 规则 | 当前语义 | 归属 | 单一事实源` 五列（列名与次序逐格一致，多列 / 少列 / 换序均检出）、`history.md` / `retired.md` 表头整行逐格比对、载体各文件（`index.md`、分册、`history.md`、`retired.md`）表头行与紧随分隔行列数须相等（跳过 fenced code block）；检出统一为软告警（只报不改，须人工确认后按规范归一）
- `toolkit tasks check` 与 `toolkit conventions status` 新增分册残留「确立来源」子项检测——v3 载体的分册（`index.md` 除外）内出现行首「确立来源」子项时软告警（跳过 fenced code block、只报不改）
- `conventions-spec` 补齐演进记录措辞规则——§3.2 规定「修订内容」列只记该条自身语义（新立条目直接写其语义、语义变更写「旧语义」→「新语义」），禁自指套话（如「（本次起入表）」「新立条目：」）与重复 `index.md` 索引列的条文去向（如「条文全文落 X」，违反不变量 I4），并确立「措辞归一例外」（属 §9 同类的措辞层归一可原地改写旧行、不入留痕）；§8 补新立条目写法、§12 自查清单同步新增一项
- `toolkit tasks check` 与 `toolkit conventions status` 新增演进记录「修订内容」列禁用语料检测——v3 载体的 `history.md` 该列出现自指套话或重复索引列的条文去向时软告警（报首个命中行与「另有 N 处」、只报不改，改写须人工确认）
- `toolkit init` / `toolkit conventions upgrade` 写入 `history.md` 的元规则引语同步为「修订内容新立条目直接写其语义、语义变更写『旧语义』→『新语义』」，与 `conventions-spec` §3.2 模板同源
- 规范载体文风模板（§13）微调——T6 中英文混排空格由硬性要求放宽为随仓库既有排版习惯；样板与索引内引用的 skill 路径由短名改为完整路径（样板处用 `skills/<技能名>/references/…` 占位）；检测实现注释里的表形态检测代号由 `T1–T5` 收敛为 `S1–S5`，与文风模板编号 `T1–T6` 区分（仅注释，无行为变化）

### ⚡ 优化改进

- 跨平台兼容补强——新增 macOS CI job、统一路径大小写归一口径（覆盖 macOS）、补 `.gitattributes` 统一换行符

### 🐛 问题修复

- `toolkit conventions upgrade` 与 `status` 判定稳定 ID 时容忍行内代码包裹（`` `C-4` `` 不再误判为「首列仍为规则名」「不合稳定 ID 形态」）——对齐规范「引用一律行内代码包裹」的合法写法
- `toolkit conventions status` 的 common 下沉提示改为大小写不敏感、判据收窄为「语义含端限定语（仅 / 只 / 专属 / 适用于）且提及端名」，消除举例式提及的假阳性并补上大写端名的漏报
- `toolkit init` 生成的 `conventions/index.md` 骨架此前残留 v2 列结构，改为按 v3 五列生成

### 📝 文档更新

- `conventions-spec` 补齐形态与迁移措辞——索引表五列固定、`history.md` / `retired.md` 表头固定逐格一致、表列数自洽、入口壳版本沿革（壳标记独立演进、当前 `v2`、从未有过 `v1` 壳）、不得显式书写 `v1` 标记、手工迁 v2 与 `toolkit conventions upgrade` 链式直达 v3 的落点差异

## 1.11.8

> 2026-10-08 发布

### 🔧 功能调整

- `toolkit conventions format` 归一表格时一并把按列宽补长的分隔行横线压为 `---`（保留对齐标记 `:---` / `---:` / `:---:`），`conventions status` 与 `tasks check` 同步检出此类偏离

## 1.11.7

> 2026-10-08 发布

### ✨ 新增功能

- 新增 `toolkit conventions format` 子命令，把格式化器为 GFM 表格填充出的空白层归一为紧凑形态——只动单元格间距与列对齐填充、不改语义，幂等、跳过 fenced code block，支持 `--dry-run` 预演与 `--format json`
- `toolkit init` 检测到宿主疑似使用 prettier 时幂等托管 `.prettierignore`，把任务区整目录排除，从源头避免表格被列对齐填充（本包源仓库、任务区外置或即仓库根、无 prettier 迹象三种情形跳过）
- `toolkit conventions status` 与 `toolkit tasks check` 检出表格列对齐填充并提示上述两种处置（软告警，不阻断）
- 新增「跨仓库改动各自归档」协作纪律——任务档为仓库自述、只记本仓的改动与动机，多仓会话各仓各自建档归档，不在一仓记录里承载另一仓的工作痕迹；`scope` 只标本仓内的端 / 面（落 `SPEC.md` §0 第 5 条、`docs/ai-rules.md` 稳定纪律与 `fxri-plan-to-task` / `fxri-session-recap` 技能）

### ⚡ 优化改进

- 通用示例值去具体化——文档、技能、源码注释与测试中的示例端名统一为仓内端对 `web+server`，不再指涉具体接入方仓库
- 归档口径扩充——事实更正例外并入「口径变更引发的历史事实字段更正」，受影响的 `scope` 等事实字段可更正、唯一键 / 完成时间 / 状态 / 负责人仍冻结

### 📝 文档更新

- 变更集 bump 判定口径改为按改动的能力量级（全新大功能 / 独立新能力 →minor，存量能力上的修补与增量 →patch），与条目前缀解耦（口径真源见 `skills/fxri-release-changelog/references/changelog-format.md`）

## 1.11.6

> 2026-10-02 发布

### ✨ 新增功能

- `toolkit tasks normalize` 支持检出并解决归档文件中的 git 冲突标记——多人同天归档、`pull` 后同一归档文件出现冲突标记时，`--fix` 按并集去重 + 完成时间降序确定性合并（保留冲突两侧任务块、丢弃 diff3 的 `|||||||` base 段与全部标记行），无需人工逐块合并；`toolkit tasks check` 同步以软告警暴露

### 🐛 问题修复

- `toolkit tasks --export` 的 `.xlsx`「已归档」sheet 补齐「创建日期」列（列序：任务名 / 状态 / 负责人 / 范围 / 创建日期 / 完成时间 / 来源文件），使归档行导出 → 导入往返后 `created` 不再回落运行当天、落回正确的月份目录

### 📝 文档更新

- `fxri-plan-to-task` 技能 1.4.5 → 1.5.0：同步归档冲突标记处置口径（失败模式表、手工归档步骤、多写者约定）

## 1.11.5

> 2026-09-30 发布

### 📝 文档更新

- `fxri-release-changelog` 技能补失败模式口径——条目前缀按变更本身性质逐条定、与 bump 级别正交，避免因 bump 判为 patch 即整批按 `修复：` 登记新增能力
- `fxri-release-changelog` references 补「已发布版本块人工更正边界」口径——已发布版本块原则上不追溯改写，确需更正事实性错误时允许人工修改；仓库为真源，已发布的包产物与版本标签为不可变快照、不回补

### 🧹 清理移除

- 移除 CHANGELOG 归类对 `技能：`/`skills：` 两个前缀的识别——该前缀不在类型字典规范内，移除后代码前缀表与技能参考文档的前缀表一致；此类条目不剥离前缀、留原组

## 1.11.4

> 2026-09-30 发布

### ✨ 新增功能

- `toolkit init` 新增发布型包误打包提示——`package.json` 未标 `private` 且无 `files` 白名单时提醒发布面风险，并按现场列出会打进包的技能真源、入口薄壳、归属账与内置任务区，说明 `npm` 无 `.npmignore` 时退回 `.gitignore` 的打包面原理
- `toolkit skills install` / `status` / `remove` 新增 `--scope <project|global|all>` 项目面分发：完整真源落 `<仓库根>/.agents/skills/`，其余候选目录放入口薄壳，归属账落 `.toolkit/state.json`；`init` 幂等写入 `prepare` 钩子自动刷新，`--no-hooks` 可关闭

### 📝 文档更新

- `docs/faq.md` / `docs/guide.md` / `docs/cli.md` 等同步发布型包注意事项、`--scope`、`init --no-hooks` 与项目面分发说明

## 1.11.3

> 2026-09-29 发布

### ⚡ 优化改进

- 本仓库门禁类型检查此前读基础 `tsconfig.json`（其 `exclude` 排除 `**/__tests__` 等测试路径），测试文件长期落在类型检查盲区；现类型检查改走放行该排除项的 `tsconfig.typecheck.json`，并清零由此暴露的存量测试类型错误

### 🐛 问题修复

- `toolkit tasks check` 的本地配置忽略告警在 Windows 8.3 短名环境下丢失——`git rev-parse` 返回长名工作树根（如 `C:\Users\runneradmin\…`）而调用方路径为短名（如 `C:\Users\RUNNER~1\…`），工作树归属比对因路径形态不同失配被误归 `outside-repo`，「未忽略 / 已跟踪」告警静默吞掉；现两侧先取磁盘真实形态再比对
- 本地层配置查找的 home 边界在其形态与目录链不一致时失效（home 为短名或软链形态），存在把 `~/.toolkitrc.local.json` 误当项目本地层命中的风险；现 home 与目录链两侧统一取真实形态比对

## 1.11.2

> 2026-09-29 发布

### ✨ 新增功能

- 新增本地配置层 `.toolkitrc.local.json`，个人偏好不再挤占团队配置；本地文件与项目配置文件各自独立从工作目录向上查找、止于 home 目录（命中路径可位于仓库根之上）。⚠️ 读取该文件需 toolkit ≥ 本版本，旧版本会静默忽略、不报错，团队版本不一时会呈「我本地生效、同事机器不生效」
- 本地层按段内**字段级**覆盖，只覆盖显式写出的子字段、未写的保留团队值；数组字段（如 `redact` 的规则列表）为**整段替换、非追加**，个人补规则会顶掉团队整组规则，脱敏类配置请谨慎。段值为非对象（如 `"redact": "off"`）时告警并按未写处理，字段值写 `null` 与未写等价，本层不支持「删除 / 清空团队键」
- 新增 `toolkit config status` 只读子命令，查看三层配置的命中情况与关键值来源层，支持 `--format json` 供脚本消费、`--cwd <path>` 指定向上查找起点；报告只列层级、命中状态、来源层与键路径，**不打印任何配置值**（文本模式把 home 前缀折叠为 `~/…`，JSON 保留绝对路径），并同步提示「本地配置文件未纳入忽略」

### 🔧 功能调整

- `toolkit init` 追加的忽略片段新增 `.toolkitrc.local.json`；存量项目升级后不会自动获得该忽略行，需**重跑 `toolkit init`** 补写（逐行判幂等，重复执行不冗余），不想改团队 `.gitignore` 者可自行把该行写进 `.git/info/exclude`
- `toolkit tasks check` 对「检测到本地配置文件存在但未被忽略」给出软告警（不阻断；已入库的提示改用 `git rm --cached .toolkitrc.local.json` 清理），非 git 仓库、或文件位于当前仓库工作树之外时忽略判定不适用、不告警
- 本地层字段类型错误的键按未写处理并在 stderr 告警，非法 JSON / 顶层非对象等同样告警后视为未配置（降级不静默）
- 段值非对象（如 `"tasks": "oops"`、`"tasks": null`）的降级校验前移到三层读取路径，全局层 / 项目层与本地层口径统一——此前全局 / 项目层的这类问题只在运行时惰性告警，`toolkit config status` 取不到降级记录，同一现场两种口径
- `tasks.dir` 写空字符串不再静默回落——与类型不符同办，stderr 告警并按未写处理、回落默认 `.tasks`（降级不静默）
- `toolkit config status` 的「来源层」判定改为按分层覆盖语义（本地层段内字段级覆盖、项目层段级整体覆盖全局），修正此前项目层写了某段时该段未写字段被误报为全局层来源的问题
- `toolkit config status --format json` 的层状态字段 `levels[].hit` 改名为 `levels[].present`（`present` 仅表示配置文件存在，解析失败仍为 `true`）——对外契约变更，消费该字段的脚本需同步调整
- `toolkit config status` 文本模式下待处理项文案内嵌的路径一并折叠 home 前缀为 `~/…`（`--format json` 仍输出绝对路径）
- `toolkit config status` 新增两条 info 级提示——检测到 home 目录下的 `.toolkitrc.local.json`（按设计不参与本地层向上查找）时提示改放项目目录、出现未知配置段名（疑似拼写错误）时提示本版本未读取；info 不计入 warnings、不影响 CI
- `toolkit config status` 兜底异常不再置非 0 退出码，与「只读体检、退出码恒 0」的既有契约对齐
- `toolkit init` 写入的 `.gitignore` 片段补一行出口指引注释——告知不想改团队 `.gitignore` 者可将忽略行写进 `.git/info/exclude`；重跑 `init` 时该指引随片段头一并就地校正、不重复追加
- `toolkit init` 判定 `.gitignore` 各行是否已覆盖改用 `git check-ignore` 真实判定（能识破 `*.lock`、`*.local.json` 等用户手写的通配写法，含 `.git/info/exclude` 与上层 `.gitignore` 等全部来源）；非 git 仓库或 git 不可用时退回等价写法白名单，用户手写写法仍原样保留
- `toolkit tasks check` 的本地配置文件忽略告警改为展示相对 cwd 的路径——本地配置命中上层目录时显示 `../.toolkitrc.local.json`，不再只取文件名，与 `toolkit config status` 的绝对路径形成互补

### 📝 文档更新

- `toolkit config status` 补充报告字段说明——`env[]` 命中口径为「已设置且非空，不代表开启」（`FX_REDACT=0` / `FX_CHECK_WARN=0` 会被列出但实际关闭该能力，`FX_NO_UPDATE_CHECK` 设真值反而关闭更新检查）；`items[].scope` 取值枚举为 `配置` / `本地层`；并明确报告仅 `summary` / `items[]` / `warnings` 为稳定契约

## 1.11.1

> 2026-09-27 发布

### 🔧 功能调整

- 三处未来时间告警文案（`tasks check` / `tasks normalize` / `tasks archive`）补明「晚于当前系统时间 14 小时以上」阈值，与跨时区容差口径一致

### 🐛 问题修复

- 未来时间检测改用跨时区容差（UTC+14），UTC 运行环境下不再把本地墙上时间误报为未来时间

### 📝 文档更新

- `SPEC.md` 与技能配套规范 `task-spec.md` 声明主从关系，规范内容以 `SPEC.md` 为单一事实源
- 收敛全局规则页机制细节表述，改由技能包文档承载

## 1.11.0

> 2026-09-27 发布

### ✨ 新增功能

- `toolkit tasks stats` 支持 `--view` / `--status` 过滤（与 `tasks list` 口径一致，`--view` 默认 `all` 含归档），并补齐 `--date` 与 `--since` / `--until` 的互斥校验
- `toolkit tasks check` 补「`updated` 早于 `created`」「归档块完成日期与月份目录不符」与 BOM / 行尾空白 / CRLF-LF 混用等软告警，并增扫 `.changeset` 缺类型前缀条目，把检测前移到归档前
- 新增 `toolkit conventions` 命令域与规范载体 v2：`upgrade` 把 v1 升 v2（稳定 ID `C-<n>`、独立 `history.md`、内部引用改 ID），`status` 只读体检；`upgrade` 幂等、先判后写、异常形态拒绝写盘、支持 `--dry-run`
- `toolkit init` 生成 v2 载体骨架（`index.md` + `history.md`）与项目级技能入口壳，逐项报告动作；未安装全局技能时补 `toolkit skills install` 指引
- `toolkit tasks check` 对载体形态异常与技能入口壳给出软告警（壳标记版本不一致、或被 gitignore 覆盖不会随 git 分发）

### 🔧 功能调整

- `toolkit init` 的规范入口壳落在已存在的项目级技能目录，多 agent 各写一份、互不覆盖；一个候选目录都没有时回落 `.agents/skills`；`AGENTS.md` 指针块改为去路径化措辞

### ⚡ 优化改进

- `toolkit changelog format` 改为只重组识别到的语义分区，未识别分组原样保留；归类前后做条目数自检，减少即告警；`--history format` 恢复幂等
- 升级检查前置到提前返回之前，所有子命令路径一致触发，不再有路径漏检
- 项目无 `AGENTS.md` 时，`init` 的跳过提示说明本项目规范仍可经全局技能 `fxri-plan-to-task` 触达
- 入口壳告警合并并中性化：多落点各只告警一条、内联仓库相对路径与标记版本，单壳 / 多壳统一文案；gitignore 判定改为批量 `git check-ignore --stdin`
- `toolkit skills status` 人读输出折叠：全部正常的目标聚合为一行，仅问题项逐条展开；`--format json` 输出不变

### 🐛 问题修复

- `toolkit tasks export --redact` 改为全部文本列统一脱敏，消除 `任务名` 之外的漏网列
- `toolkit tasks normalize` 对无法识别完成时间的归档不再落「垃圾路径」，改为告警并跳过该项；`check` / `normalize` 分工在 help 中互相指引
- `toolkit skills status` 纳入状态文件登记的目标，软链目标不存在时判为悬空；`install --force` 保留既有落点形态；`remove` 回收残留空目录并提示软链穿透
- `toolkit tasks --import` 生成的归档块不再重复 H1，并保留来源 `updated` 字段（缺省时才用当天）
- `toolkit tasks archive` 同源多落点告警合并为一条；`depends_on` 裸标量按单元素接收、不可解析形态告警
- 未知 `--lang` 值回落默认语言时 stderr 告警，配置项类型不符回落默认值时同样告警（降级不静默）
- `tasks list` / `tasks stats` 全部 `--status` 取值非法时报错退出（退出码 1），不再静默忽略
- `tasks archive` / `check` / `normalize` / `stats` 传入不受支持的 `--export`（前三者再传 `--format`）时 stderr 告警忽略、命令继续
- 修复技能链接误报与误重指：路径不等时比对内容，内容与真源逐字一致时不再报错，`autoLink` 不再把健康链接重指到当前运行源
- `toolkit init` 重复执行按入口壳标记版本分流：标记落后或无标记时就地更新，标记不旧于当前版本保持不变，使「重跑 `init` 补齐」成为可用修复路径
- 修复 `toolkit conventions status` 在源仓库内误提示「未找到入口壳」的问题：源仓库不生成入口壳，现不再给出补生成建议

## 1.10.5

> 2026-09-21 发布

### 🐛 问题修复

- 技能软链锚点在 pnpm 全局布局下解析失效，升级后链接仍会悬空

  - 稳定入口解析原以「`.pnpm` 所在层目录名为 `node_modules`」为判据，该条件只在项目内安装时成立；pnpm 全局安装下 `.pnpm` 与 `node_modules` 并列（同在 `<pnpm 全局>/<global 段>/` 内），判据恒假 → 解析不出候选而静默回落含版本段的包实体路径，1.10.4 声称的悬空修复对全局安装实际未生效
  - 改为按目录名判定并补齐 `node_modules` 层：项目内取 `<项目>/node_modules/@fxri/toolkit`，全局取 `<pnpm 全局>/<global 段>/node_modules/@fxri/toolkit`，两种布局都锚在 pnpm 稳定入口（升级时由 pnpm 重写该入口）
  - 1.10.4 的发布描述与全局安装实际行为不符，建议直接升级至本版，勿停留在 1.10.4

## 1.10.4

> 2026-09-21 发布

### 🐛 问题修复

- 技能软链锚点改用 pnpm 稳定入口，项目内安装升级后链接不再悬空；pnpm 全局布局的稳定入口解析在 1.10.5 修复

## 1.10.3

> 2026-09-21 发布

### 🐛 问题修复

- 收紧 Node 引擎版本门槛至 `>=20.19.0`

  - 此前 `engines.node` 标为 `>=20`，但 `changelog` 透传 changesets 的子命令依赖宿主默认开启 `require(esm)`（Node ≥ 20.19.0、22 线 ≥ 22.12.0），20.0–20.18 实际不可用
  - 依据 14/16/18/20/22/24 六个主版本（含 20.19.0、22.11.0 等边界补丁号）实测结果收敛门槛，并同步 README、docs 站首页 / 指南 / FAQ / CLI 参考的环境要求与例外说明

### 📝 文档更新

- 文档站更新日志页启用右侧「本页目录」——该页为全量历史镜像，此前整页关闭目录；现只列版本号（`outline: [2, 2]`），避免各版本的分组标题一并进目录后随版本持续膨胀

## 1.10.2

> 2026-09-16 发布

### ⚡ 优化改进

- 发版链路在发布动作前补门禁关卡——`fxri-release-changelog` 技能要求发布前跑一次项目验收命令（如 `pnpm verify`），本仓库「发版链路」第 2 步由纯构建升级为该门禁（版本 1.1.1）
  - 关卡设在发布前而非推送前：发布到包仓库 / 制品库不可逆，推送失败重推即可
  - 原第 2 步为纯 `pnpm build`，构建工具不做类型检查，发布前无任何验收关卡
- 任务收尾链路明确「归档与沉淀 → 验收 → 提交」顺序，验收须晚于归档——归档会改写 `.tasks/`（写归档文件、删 active 源文件、清理空月份目录）且自身不做阻断式校验，早于归档跑验收就覆盖不到终态、归档产物等于无人校验；配套约定归档块「完成情况」只记改动事实与所用验证命令，不逐条抄门禁结果（避免先写结论后验证）（`fxri-plan-to-task` 1.3.2、`fxri-session-recap` 1.2.2；`docs/faq.md` 同步该顺序约束的表述）
- 本仓库验收步骤清单单源化——新增 `pnpm verify` 聚合门禁（步骤定义在 `scripts/verify.mjs`），本地与全部 CI 流水线共用同一份清单，消除此前四份手写清单彼此漂移导致的「本地自检通过、CI 才报错」
- `fxri-plan-to-task` 技能补「验收与 CI 同源、不手写清单」纪律（版本 1.3.1）
- 本仓库验收门禁补 `pnpm typecheck`——`pnpm lint`（eslint）与 `pnpm build` 均不做类型检查，此前仅靠 CI 暴露类型错误

### 🐛 问题修复

- 修复 `toolkit changelog` 帮助拦截与解析错误提示两处 TypeScript 类型错误（`noUncheckedIndexedAccess` 下索引与正则捕获组取值未兜底），改用解构判空与空串兜底；运行时行为与输出不变，本仓库 `pnpm typecheck` 恢复通过

## 1.10.1

> 2026-09-16 发布

### 🔧 功能调整

- 建档同主题判别改用客观口径——判据由主观的「有无增量」改为「本次是否产生仓库文件改动」（需写入版本控制的工作区文件增 / 改 / 删计入，纯读取、纯执行、纯汇报不计入），任何项目、任何人或 AI 均可按同一标准得到同一结论
- 收尾动作边界明确——提交、发版、推送、部署等收尾动作本身及其固有产物（版本号、更新日志、标签）不构成任务、不单独建档；这些动作过程中暴露的需改仓库文件才能修复的缺陷按普通任务建档
- 归档块补「事实更正」唯一例外——归档块仍不可追加新的工作内容，但后续核实推翻原块结论时可在正文末尾追加「修订记录」（保留原结论、不动元数据行、附更正时刻与依据）

### 📝 文档更新

- 同步 `SPEC.md`、`docs/guide.md`、`docs/ai-rules.md`、`AGENTS.md` 与 fxri-plan-to-task / fxri-session-recap / fxri-release-changelog 三技能措辞；规则层锚点随内容变更同批更新

## 1.10.0

> 2026-09-16 发布

### ✨ 新增功能

- 规范载体目录化与端分类——`.tasks/conventions.md` 单文件升级为 `.tasks/conventions/` 目录形态（`index.md` 唯一入口 + `common.md` 全端通用条文 + `<端名>.md` 各端专属条文，分册按需创建），端名与任务 `scope` 取值逐字一致、`index.md` 顶部端清单为端的唯一权威，读取分层为「常驻只读 index + 按 scope 命中加载分册与 common」
- 存量迁移支持——旧单文件可整体搬为 `index.md` 后逐条给归属建议、用户确认后拆分册，迁移三段式可中断不丢内容；新旧形态兼容读，两者并存时以目录形态为准
- 内容修订路径——旧条目过时走「演进记录留痕 + index 行更新 + 状态置 `已废弃`」，不删行

### 🔧 功能调整

- `toolkit init` 预生成 `conventions/index.md` 骨架（含端清单模板）；`toolkit tasks check` 在旧单文件残留或 `conventions/` 缺 `index.md` 时给软告警，即迁移入口

### ⚡ 优化改进

- fxri-plan-to-task 升级 1.2.0（写入归属判定 + 存量迁移触发）、fxri-session-recap 升级 1.2.0（R3 落点、读取分层、内容修订与形态迁移分流）、fxri-release-changelog 升级 1.0.12（发版流程补「润色后跑一次 `changelog --history format` 归一历史块」步骤与失败模式，references 补格式化不动点口径）

### 📝 文档更新

- 补迁移教程——guide 新增「存量规范载体迁移」节，handbook 新增「四、规范载体迁移」节，faq 新增迁移问答
- 修正文档承诺未实现——guide 原称 conventions.md「两种形态 skill 均支持」，实际 SPEC.md / task-spec.md / 两个 SKILL.md 均无「形态」概念，已按实际能力改写

## 1.9.5

> 2026-09-16 发布

### 🔧 功能调整

- CLI 解析错误文案改为中文并附帮助指引

  - 未知命令、未知选项、参数个数不符统一输出 `⚠️` 开头的中文提示（如「未知命令「zzzz」。」），并附一行 `运行 toolkit --help 查看可用命令`；相似命令/选项提示（原 `(Did you mean skills?)`）一并转中文，退出码仍为 `1`
  - 修掉 commander 自行写 stderr 导致的英文原文残留，解析错误不再出现英文与中文两行并排
  - `changelog` 透传给 changesets 的英文输出不受影响

### ⚡ 优化改进

- CLI 帮助清单条目与子命令自身 Usage 行对齐

  - 帮助清单条目统一为「命令名 + 该命令自身 Usage 行」，消除同一命令两套渲染规则：无自有选项但有子命令的域（如 `skills`）不再只剩光杆名字，现与 `skills --help` 的 Usage 行同形（`skills [options] [command]`）
  - 帮助选项与隐式帮助子命令的描述由 commander 英文默认值改为中文：`-h, --help` 与 `help [command]` 均为「显示帮助」，与 `-v, --version 显示版本号` 及 `docs/cli.md` 既有表述对齐
- 根描述文案收敛为单一真源

  - 新增 `src/about.ts` 导出 `DESCRIPTION`，CLI 根描述、站点 `description` 与 `og:description` 改为引用该常量，消除同一句话多处手写
  - `toolkit --help` 首行描述补上句末句号，与 `package.json` / 文档既有文案对齐（原缺句号即由此漂移导致）
  - 文档一致性用例新增根描述断言：`package.json`、`README.md` 与 `docs/index.md` 首页 tagline 的共用文案改一处漏改其余即失败

### 🐛 问题修复

- 修复 changelog 与 tasks 两条静默误执行路径

  - `toolkit changelog version --help` / `toolkit changelog format --help`：`--help` 原本被选项透传语义当作操作数丢弃，命令照跑——`version` 会真发版、`format` 会真改写 CHANGELOG；现改为打印 changelog 本域帮助并正常退出。`changelog --help` 与 `changelog add --help` 等不受影响，仍交由 changesets 输出其帮助
  - `toolkit tasks <未知子命令>`：原本静默回落为「任务总览」且 exit 0 无任何提示，现报 `⚠️ 非法子命令「x」，仅支持 archive / check / normalize / stats（留空查看任务总览）` 并 exit 1

## 1.9.4

> 2026-09-15 发布

### ✨ 新增功能

- CHANGELOG 支持追溯改写历史版本块

  - `toolkit changelog version/format` 新增 `--history`：历史版本块内条目按其类型前缀与既有组标题归位、组标题转写为当前语言口径；无法识别的分组连同标题原样保留，不臆造归属（不加该选项时仍不动历史块）
  - 条目类型前缀表补充 `技能：` / `skills：`（归入「优化改进」）与 `依赖：`（归入「依赖变更」），历史组标题（如 `补丁修复`）也能识别归位
  - 修复 Windows 检出（`core.autocrlf`）下 `pnpm sync:changelog-doc` 因 CRLF 误判「未发现版本块」而中止
- CHANGELOG 归类后剥离条目已识别的类型前缀

  - 条目归入语义分组后，已识别的 `类型：` 前缀被剥离（`- 修复：xxx` → `- xxx`），类型由分组标题承接，明细不再与之重复
  - 未识别的前缀（如正文里的 `说明：`）与依赖源条目 `- 更新依赖`（缩进续行承载包版本）原样保留；剥离后文本为空也不改动
  - ⚠️ 按条目类型检索（`grep "^- 修复："`）不再可用：前缀只作归类信号，分组后不再保留
  - `changelog` 域选项透传曾导致 `--history` 写在子命令之后被静默忽略，文档与技能中的 `toolkit changelog format --history` 写法已更正为 `toolkit changelog --history format`

### ⚡ 优化改进

- skills remove 报告目标改用显示名标识

  - 卸载报告的目标行由绝对路径改为 `显示名：路径`，与 `skills install` / `skills status` 同口径；canonical 目录优先判为「canonical（多家 agent 共读）」，内置快照表内的 agent 目录打印其显示名
  - 表外目标（自定义 `--dir`）无显示名可反查，回落为绝对路径；`--format json` 的每个目标新增 `label` 字段（反查不到为 `null`）

### 🐛 问题修复

- 修复文档站内跨页锚点死链并补全守门覆盖

  - 修正 README 与 docs 中 11 处跨页锚点死链（标题改名后未同步，点击不跳转），涉及 `README.md`、`docs/cli.md`、`docs/faq.md`、`docs/getting-started.md`、`docs/guide.md`、`docs/handbook.md`
  - 文档一致性测试的锚点用例此前会跳过全部跨页链接（VitePress 把 `.md` 渲染为 `.html` 后被扩展名判断排除），现归一回 `.md` 并按所在目录相对解析
  - 扫描范围由 `docs/*.md` 扩至仓库根 `*.md` 与 `skills/**/*.md`，跨页锚点写错、标题改名漏同步均会拦下
- 修复 Windows 检出环境下文档一致性测试的换行误判

  - 「更新日志镜像」用例比较前统一把 CRLF 归一为 LF，Windows 检出（`core.autocrlf`）不再把换行差异误报成「漏跑同步脚本或手改镜像页」
  - 内容差异（漏跑 `pnpm sync:changelog-doc` 或手改镜像页）仍照常拦截

## 1.9.3

> 2026-09-14 发布

### ⚡ 优化改进

- 任务区写盘、导入与诊断稳定性改进

  - 写盘更稳：归档前按块标题去重（重跑幂等）；`normalize --fix` 逐文件容错，单个文件异常不再中断整轮
  - 写入锁记 pid 与进程启动时间：接管前校验持有进程是否存活，释放时校验持有者为自身，降低陈旧锁被误接管的风险
  - 导入契约明确并落地：`--target archive` 按块标题去重（同一份文件重复导入幂等），块内状态取自数据（不再强制改写为「已完成」）；契约已写进 `docs/cli.md`
  - frontmatter 未知字段不再被丢弃：解析时原样透传并软告警，导入回写按原顺序重建
  - 归档块判定改以块间 `---` 为唯一权威边界：`## 标题` 与 `> 元数据` 行降为校验项，正文内部的 `## ` 小节不再可能被误切（`SPEC.md` 同步）
  - `tasks check` 与 `tasks normalize --check` 的问题输出带 `file:line`，便于编辑器跳转；库导出 `CheckIssue` 新增可选 `line` 字段
  - 文档补齐：内置脱敏规则清单（`docs/config.md`、`docs/guide.md`）、`--redact` / `--warn` 的域级作用域与 `tasks` 域选项表（`docs/cli.md`）、站点导航与更新日志入口
  - skills 状态检查新增版本双写位比对（frontmatter `metadata.version` 与正文声明值），不一致时软告警
  - 新增机器化质量门测试：脱敏规则清单 ↔ 文档一致、`docs/*.md` 内锚点可解析、`docs/changelog.md` 与 `CHANGELOG.md` 一致、`CheckIssue.line` 行号定位
- 降低任务区随年限增长的全库线性扫描与整文件重写开销

  - `tasks check`：依赖索引改惰性构建（active 无 `depends_on` 时不再扫全量归档），重名检测与依赖命中改 `Set`、命中即早退
  - `tasks --import --target archive`：按目标日期分组写入，同一归档文件只读改写一次（去重、降序、块间 `---` 分隔口径不变）
  - `tasks --view all` 与终端总览：复用同一次查询结果，不再对同一视图重复扫描
  - `tasks normalize`：归档文件只解析一次，消除同一文件双解析
  - 归档读取按时间过滤下推月份目录白名单，跳过范围外年月目录（命中判定不变，条件不可解析时退回全量）
  - 归档锁新增绝对接管上限：持有进程看似存活但锁龄超过上限时强制接管，兜底 pid 复用导致的归档永久静默跳过（正常并发仍跳过并告警）；`SPEC.md` 与 `docs/guide.md` 同步该自愈语义

### 📝 文档更新

- 文档与 API 契约补齐，`tasks stats --format` 与其余命令对齐

  - `docs/api.md`：`parseBool` 认值补 `yes/no`；补列 `CheckIssue` / `IssueLevel` / `NormalizeIssue` / `NormalizeResult` 四个类型导出
  - `docs/guide.md`：frontmatter 字段表补 `scope`；归档规则补「块间 `---` 是任务块唯一权威边界」；技能表补版本列
  - `docs/cli.md`：补 `check` / `normalize` 问题清单的 `文件:行号: 描述` 输出形态
  - `skills/README.md`：技能表补版本列（取自各 SKILL.md 的 frontmatter `metadata.version`）
  - `toolkit tasks stats --format` 补取值校验：非法值告警并置退出码 1，与其余命令同口径
  - `AGENTS.md`：规则层锚点纪律明确 `SPEC.md` 无 fenced 包裹、整篇即快照，锚点位于正文首行即合规
- 规则层锚点由数字版本号改为更新时刻，提交信息规则拆为独立页

  - 锚点由 `> 规范版本 x.y` / `> 规则版本 x.y` 改为 `> 规范更新时间 YYYY-MM-DD HH:mm`（`SPEC.md`）与 `> 规则更新时间 YYYY-MM-DD HH:mm`（`docs/ai-rules.md`、`docs/commit-rules.md`）——两个规则页锚点位于 fenced 可复制块内部首行，`SPEC.md` 无 fenced 包裹、整篇文件即快照，锚点位于正文首行；复制过旧规则的快照首行格式不同即说明需重新复制对应页面
  - 更新纪律写全：任何内容变更（含错别字、标点、链接）以变更时刻更新所属文件锚点，未变更的文件不得刷新，同一批改动取同一时间，只随内容变更递增、不随发版例行抬高
  - 提交信息规则从 AI 全局规则中拆出为独立页 `docs/commit-rules.md`，与 AI 全局规则相互独立、可只取其一（该规则替换既有提交惯例，与 Conventional Commits、commitlint 直接互斥，故单独成页）

## 1.9.2

> 2026-09-14 发布

### ✨ 新增功能

- CHANGELOG 按变更类型语义分组，分组维度与版本号维度解耦

  - 变更集条目以 `类型：` 前缀开头（`新增：`/`修改：`/`修复：`/`优化：`/`清理：`/`文档：`/`重大：`），`toolkit changelog version/format` 据此把条目归入语义分组；`文档：` 条目出现在 patch 版本里即进「📝 文档更新」，不再被版本号绑架
  - 分组标题由 4 组扩为 8 组 + 1 兜底组，空组省略：🚨 重大变更 / ✨ 新增功能 / 🔧 功能调整 / ⚡ 优化改进 / 🐛 问题修复 / 📝 文档更新 / 🧹 清理移除 / 🔗 依赖变更 / 📦 其他变更
  - 无前缀条目按所属源组标题兜底：Major 块 → 重大变更、Minor 块 → 新增功能、Patch 块 → 其他变更；⚠️ patch 无前缀条目的落点由「🐛 补丁修复」改为中性的「📦 其他变更」，不再把非修复改动误标为修复
  - 历史版本块保留当时口径，`changelog format` 不追溯改写；前缀识别与输出语言解耦（全局前缀表全语言共用），变更集条目语言与输出语言不一致时仍正确归组
  - 自定义语言新增可选 `groups`（`[{ slot, title, prefixes? }]`）声明本语言标题与自有前缀；未声明时退化为纯替换，既有配置无需改动
  - ⚠️ 对外契约变化：`--lang en` 的组标题文本变化（如 `### ✨ Minor Changes` → `### ✨ Added`）；`--warn` / `FX_CHECK_WARN` / `check.warnings` 适用范围由任务校验告警扩为「任务校验告警 + 变更集条目缺类型前缀告警」，同一开关一并开关闭；新增公共导出 `SLOT_PREFIXES` / `SemanticSlot`
  - 发布日期行识别由硬编码「发布/released」改为「当前语言 `released` ∪ 全部内置语言 `released`」后缀集合——自定义语言（日文等）按自身 `released` 识别，内置 zh / en 互跑（如中文日志用 `--lang en` 输出）也不再重复追加日期行
- 技能版本可视化，旧会话可自校验技能内容是否过期

  - `toolkit skills status` 常驻打印包内各技能真源版本，`--format json` 新增 `skillVersions` 字段与逐项 `version`，作为磁盘基准值；`toolkit skills install` 报告同样逐项带版本
  - 每个 SKILL.md 正文首部显式声明版本（与 frontmatter `metadata.version` 一致），版本随技能内容进会话上下文；被问版本时报上下文声明值，与 `skills status` 打印的磁盘值对照，不一致即说明会话上下文已过期，开新会话即可
  - 措辞澄清：技能随包同源分发（与 CLI 同一发布批次），技能内容版本独立编号

### 🔧 功能调整

- 任务统计 JSON 输出补齐 schemaVersion 锚点

  - `toolkit tasks stats --format json` 顶层新增 `schemaVersion: 1`，与 `tasks --export`、`skills --format json` 统一口径；既有统计字段保持原位与语义不变，按旧 key 读取的消费方不受影响
  - 序列化收敛为技能域与任务统计域共用的单一出口，schemaVersion 锚点位置不再分散维护

## 1.9.1

> 2026-09-13 发布

### 🐛 问题修复

- CLI 命令输出完成后卡顿约 1 秒才退出：升级检查改为「同步读缓存 + 分离子进程后台刷新」，父进程零网络、立即退出。

  - 消除尾部卡顿：所有命令退出耗时回落到 ~100 ms（此前每条命令固定多等 0.8–1.4 s）
  - 升级检查不再阻塞进程退出：网络查询移入 detached 后台子进程，父进程只读系统临时目录缓存
  - 离线/内网不再每条命令重复联网：查询失败也写入 1 小时负缓存（成功结果仍缓存 24 小时）
  - 升级提示改为「下一次命令从缓存提示」（首次运行仅静默刷新缓存），与 update-notifier 语义一致

## 1.9.0

> 2026-09-12 发布

### ✨ 新增功能

- `toolkit skills` 命令域：技能随包分发、与 CLI 同源同版本，升级只需 `pnpm add -g @fxri/toolkit`，告别「CLI 走 npm、技能走 GitHub」两条供应链的版本漂移

  - `toolkit skills install [--copy] [--dir <path>] [--dry-run] [--force] [--format json]`：取自包内 `skills/` 唯一真源，默认软链（升级自动跟随）；链接创建失败自动降级为副本并打印 ⚠️。目标三层：主目标 `~/.agents/skills/`（多家 agent 共读）→ 内置表内已安装的各 agent 全局技能目录 → `--dir` 兜底表外 agent
  - `toolkit skills status [--format json]`：报告链接与副本现场——软链正常 / 悬空 / 指向别处 / 副本已同步 / 副本已漂移 / 缺失 / 同名冲突
  - `toolkit skills remove [--dry-run] [--format json]`：只清理本包状态文件登记的产物，绝不误删用户自装技能；卸载 CLI 前先跑它可避免留下悬空链接
  - `toolkit skills path [--format json]`：输出包根路径，便于委托上游安装器覆盖表外 agent
  - `--format json` 输出机器可读报告到 stdout，四个子命令统一携带 `schemaVersion: 1` 锚点；`install` / `remove` 另带 `dryRun` 字段区分预演与实跑
  - 新增配置 `skills.autoLink`（默认 `true`）：每次运行 CLI 时自动补链并修复指向错误的链接（CI 环境跳过、失败静默，可用 `.toolkitrc.json` 关闭）
  - 新增配置 `skills.autoLinkReplaceForeign`（默认 `true`）：自愈遇到同名实体目录 / 普通文件时先清理再重建为软链；设为 `false` 则一律不动，交由 `toolkit skills install --force` 显式处置
  - 升级提示与文档口径统一为一条命令：升级后开新会话即可加载最新技能
  - 文档补充「从上游安装器迁移到内置命令」的指引：旧流程在 `~/.agents/skills/` 残留的实体副本会被报为同名冲突，`toolkit skills install --force` 一键接管；并提示不要与上游安装器混用，否则升级时冲突复发

### ⚡ 优化改进

- 技能链接自愈的开销与稳定性，并修正 `toolkit skills status` 的处置指引

  - 自愈改为一次列目录取现场条目类型，不再逐条 `lstatSync`，稳态开销明显下降
  - `toolkit skills status` 末尾汇总按型给出指引：缺失 / 悬空 / 指向错误 / 副本漂移用 `install` 补齐，同名冲突用 `install --force` 覆盖
  - 收窄状态分类口径：同名实体目录只有登记为本包副本时才算「副本已漂移」（裸 `install` 即可刷新），未登记的属用户 / 上游产物，报「同名冲突」并需 `--force` 覆盖

### 🐛 问题修复

- 修复自愈「重建失败」时状态记录被静默写掉的问题：失败条目保留在 `~/.agents/.toolkit-skills.json`，下次运行仍会重试
- 诊断提示污染机器可读输出：链接自愈提示与升级提示改走 stderr，stdout 保持纯 JSON

  - `toolkit tasks --format json` 等机器可读输出不再被追加提示文本，可安全 `JSON.parse` 与管道消费
- `updateCheck` 的缓存文件带 BOM 时不再误判为损坏而重复联网（与配置文件、技能状态文件同口径剥离 BOM）

## 1.8.3

> 2026-09-07 发布

### 🐛 问题修复

- 范围字段多值口径落地——scope 多值以半角加号分隔（如 `web+server`），`--scope` 过滤改按任一段命中，`tasks stats` 按范围拆段统计
- `tasks check` 对范围含顿号/逗号/括号软告警并给修复指引
- `tasks import` 对范围列含顿号/逗号/括号提示按单值写入（不自动转换）
- `tasks normalize` 检出历史归档范围污染，顿号/逗号分隔可 `--fix` 自动归一为半角加号，括号注释仅提示人工确认

## 1.8.2

> 2026-09-06 发布

### 🐛 问题修复

- 「未提交任务文件无法恢复会话」的过度归因：恢复读磁盘 `.tasks/` 文件而非 git，同机同目录下未提交也能恢复；git 提交仅保障跨环境（换机/工作区清理）持久性。fxri-session-recap 失败模式表与 docs/guide 反模式句同步修正并补边界说明。

## 1.8.1

> 2026-09-06 发布

### ⚡ 优化改进

- fxri-plan-to-task 升级 1.1.1——状态机补阻塞解除归属：进入阻塞记录原因，解除阻塞须用户确认并转回进行中

### 📝 文档更新

- guide.md「conventions.md 规范沉淀地」补两种形态说明——条文式（无规则层项目存全文）/ 溯源索引式（有 AGENTS/全局规则项目指向单一事实源），skill 写入读取机制两种形态均支持
- skills/README 发布前核对清单补强——技能用途描述须同步 docs/guide 技能表与「技能列表」表；变更走本仓库质量门（三方一致 + tasks check + pnpm test）

## 1.8.0

> 2026-09-06 发布

### ⚡ 优化改进

- `fxri-plan-to-task`——completed 按四级时间源取证，归档后做任务级规范沉淀；「先查后写」强化为动手前置建档评估，补同主题判别表
- `fxri-session-recap`——会话收尾全量沉淀、四级时间源还原真实完成时间、新会话三层恢复覆盖全部任务、历史任务时间批量修正、规范沉淀进 `.tasks/conventions.md`
- `fxri-release-changelog`——触发词改为语义化意图描述，并补反例排除「提交版本 ≠ 发版」

### 📝 文档更新

- AI 全局规则模板收尾改自动提交——任务收尾的 git 提交自动执行（作者个人收紧，可参考可裁剪），推送与发版仍需用户明确
- 新增独立「操作手册」页（按场景列出该说什么/做什么，覆盖首次使用到发版升级全闭环）；ai-rules.md 全局规则收敛为薄壳——可变细节进 skills，升级 skills 后无需再手动同步规则全文

## 1.7.4

> 2026-09-05 发布

### 📝 文档更新

- 简化文档站部署指引——收敛为 GitHub Pages 单一自动构建方案，移除多平台部署表格与手动部署步骤

## 1.7.3

> 2026-09-05 发布

### 🐛 问题修复

- 清理 CHANGELOG 双前缀伪影——变更集条目以 `- ` 开头时 changesets 会写入 `- - 条目` 首行并缩进续行，`changelog version/format` 现自动还原为顶层条目，无需人工润色

### 📝 文档更新

- 品牌展示位统一中文名——文档站首页 hero 主视觉、README 与 CHANGELOG 的标题从 npm 包名 `@fxri/toolkit` 改为中文品牌「方弦工具集」，与站点标题、导航 logo、页脚一致；安装命令、代码示例等技术指称位置的包名保持不变

## 1.7.2

> 2026-09-05 发布

### 📝 文档更新

- 新增 Gitee 镜像渠道并推荐国内网络优先——README 顶部加 GitHub/Gitee 双入口（issues 反馈同双平台），FAQ 新增「国内网络优先走哪条渠道」（源码克隆、skills 走 Gitee 镜像本地源安装、CLI 走 npm 并给 npmmirror 提速、Gitee Issues 反馈），skills/README、新手指南与完整攻略补对应入口链接
- 文档站「在 GitHub 上编辑此页」与站点规范地址（sitemap/og:image）支持按部署平台注入 `SITE_URL`/`REPO_URL` 环境变量——默认 GitHub，Gitee Pages / 私有 GitLab Pages 构建时各注入自己的仓库与域名（值由平台 CI/CD 变量提供，不进仓库源码）

## 1.7.1

> 2026-09-05 发布

### ✨ 新增功能

- `.toolkitrc.json` 全局配置层：读取 `~/.toolkitrc.json` 存放个人偏好（关升级提示、个人脱敏规则、自定义语言表等），与项目配置按配置段合并——项目出现的段整体覆盖全局同名段，未配的段取全局；覆盖链为 CLI > 环境变量 > 项目 > 全局 > 默认值；全局文件非法或带 BOM 同样忽略不报错

### 📝 文档更新

- 推荐的 AI 全局规则模板升级——代码规范补验证纪律（改动后跑测试/类型检查，失败先修复再交付）；方案落盘并入执行顺序（先项目级 `pnpm exec toolkit` 后全局）与「先查后写」，保留质量门 normalize 指引、「三口径冲突以 check 为准」与不可用双分支处理；配套安装节与规则全文去重，逐段说明补齐对应条目
- 文档站首页改版为 VitePress home 布局——新增 hero 标语与行动按钮、六张 features 能力卡片，正文精简为痛点能力速览并入卡片，保留 30 秒上手与文档索引；快速开始改为 code-group 四包管理器标签（pnpm/npm/yarn/bun）并前移至首节，浏览器标签补首页专属标题，文档索引 API 参考文案修正为「作为库引入 Node 项目」
- FAQ 新增「内网或离线环境怎么装」指引——按网络受限程度分三档给出 CLI 与 skills 的安装路径（GitHub 不可达时改以已装 CLI 包目录为 skills 本地源，实测验证），新手指南安装节末尾补入口链接
- 文档站补齐站点成熟度要素——站点标题与内页标签统一为中文品牌「方弦工具集」，导航栏新增品牌 logo 与 favicon，配置社交分享卡片 og-image（1200×630 品牌图）；开启「最后更新于」（按 git 提交时间）与「在 GitHub 上编辑此页」，新增站点页脚与 sitemap；新增「更新日志」页面镜像根 CHANGELOG.md 全量历史并挂载导航与侧栏入口，提供 `pnpm sync:changelog-doc` 命令随发版自动同步；README 顶部增加品牌 logo；CI 文档站构建改为完整克隆保证 lastUpdated 日期准确

## 1.7.0

> 2026-09-05 发布

### ✨ 新增功能

- `toolkit init` 命令，一键初始化 .tasks 任务区
- `tasks stats` 任务周期统计视图
- 完成时间检测：晚于当前系统时间与恰为零点整（疑似只填日期被补零），check/normalize/archive 三道关口告警
- CLI help 底部新增文档链接，运行时新增版本升级检查提示
- fxri-session-recap 会话归档技能

### ⚡ 优化改进

- 补充多包管理器下 pnpm 置前的探测顺序，收尾边界口径与文档同步

### 🐛 问题修复

- 任务文件解析兼容 UTF-8 BOM（Windows PowerShell 写盘不再误报缺少 frontmatter）
- 修正版权主体与版权符号

### 📝 文档更新

- 新增 VitePress 文档站点与 docs 八篇文档体系，README 重构为入口页，全文档统一 pnpm 命令

### 🔗 依赖变更

- commander 降级至 Node 20 兼容版本

## 1.6.5

> 2026-09-04 发布

### 📝 文档更新

- 同步 skills 与最新工具能力——fxri-release-changelog 的 changelog-format.md 版本块示例与规则补「标题与日期行间保留空行」（对齐 1.6.4 空行修复后的真实输出）；fxri-plan-to-task 的 task-spec.md 自查清单补「active 根目录直放」与「游离于 active/ 之外」两项软告警（对齐 1.5.3/1.6.3 的 check 能力）；两 SKILL.md metadata.version 递增至 1.0.1

## 1.6.4

> 2026-09-04 发布

### 🔧 功能调整

- CLI `--help` 描述文案与 README 首行对齐——由「开发工程化工具集：任务管理 + 多语言 CHANGELOG 发布」改为「专为多人 + AI 跨项目协作打造：任务管理 + 多语言 CHANGELOG」（纯文案，无逻辑变化）

### 🐛 问题修复

- changelog format 补发布日期时把日期行紧贴版本标题（缺空行）——现在版本标题与日期行间始终保留空行，并对历史已存在的缺空行数据自动自愈

## 1.6.3

> 2026-09-04 发布

### ✨ 新增功能

- tasks check 检出游离于 active/ 之外的任务文件并软告警——对带 {YYYYMMDD}- 日期前缀且位于 .tasks 根目录或漏建 active 层的 {YYYYMM}/ 子目录下的 .md 给出提示（此类文件不被 tasks/check/archive 读取），避免建档错位后无任何反馈

## 1.6.2

> 2026-09-04 发布

### 📝 文档更新

- 补充隐私脱敏禁用行为说明——README 自定义规则说明明确被禁用规则不参与匹配、敏感信息原样保留；效果示例增加手机号默认脱敏与禁用保留的对照行，并注明禁用仅影响该类匹配

## 1.6.1

> 2026-09-04 发布

### 🐛 问题修复

- tasks archive 对 CRLF 源文件做换行还原时二次转换产生双重 CR（`\r\r\n`），读取 active 任务统一归一为 LF、解析归档块剥离孤立 CR；文档修订：根 README 特性列表补零依赖 AI 技能包条目；skills/README.md 补 npm 包自带技能目录路径（node_modules/@fxri/toolkit/skills/）；fxri-plan-to-task 可选加速节补 `toolkit tasks normalize`

## 1.6.0

> 2026-09-04 发布

### ✨ 新增功能

- 新增零依赖 AI 技能包 skills/（fxri-plan-to-task、fxri-release-changelog）

  - 按 Agent Skills 开放标准沉淀方案落盘与发版 CHANGELOG 两套工作流，纯 Markdown 规范，不绑定语言与工具
  - README 与 SPEC.md 增加技能包交叉引用；skills/README.md 新增 `npx skills add fxri-net/toolkit` 安装方式
  - npm 包 `files` 加入 `skills`，安装 @fxri/toolkit 即随包获得技能目录

## 1.5.6

> 2026-09-03 发布

### ✨ 新增功能

- JSON 导出携带 `schemaVersion`，导入端读取更高版本时告警（仍按当前字段尽力解析）
- 测试补强：CSV/XLSX/JSON 往返、开关解析、时间过滤、底层模块（原子写/扫描/路径）直接用例，单测 71 例全绿
- vitest 覆盖率门槛（thresholds）接入 CI（新增 coverage job）
- CI 增加 Windows 回归 job 与 CLI `--help` 冒烟
- README 新增公共 API 表与「任务状态单一事实源」说明

### 🐛 问题修复

- archive 合并写回按原文件换行风格还原（LF/CRLF），避免 Windows 仓库追加新块产生混合换行
- 导出（CSV/JSON/XLSX）改原子写，中断不再残留半截文件
- 展示路径统一走公共 helper（`displayRel`），跨命令输出一致
- check 已归档索引增加 mtime 感知缓存，重复校验不重复读盘
- `normalize --fix` 错月迁移后清理遗留空月份目录
- 标题提取 / 状态枚举 / 日期解析收口到公共实现（list/query/validate/import/changelog 共用），消除多份近似代码
- tsconfig 开启 `noUncheckedIndexedAccess`，数组与索引访问显式兜底

## 1.5.5

> 2026-09-03 发布

### 🐛 问题修复

- archive/check/normalize 子命令统一「操作失败」兜底，不再抛原始 Node 堆栈
- `printTasks`（库 API）复用 board 渲染，分组顺序/日期口径/文案与 CLI 完全一致
- import 获取共享写锁（.archive.lock），防止并发导入互相覆盖
- 归档元数据段解析抽公共 `parseMetaSegments`（query 展示与补全复用）
- tsconfig 开启 `strict`（存量零错误基线）
- check 的待办词标记扫描跳过标题行，避免标题含「待办」等词误报
- import 输出路径统一为相对任务目录的 `/` 分隔
- 缺失 `depends_on` 指向已归档任务时，提示精确归档位置
- archive 汇总计数口径：按任务数统计（此前按日期文件数误报）

## 1.5.4

> 2026-09-03 发布

### 🐛 问题修复

- `tasks normalize` 增加 `--check` 显式只读别名，并与 `--fix` 互斥报错
- `--status` 非法值改为告警并忽略，不再静默
- 任务总览对 `STATUS_ORDER` 之外的未知状态以兜底分组展示，并在汇总计入「其他」（不再“数得到看不到”）
- `depends_on` 解析抽公共 `parseDepends`（validate/query 复用），消除双实现漂移
- 导出目标目录不存在时自动创建（CSV / XLSX / JSON）
- `normalize --fix` 会把放错月份目录的归档文件移动到正确月份目录
- archive 多日期归档逐日失败汇总（失败日不删除 active，可安全重试）

## 1.5.3

> 2026-09-03 发布

### 🐛 问题修复

- 补元数据整行重写改错状态：`normalize --fix` 现在保留原行已有的 负责人/状态/范围 段，仅补缺失项（防 `已放弃` 被误改成 `已完成`）
- `normalize --fix` 计数与行为对齐：降序重排、冗余分隔符清理计入修复数，并输出按文件的动作明细
- `printTasks` 日期列改为 created 优先（与 board/导出口径一致）
- `check` 对 active 根目录直放任务文件给出 {YYYYMM} 月份子目录软告警
- `--owner/--scope` 支持逗号分隔多值过滤
- changelog 域补单测（标题转换/去 hash/去重/补日期/脱敏/collect 排除），collect 排除 coverage；README 补充 changelog 中文润色示例

## 1.5.2

> 2026-09-03 发布

### 🐛 问题修复

- `.toolkitrc.json` 改为从当前目录向上查找最近一份（支持 monorepo 子目录运行）；脱敏作用范围与配置查找写入 README
- `printTasks` 分组顺序统一为 STATUS_ORDER；`check.pendingMarkers=false` 可关闭词标记扫描（复选框开关保留）
- `normalize` 检出放错月份目录的归档文件（如 archive/202608/20260903.md）
- archive / import / 归一化写文件原子化（临时文件 + rename），降低半截文件风险
- `tasks --strict`：任务目录不存在时报错退出（默认仍容错为空结果）
- 工程化：vitest v8 coverage（`test:coverage`）、eslint `--cache`、CI 增加自身 `.tasks` 体检、README 增加 CI badge

## 1.5.1

> 2026-09-03 发布

### 🐛 问题修复

- archive 合并覆盖归档文件自定义 header（改为保留既有头部，仅新文件用默认文案）
- 陈旧归档锁阻塞：锁文件超过 10 分钟视为进程残留自动清理接管，正常并发仍跳过
- `--target` 非法值校验报错退出（对齐 --view/--format 校验）
- 漂移块迁移到已含同名块的目标归档文件时给出重复告警
- `created`/`completed` 增加真实日期校验（月份/日期越界软告警，如 2026-02-31）

## 1.5.0

> 2026-09-03 发布

### ✨ 新增功能

- 任务校验增强：`depends_on` 引用自动归一（带 `.md` 后缀也能命中与成环检测）；新增软告警——缺 owner/created、created 与文件名日期不一致、文件命名不规范、`completed` 仅日期未补全；未勾选 `- [ ]` 默认纳入未闭合待办扫描（`check.includeCheckbox` 可关）
- 归档归一化增强：`normalize` 检出疑似任务块（元数据缺「完成时间」被并块）；`--fix` 自动把完成时间漂移块迁移到对应日期归档文件并清理冗余分隔符
- `completed` 落盘统一补 `00:00` 定宽；导入文件名冲突序号改为 `-1` 起，标题截断时告警
- 脱敏规则配置即时生效（移除模块级缓存）；自定义导入列映射英文键大小写不敏感
- 空态提示区分「视图为空 / 过滤无匹配」，默认视图带过滤空结果时给出 `--view` 引导提示
- 工程化：接入 vitest（20 用例）、eslint/typecheck 脚本与 GitHub Actions CI，补充 changesets 自举发版说明

## 1.4.2

> 2026-09-03 发布

### 🐛 问题修复

- 隐私脱敏对密钥新格式覆盖不全：补充 GitHub 细粒度 `github_pat_`、OpenAI 项目 `sk-proj-`、Slack app 级 `xapp-` 规则（均带长度门槛防误伤）；JWT 放宽为仅头段要求 `eyJ` 前缀，载荷/签名允许任意 base64url，避免真实载荷起始非 `eyJ` 时漏掩。

## 1.4.1

> 2026-09-03 发布

### 📝 文档更新

- README 补齐任务导出结构（终端 / CSV / XLSX / JSON 列定义与字段全集、排序与日期口径）、任务导入列别名内置表与 `.toolkitrc.json` 自定义示例、库 API 增补，供用户与 AI 查阅。

## 1.4.0

> 2026-09-03 发布

### ✨ 新增功能

- tasks 多视图查询与导入导出：`--view active/archived/all` 查看待完成/已归档/合并（状态分组 + 汇总），支持 `--owner/--scope/--status/--date/--since/--until` 过滤；`--export` 导出 CSV / XLSX（三 sheet）/ JSON，`--import` 从 CSV / XLSX / JSON 回读生成任务（内置列别名 + `.toolkitrc.json` 的 `tasks.importColumns` 自定义，目标 active/archive、可 dry-run、冲突自动加序号）。默认 `toolkit tasks` 行为不变。

## 1.3.3

> 2026-09-03 发布

### 🐛 问题修复

- `tasks` 归档块解析缺陷：`normalize` 将归档正文 `## ` 小节误判为任务块（`--fix` 会打散正文）、`archive` 合并时块体在正文 `---` 处被截断丢正文。统一为共享解析（标题后紧跟含「完成时间」元数据行才算任务块），并保留原文件行尾。

## 1.3.2

> 2026-09-03 发布

### 🐛 问题修复

- `changelog format`（及 `version` 自带格式化）未去掉 changesets changelog-git 写入的 commit hash 前缀，导致中文 CHANGELOG 条目带 `800a1cf: ` 这类前缀。

## 1.3.1

> 2026-09-03 发布

### 🐛 问题修复

- `tasks normalize --fix` 缺少排他锁，与归档并发时可能互相覆盖归档文件；收敛 README/SPEC/package.json 定位文案，融入「多人 + AI + 跨项目」。

## 1.3.0

> 2026-09-03 发布

### ✨ 新增功能

- changelog 全语言化：.toolkitrc.json 的 changelog.languages 支持自定义语言与覆盖内置 zh/en

### 📝 文档更新

- SPEC/README 语言描述改为「全语言支持」

### 🔗 依赖变更

- commander 14 → 15，changelog 自有选项改为置于子命令之前

## 1.2.0

> 2026-09-03 发布

### ✨ 新增功能

- 任务校验与归档归一化能力：

  - 新增 `tasks check` 校验 active（frontmatter 合法性、跨文件重名、depends_on 依赖闭环、未闭合待办）
  - 新增 `tasks normalize --check/--fix` 检查与修复归档块（元数据四字段、日期漂移、降序）
  - `tasks archive` 新增 `--dry-run` 预演与排他锁防并发覆盖
  - 软告警双向三档开关（`--warn/--no-warn`、`FX_CHECK_WARN`、`.toolkitrc.json`），默认开启
  - 隐私脱敏开关升级为双向（`--redact/--no-redact`、`FX_REDACT=0/1`）
  - changelog 协同软告警：归档时无变更集提示、发版时未归档提示
  - 统一配置读取（.toolkitrc.json）与开关解析，供各能力域复用

## 1.1.3

> 2026-09-03 发布

### 🐛 问题修复

- README 与 .tasks/SPEC 文档补充「归档与提交约束」：任务完成后先归档再提交，保证任务记录与代码变更同批入库。

## 1.1.2

> 2026-09-03 发布

### 🐛 问题修复

- package.json 补充 repository 字段，npm 包详情页展示 GitHub 仓库地址。

## 1.1.1

> 2026-09-03 发布

### 🐛 问题修复

- CLI 改用 Commander 实现，新增 --help/--version 与 tasks/changelog 子命令帮助，changelog 透传子命令支持未知选项；commander@^14 作为运行时依赖。

## 1.1.0

> 2026-09-03 发布

### ✨ 新增功能

- 隐私脱敏能力：落盘记录自由文本时默认对邮箱、手机号、身份证、IPv4、密钥、JWT、内网 URL 做掩码，支持 --no-redact / FX_REDACT / .toolkitrc.json 三档开关与自定义规则；归档任务改为按完成时间降序并规范化 completed；修复 CHANGELOG 日期补全重复插入。

## 1.0.2

> 2026-09-03 发布

### 🐛 问题修复

- README 新增「方案落盘（任务区）」章节，明确 npx→ 全局 → 兜底输出的调用优先级，以及 toolkit tasks 校验/归档与 changelog 变更集/发版的使用流程。

## 1.0.1

> 2026-09-02 发布

### ✨ 新增功能

- exports 条件导出，CJS 消费方可正常 require

### 🐛 问题修复

- CHANGELOG 格式化在 CRLF 文件下失效及正文中段重复条目无法合并的问题
- 发布日期后缀文案随语言切换，英文 CHANGELOG 不再混入中文「发布」
- changesets 调用改走进程内 node 与数组参数，规避跨平台 shell 差异
- changelog 域不带 --lang 时首命令被误删的问题
- 移除公开包元数据中的私有仓库地址

## 1.0.0

> 2026-09-02 发布

### ✨ 新增功能

- 任务管理域（tasks）：扫描、总览、归档 Markdown 任务文件
- 多语言 CHANGELOG 域（changelog）：封装 changesets，支持中英文标题格式化

### 🐛 问题修复

- 完善 npm 发布配置并为英文变更日志补充分类图标
