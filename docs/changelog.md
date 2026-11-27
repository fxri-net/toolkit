---
outline: [2, 2]
---

# 更新日志

> 完整变更历史以根 `CHANGELOG.md` 为准，本页由 `toolkit release mirror` 自动同步，请勿手改。

历史版本：[1.x](./changelog/1.x)

## 2.0.12

> 2026-11-27 发布

### ✨ 新增功能

- `pnpm verify` 增加 CLI 文案检查，中文提示里的裸枚举原值会直接失败
- README 能力矩阵覆盖全部命令域的机检，防止能力清单再次漂移

### 🔧 功能调整

- CLI 中文提示统一改用中文显示名——层名（全局层 / 项目层 / 本地层）、安装面与档位不再裸用英文取值，报错按「中文（原值）」列出可选值
- 「家目录」统一改为「用户主目录」，术语表补「用户主目录」与「档位」两行
- `fxri-base-safety`、`fxri-test-tty` 同步术语
- 概念目录只保留可迁移的工程概念，本仓命令 / 技能 / 模板迁入 `concepts/reference.json`，`toolkit concept show` 末尾单列「本仓参考实现（可选）」
- `toolkit concept list` 的 `--maturity` 改为 `--adoption`（`generic` / `tooling`），JSON 的 `data.maturity` 改为 `data.adoption`
- `fxri-base-adoption` 按「概念本体 + 可选参考实现」两层取用，不再写死概念条数
- 概念目录与参考实现契约升到 1.1
- 30 秒上手的完整步骤统一到「快速开始」，README 保留两行可复制安装块，首页保留各包管理器命令分组
- 首次使用路径统一为「装 CLI → `toolkit setup` → 进项目说需求」，操作手册由四步改为三步
- 任务区初始化统一为「技能自动初始化，手工兜底 `toolkit task init`」，修正相反表述
- 使用统计写清「配置缺省 hook / 向导默认 rule」两类默认；移除 1.x 版次门槛与过时提示
- 文档站「一图看懂」页路由由 `/concepts` 改为 `/overview`，与概念目录（`/cli/concept`）的标识区分开；站内导航与索引已全部指向新地址，旧地址不再提供内容
- README 能力矩阵补齐到全部 15 个命令域，并注明「人机协作是主线卖点，其余能力可单独使用」
- 文档站首页补 4 张能力卡（一眼自查、概念目录、升级迁移、配置体检）；一图看懂的五件套表补「所属层」列
- Agent 接入页路由由 `/usage/agents` 改为 `/usage/agent-integration`，避免与 `AGENTS.md` 同名被 AI 当作目录规则加载
- 顶栏「参考」补使用统计与升级两个入口，与侧栏可见范围对齐
- 操作手册保留授权判据、触发示例与反问确认，完整细节链回完整攻略
- `fxri-plan-task` 补口语化反例——夸方案「挺好 / 不错」后说「先落档 / 记一下 / 登记」仍只做任务档维护，不构成开工授权
- `toolkit upgrade` 的通用提示由「v1 资产 / v1 残留」改为「旧资产 / 旧形态」，与「旧工程 + 本机契约数据」的实际范围一致
- 快速开始、30 秒上手、常见问题、操作手册、完整攻略、适用场景与能力矩阵补上裸 `toolkit upgrade` 升级入口，首次接触面不再附 `--dry-run` / `--check`

## 2.0.11

> 2026-11-27 发布

### 🚨 重大变更

- 对外 JSON 与数据文件的 `schemaVersion` / `formatVersion` 由整数改为 `MAJOR.MINOR` 两位字符串（如 `1.0`）；读取端兼容历史整数，写出端统一两位
- 非交互执行 `toolkit upgrade` 现须 `--all --yes`，只给 `--yes` 会报错；原 `upgrade --yes` 脚本需补 `--all`
- `toolkit status` 的区块机器 id 由 `migrate` 改为 `upgrade`，按 id 过滤 JSON 的脚本需同步
- `toolkit usage data purge` 在非交互环境执行任意实际清理（`--all` / `--older-than` / 默认保留期）须加 `--yes`，否则报错退出 2

### ✨ 新增功能

- `toolkit upgrade` 检测并重写本机契约数据的 `schemaVersion`（技能状态、使用事件与索引、上报队列、上传账本、回收站清单），写前进入备份会话，可 `--restore` 回滚
- `toolkit upgrade --skip-events` 跳过事件文件重写；`--all` 显式全选
- 概念 `minimal-entry`（极简入口），规范索引新增 C-62 指针
- `fxri-plan-task` 与 `fxri-plan-recap` 接入任务告警的轻量处置：`task check` / `status` 报 Tier 1 告警时，按修复命令逐条征得用户确认后执行
- `fxri-plan-task/references/warning-actions.md` 作为 Tier 1 / Tier 2 / 只报告的统一映射

### 🔧 功能调整

- 概念目录的入口相关措辞改为相对表述，并在概念命令页说明「概念是可选采纳、不是硬性规则；安全 / 合规 / 授权硬约束仍按护栏执行」
- `toolkit upgrade` 裸命令在 TTY 下改为交互多选且默认不全选；非 TTY 全量执行须 `--all --yes`；`--all` 与 `--only/--skip` 互斥
- `toolkit status` 的迁移区块改名为「升级」，分布统计纳入本机数据
- `toolkit upgrade --prune-backups` 清理含数据迁移的备份时额外提示，数据回滚点随之消失
- 本机数据迁移遇到无法解析或版本缺失的文件时整项判人工，不部分重写

### ⚡ 优化改进

- 各契约独立声明版本常量、独立递增，不再共享同一个版本号
- `pnpm verify` 的单测步骤前后按前缀与年龄门槛清扫过期临时目录，并检查本次新增残留
- 运行时临时目录统一为 `fxts-tk-` 前缀，便于统一识别与回收

### 🐛 问题修复

- 测试临时目录增加清理兜底，漏删或进程中断不再在系统临时目录累积残留

### 📝 文档更新

- 事件 schema 更名为 `skill-usage-event.schema.json`（版本只写在文件内），相关 JSON 示例与状态文件说明同步两位口径
- 概念目录改为「多方一致」口径，最少两方即成立，并把 support 引用纳入测试校验
- 补充临时目录的清理要求（C-57 由前缀统一扩为前缀 + 清理兜底）
- 补充大量事件数据下 `upgrade` 检测与备份成本提示
- `toolkit upgrade` 相关文档的「一键」改为「统一入口」，避免与批量全做混淆

## 2.0.10

> 2026-11-27 发布

### 🚨 重大变更

- 技能族由 code 收敛为 base，fxri-code-encoding 改名为 fxri-base-encoding（旧名可迁移）
- fxri-code-safety 改名为 fxri-base-safety（旧名可迁移）

### ✨ 新增功能

- `toolkit task check --staged` 校验暂存区，`<任务区>/active/` 任务档默认不入库，命中即失败（`pnpm verify` 已接入），可用 `FX_TOOLKIT_ALLOW_ACTIVE_TASKS=1` 放行；流水线环境跳过，不启动 git
- `toolkit upgrade --prune-backups [--keep <n>]` 清理迁移备份目录与本包已知 `.bak`，支持 `--dry-run` 预览与 `--layers` 限定范围；缺省只清当前项目（`~` 下只清全局面）
- `fxri-base-safety` core 技能（破坏性操作的方案阶段披露、执行前检查与误删恢复），随默认安装
- 门禁对照 `docs/cli.md` 命令总览与命令注册表，已移除命令的残留引用会被拦截
- 新增概念目录与 `toolkit concept` 查询命令
- 新增 `fxri-base-adoption` 技能，提供概念目录与能力采纳引导
- `convention status` 校验索引「单一事实源」相对链接的目标是否存在，断链按 warn 提示
- `docs titles check` 校验页面 title/H1 与目录表链接文案，并纳入 `toolkit docs` 全量校验
- `toolkit convention status` 与 `toolkit task check` 增加「标记一致但正文与模板不一致」软告警，与版本不一致告警分开报告
- `pnpm bump:entry-version` 脚本——壳模板变更时自动抬次版本并刷新模板快照，避免版本与正文脱节
- `skill bump --sync-tables` 在递增后同步技能表版本列，缺省同步 `skills/README.md` 与 `docs/guide.md`
- `toolkit trash list|restore|prune|stats`，支持来源命令 / 时间过滤、恢复到指定目录、按 `--keep` / `--older-than` / `--all` 清理与占用统计
- `toolkit upgrade --prune-legacy` 删除已被新段覆盖或写错层的旧段，支持 `--dry-run` / `--diff` 预览

### 🔧 功能调整

- 任务收尾提交只带归档与代码，`.tasks/active/` 默认不入库（不写 `.gitignore`，用户明确要求才例外）
- `toolkit setup` 的技能安装说明改为按所处目录自动判定全局或项目面
- `--help` 与 `toolkit help` 不再加载配置，避免帮助输出前的旧段告警与无谓写盘
- `fxri-plan-task` / `fxri-plan-review` 的方案与复核清单加入不可逆影响披露要求
- 全局规则「工作流」「可裁剪偏好」补破坏性操作的披露、预览与可恢复优先纪律
- 方案态不确定项统一以「项 | 推荐 | 理由」的决策点表呈现，推荐不构成执行授权
- 命令总览补齐 `rule sync` 与 `skill reconcile` / `list`
- `fxri-writing-docs` 的标题与索引一致性校验改由该命令守护
- `toolkit task init` 的技能入口壳改为「标记版本 + 正文比对」双判据，标记一致但正文与模板不同同样就地重写，修复壳文案已漂移却因版本未变而静默跳过的问题
- 入口壳标记改为两段式 `v2.1`（正文变更抬次版本、结构或协议变更抬主版本），旧 `v2` 标记按 `v2.0` 解析
- `fxri-plan-task` 开工判定由「必须命中开工词闭集」改为授权判据（执行指向明确 + 范围唯一 + 方案已定稿），处理 / 搞定 / 修掉 / 直接改 / 授权 等表述同样可开工，不再连续拒绝
- 补「三类不构成授权」硬阻断（同句只读诉求、方案未定稿、范围不唯一）与「反问只问一次、重复同一短语视为确认」，并支持「列计划表并开工」这类双段表达
- 补「陈述必要性不是开工」（得修 / 需要改 / 主要是要 只转定稿）与「实施范围不超上一轮说明」（扩面先回方案态列增量范围）
- 补「只读诉求优先」——同句只读与执行并存时先交付只读产物；纯展示型计划表输出即本轮终点，不视为开工
- `fxri-plan-task` 补「词表是示例」，暂停 / 取消 / 撤销 / 委托等族的同义说法按语义归族、判不准时一句话确认，不再静默按默认继续
- 只读与执行混合的指令（检查并修掉、列清单并开工）明确为先交付只读产物、再执行执行段；修正上一版指向已改名条目的断链引用
- `fxri-plan-task` / `fxri-plan-review` 收紧微操作边界，需同步生成物、测试或文档的改动不再视为对象级微操作
- 全局规则「工作流」与仓库协作规则同步该边界，多文件同步先回方案态
- `task init` 遇到用户以 `!` 显式取消忽略的目标时不再补写该行，片段内残留的对应行也会在重跑时移除，避免留下无效规则
- `task init` 判忽略项是否已覆盖改按 gitignore 语义（通配 / 目录规则 / 否定 / `**`），非 git 目录不再只认全名，已有 `*.lock`、`*.local.json`、`.toolkitrc.*.bak` 时不再追加冗余行
- 两份配置备份合并写入为一条 `.toolkitrc.*.bak`，命中集合仅限配置备份，不含 `.toolkitrc.json` 等团队配置本体
- 存量项目重跑 `task init` 时，片段里分开的两行 `.bak` 会收敛为一条 `.toolkitrc.*.bak`，覆盖范围不变
- 极简预设（`minimal`）纳入「可裁剪偏好」（`preferences`），与工作流一起下发
- 输出要求新增播报口径——每个任务开头一句目标与范围、结尾一句结论，长任务中间只报关键节点
- 项目根判定改为 git 根 / 项目配置 / 项目产物，`.tasks` 与 `package.json` 不再参与；任务区外置不再影响项目根
- `skill mount` 扫描不再把 `.tasks`-only 目录当作项目；非 git Node 项目仍按 `package.json + lock` 发现
- 项目层更新提示写入不再要求 git 根，按项目配置定位
- `--clean-backups` / `--drop-legacy` 改名为 `--prune-backups` / `--prune-legacy`，与既有 `--prune` 动词族一致
- 版本口径默认 patch，minor / major 须举证既有用法失效，并补功能补全与设计缺陷修补的反例
- 技能内容版本同步改为默认 patch，仅既有用法失效才升 minor
- 提交标题措辞合并为「以中文为主，专有名词可保留英文」，删除重复的专有名词例外条目
- 全局规则明确微操作不受方案先行与开工词约束，消除与授权判据的字面矛盾
- 输出要求按任务类型分层——执行类任务开头目标与结尾结论、只读请求只给结论、长任务中间只报关键节点
- 可裁剪偏好只声明「提交自动执行」为对授权默认的覆写，其余条目定位为额外收紧，不再整体优先
- 全局规则模块 `practices` 更名为 `preferences`（显示名「可裁剪偏好」），正文标题同步统一，旧缓存与 `--module practices` 自动迁移
- 只读请求含执行段时，执行段仍需按授权判据处理，不再暗示同句即可直接执行
- 全局规则补齐会话级授权、跨会话「继续」与破坏性操作四项披露，与技能口径对齐
- 技能使用上报明确当轮合并、漏报收尾补一次的兜底口径，与会话收尾技能对齐
- 技能作用域判定改为「CLI 包根是否位于 cwd 的祖先目录」，不再依赖 `package.json`，非 Node 项目同样适用
- 无 `node_modules`（如 Yarn PnP）时作用域改按 CLI 包根是否位于项目根内判定，全局缓存型安装仍需显式 `--scope project`
- `fxri-writing-docs` 的落地步骤恢复「按仓库发版链路发布」，执行方式以仓库约定为准，变更集写法与 bump 判定仍指向 `fxri-release-changelog`
- `fxri-release-changelog` 的归档检查改为「发版前须已归档」，归档方式按仓库既有约定，`toolkit task archive` 降为无专用流程时的默认手段
- `fxri-plan-review` 恢复用户明确接受后可直接落档（实施方案、拆分、验收与计划表均可修正），边界为不改用户已确认的目标与范围，写入方式按仓库既有流程
- `fxri-plan-review` 的 references 同步落档口径，去掉「不写任务文件 / 交给落档流程」的绝对禁令
- 明确任务档提交边界，未开工任务档不随交付任务混批
- 恢复逐项继续，单项失败记入 `failed` 并保留条目（`status` 标记 `partial`），`trash list` 同步展示状态
- `skill uninstall`、`skill install` 替换 / 改名清理的旧产物与 `--prune` 清理项、`upgrade --prune-backups`、`upgrade --restore` 的用户可见删除默认进入项目内回收站，`--no-trash` 才永久删除
- 全局层旧段告警与技能配置误放告警给出可执行的 upgrade 命令
- 补全 `fxri-writing-skill` 的触发口径，明确修改技能正文（含单条规则）同样适用

### ⚡ 优化改进

- `docs theme write` 覆盖自定义 `index.ts` 前先备份为 `index.ts.toolkit-backup-<时间戳>`，避免静默丢失改动
- 抬高 `tmp` / `brace-expansion` / `uuid` 传递依赖版本，生产依赖无已知漏洞
- `fxri-plan-task` 入口的工具加速清单下沉到 references，并补足决策表等细节，入口回到告警线以内
- 全局面 `skill status` 对自定义技能目标附回收风险提示，仅提示、不改变卸载与回收行为
- 任务扫描跳过 symlink / junction 月份目录并软告警，避免归档与归一化读写任务区外文件
- docs nav / dist / titles 告警补齐修复动作（site-nav 字段与 import 片段、404 排除方式、目录表目标行）
- 配置回落类告警统一给出 `toolkit config set` / `unset` 命令、键名与应改的配置文件
- 技能与状态类告警补齐可执行消除命令（旧名 uninstall、版本 bump、activation 最短删除）
- 任务校验与规范载体告警补齐消除动作（owner / 改名目标 / 搁置与阻塞节模板 / 依赖删除项 / 索引列改法）
- `task normalize` 逐条标注 `--fix` 可修或需手改，月份错位与完成时间漂移改记为可修复

### 🐛 问题修复

- 文档删除已移除的 scope 子命令残留，并修正 docs 域 `--format` 的调用写法
- 项目态技能目标位于软链路径（如 macOS `/tmp` → `/private/tmp`）下被误判越界而整条丢弃，版本检测与状态读取不再漏计
- 开工判定补「未反问时重复不算确认」——没有反问为前提时，同一规划指令（落档 / 定稿 / 列计划表 / 复核任务）重复几轮都停在定稿态，须等开工词或显式授权语，避免把重复指令或自述「可以开工」当成授权
- `task init` 补写缺失忽略行时把片段内旧行留在片段外，改为整段随片段重建，片段保持单块且二次重跑字节不变
- `task init` 重建忽略片段时把片段移到文件末尾，导致片段之后的 `!` 否定规则被翻到前面而失效；改为按原位置重建
- 全局 `.bak` 单独收编到全局备份根，不再进入当前项目备份目录
- 技能状态账里越界的目标目录或含路径分隔符的条目名会被忽略并告警，不再参与删除，避免被篡改的状态把删除带到仓库或家目录之外
- `upgrade --restore` 只恢复 / 删除项目根或家目录内的清单路径，越界路径跳过并告警
- 批量挂载「未发现仓库」提示不再列出已不参与判定的 `.tasks`
- 配置改写后作用域判定可能复用旧快照（缓存指纹改用配置内容，不再依赖文件时间戳）
- 任务检查的已归档去向提示在归档文件改写后可能沿用旧标题
- 家目录不再被判定为项目根，`~` 下项目面安装、项目面卸载与项目层 / 本地层配置写入会报错并提示改用全局面
- `toolkit upgrade` 在 `~` 下只迁移全局层，版本门禁仅在本计划含项目层项时生效
- `skill status` / `skill reconcile` 在 `~` 下不再读取或收敛 home 下的项目产物，`--scope all` 降级为全局面并告警
- 任务导入限制文件 20 MB 与数据 2 万行，超限直接拒绝不进解析
- 拒绝含路径分隔符的技能名，避免外部来源把产物装到目标目录之外
- 校验远程来源的 git ref，拒绝以 `-` 开头或含 `..` 的取值并加 `--` 分隔，避免选项注入
- 任务负责人名必须是单段名字，`task add --owner` 与导入不再能写出任务目录
- 升级检查的 registry 凭据只发给可信名单（默认仅官方 npm 源，可在全局层追加内网 / 本地地址）
- 升级查询不跟随重定向，避免带凭据的请求被引到其他主机
- 会话收尾技能不再无条件要求提交前确认，改为按用户规则判断，支持自动提交约定
- 修复技能改名后重新安装残留旧名产物
- `fxri-release-changelog` 只列三种类型前缀，改为指向 `references/changelog-format.md` 的完整前缀表，并在 `AGENTS.md` 同步前缀表真源位置
- `fxri-plan-recap` 引用兄弟技能 `task-spec.md` 缺 `../` 前缀，与同文件其它引用口径不一致
- `fxri-plan-task` 读取地图漏 `conflict-check.md`、可跳过列计数失真；补「四级时间源取证」的口径指针
- 任务校验跳过模板注释里的「## 搁置」占位，新建任务档不再误报残留
- `toolkit trash restore` 遇到悬空链接按跳过回报，不再重建悬空链接
- 新旧段内容不同与误放层段在检测阶段判人工项，`--check` 不再永远返回残留；提示包含文件路径、两段内容与可执行命令
- 升级无实际改动时不再产生空备份目录；`backup:legacy` 的层归属按文件实际所在层标注
- 从项目子目录执行 `upgrade` 后，`--restore` 与 `.bak` 收编的允许根补入项目根，祖先目录的配置仍可恢复

### 📝 文档更新

- 技能命名规则补充 base 族准入与新族最少技能数
- 修正变更集版本口径，明确 patch 可挂重大
- 规范载体索引 C-2 / C-6 改为路由写法，修正单一事实源断链
- 明确高层文档索引只收无标识入口页，并补索引层级机检
- 统一能力矩阵与站内引用的页面显示名，CLI 分页链接改为直达对应页面
- 规划与复核技能补充规范对照前置与留痕要求
- 校准仓库扫描口径，单层扫描按 `.git` / 项目标志 / `package.json` 识别，递归深扫才要求同目录锁文件
- 补充 `upgrade` 缺省迁移三层（含全局面）与只迁当前项目的用法，并说明 `--prune-backups` 缺省范围相反
- 补充第三方署名声明与来源注释

## 2.0.9

> 2026-11-25 发布

### ✨ 新增功能

- `toolkit setup` 记住上次确认的勾选，再次执行时作为初始勾选；`--dry-run`、ESC 取消与 `--yes` 既不写入也不读取

### 🔧 功能调整

- `rule compose` 带 `--out` / `--copy` 时也记住本次组合（产物成功后写入），需要一次性不记忆时加 `--no-cache`
- `toolkit setup` 的规则步骤与 `rule compose` 共用组合记忆，确认的组合成为下次默认；`--yes` 仍不读写
- `toolkit setup` 默认勾选「安装 AI 技能」，不再默认勾选「设置生效范围」

### ⚡ 优化改进

- `rule compose` 交互记住上次选中的预设，下次默认高亮该预设
- `rule list` 的「当前缓存」标注上次预设 / 自定义，JSON 新增 `selectionPreset` 字段

### 🐛 问题修复

- `task add` 交互的影响范围默认值改为项目内最近任务（含归档），读不到时回落 `cli`，不再固定 `cli`

### 📝 文档更新

- 一次性取规则片段的示例与文档站生成的命令统一补 `--no-cache`，避免顺带改写默认组合
- 升级页的规则快照命令补 `--no-cache`，避免一次性生成快照改写默认组合

## 2.0.8

> 2026-11-25 发布

### 🔧 功能调整

- `fxri-release-changelog` 版本口径补显式例子——给既有技能新增规则 / 章节（只增不改）记 patch，改动既有判定口径或用法才评估 minor

## 2.0.7

> 2026-11-25 发布

### 🔧 功能调整

- `release bump` 在同步镜像前自动归一历史块——changesets 写入会重排多行条目，原先会把中间态写进归档页、下次归一又整体回退；`--history` 保留为兼容参数
- `fxri-release-changelog` 技能修正空行成因说明，并注明 bump 已默认归一、手工 `changeset version` 后需自行补跑
- 全局规则的「不自行安装」拆为「不自行安装」与「安装需求进方案」两条——验证所需的安装与临时环境须在方案里一次列清并确认，不留到交付后再补申请
- 全局规则把授权主体写实为「用户」——安装授权与提交确认不再使用指代含混的「你」

### ⚡ 优化改进

- `rule compose` 自定义模块、`scope` 扫描结果、`usage setup init` 的 Agent 多选统一走同一提示口径，ESC 均按正常导航以 `0` 结束

### 🐛 问题修复

- 多选列表不再把「退出 / ← 返回」放进选项，改由提示文案标注「ESC 取消」或「ESC 返回上一步」，避免按 `a` 全选时把出口一并勾上

## 2.0.6

> 2026-11-24 发布

### 🔧 功能调整

- `toolkit setup` 勾选「安装 AI 技能」「配置全局规则」后进入各自的交互选择，上次结果只作默认勾选、须确认才执行；`--yes` 仍按默认值直接执行

### ⚡ 优化改进

- 交互基座统一多选操作提示与取消文案，确认问句按动作区分（卸载 / 移除不再问「继续写入」）
- 子流程菜单项统一「…」后缀，子流程结束行为写进交互约定（菜单驱动回主菜单、单用途命令直接结束）

### 🐛 问题修复

- `toolkit scope` 首步选配置层补「退出」项，不再只能靠 Ctrl+C 退出
- `toolkit rule compose` / `rule sync`、`toolkit upgrade`、`toolkit usage setup init`、`toolkit task add` 的首步与原生提示补齐「退出」与 ESC 取消；ESC 一律按 `0` 结束，`130` 只保留给 Ctrl+C
- `skill install` 目标选择改为末位「← 返回」，安装 / 卸载 / 批量递增的取消一律按 `0` 结束，不再混用 `130`
- `usage setup init` 的选择步骤补「← 返回」，`usage setup uninstall` 两问可退回上一问，`usage config upload setup` 三步可退回上一步
- `scope` 管理条目 / 技能矩阵与 `usage` Hook 多选补「← 返回」，批量挂载补「退出」；输入与确认步骤统一标注「ESC 返回上一步」或「ESC 取消」

## 2.0.5

> 2026-11-24 发布

### 🚨 重大变更

- 移除 `scope wizard` / `usage setup wizard` / `skill plan` 三个入口，不保留别名；替代写法分别为裸 `toolkit scope`、裸 `toolkit usage setup`、`toolkit skill install --dry-run`
- v1 顶层 `init` 只保留任务区初始化并迁为 `toolkit task init`，`--dir` / `--no-hooks` 随能力迁入 task 域；本机接入向导另用 `toolkit setup`
- `toolkit setup` 为本机接入向导（安装 AI 技能、配置全局规则、设置生效范围）；任务区初始化由 `toolkit task init` 负责
- `rule list --format json` 的 `presets` 由模块 id 数组改为含 `label` / `summary` / `modules` 的对象
- 全局规则模块由 7 个合并为 6 个，`personal` 与 `env` 合并为「推荐做法」（`practices`）
- 预设重排为极简（仅工作流）/ 推荐 / 全量，删除 `complete`（自用全篇）
- 移除 `scope policy` / `scope skills` / `scope list` 三组子命令；名单与策略统一由 `scope allow` / `deny` 写入，覆盖由 `scope remove` / `default` / `reset` 承担，档案由 `scope profile` 管理

### ✨ 新增功能

- 发版技能补「重大」判定条件——须同时满足「对象上一版已存在」与「按原用法继续会失败或结果不同」，并明确只增不改不构成重大
- `toolkit task init`、`toolkit privacy scan --fix`、`toolkit usage setup init` 补齐 `--dry-run`，输出与真实执行同构的动作清单且不写盘
- 补「内部推广」页，提供一句话介绍、讲稿、试点方案与决策者问答
- 补「一图看懂」页，用可点击的结构图与能力全景说明组成与关系
- 补「适用场景」页，按个人 / 团队 / 组织 / 沉淀者 / 维护者 / 存量迁移给出起步路径
- 接入向导四项勾选，已就绪项默认不勾、可手动重跑，有交互的步骤勾选后必进交互并可「退出」返回
- `toolkit rule sync` 把提交信息规则同步到项目内 `.trae/rules/git-commit-message.md`，支持 `--dry-run` 看差异、`--yes` 直接写入
- 同步文件首部记录生成版本与正文摘要，无差异零改动；被手改或无生成标记时默认停在「查看」，不默认覆盖

### 🔧 功能调整

- `commit` 规则模块补一行边界说明——「重大」只用于变更集条目，提交标题仍按七类
- 明确该前缀只标注破坏性、不决定 bump；提交信息类型字典不含「重大」
- `skill install`、`task init` 报告统一为三段式——动作前标明作用层（全局层 / 项目层 / 本机层 / 只读），逐项动作行，动作后汇总完成 / 跳过 / 失败并给出重试命令
- `skill install --dry-run` 的分发计划标明全局层 / 项目层；`usage setup init --dry-run` 复用 Hook 安装预演
- 裸 `toolkit scope` / `toolkit usage setup` 直接进交互；非 TTY 需要强制交互时统一用 `--interactive`（无终端按无交互退出码结束）
- `command-registry` 同步入口登记与 v1 `usage wizard` 的迁移目标；`src/exit-codes.ts` 场景口径改指 `--interactive`
- init 实现迁入 `src/tasks/init.ts`，文档站链接常量上移到 `src/links.ts`，不留转发壳
- 源码内提示文案、文档与技能引用统一为 `toolkit task init`，技能 `fxri-plan-task` 升版
- `--yes` 与「设置生效范围」「开启使用统计」互斥，零交互模式不写任何范围决定
- 规则预设的显示名、模块清单与适用面统一由 `templates/rules/ruleset.json` 派生，`rule compose` 交互选项与文档站组合器各附一行说明
- `toolkit setup` 四项勾选补「做什么 + 写到哪里」说明；`usage setup` 的预设、通道、技能范围与轮转选项，以及 `upgrade` 的迁移项补影响面说明
- `toolkit status` 对项目内提交规则漂移只提示「跑 toolkit rule sync 更新」，不改文件
- `workflow` 的提交纪律改为「提交是否执行由规则约定，未约定时需你确认」，与推荐做法不再冲突
- `scope allow` / `deny` 按条件选项自动分流——无条件选项写目录名单，出现 `--skill` / `--profile` / `--paths` 等任一条件时写策略
- `scope status` 新增 `--lists` 与 `--policies` 视图；`scope reset` 默认清名单、策略与档案并一次预览确认
- v1 顶层 `scope add` / `exclude` 的迁移目标改为 `allow` / `deny`；消息、帮助与文档中的旧命令口径同步

### ⚡ 优化改进

- 历史更新日志页不进站内搜索索引，避免索引分块超限
- 首页删除与卡片重复的痛点表，改为按场景进入并增加「一张图看懂」入口
- 首页特性卡片图标与标题同行，说明文字跨满两列（主题模板同步升 2.2）
- 按实用性重排文档站导航与索引顺序，修正参考组、CLI 参考与四处索引的错位
- 统一页尾体例，补齐缺失的相关页面并合并技能分发的碎节
- 三张图示改为序号徽标 + 等宽卡片网格，层说明与序号左缘对齐，窄屏两列铺满、五件套固定四列不再折行
- 快速开始按「最短路径优先」重排并压缩导语
- 文档站写作规范补页面标题边界——无命令名 / 配置键的页面只写显示名，索引与 H1 保持一致
- 补显示名取词判据——导读型用行动词、检索型用名词，同一对象在 H1 / 顶栏 / 侧栏同名
- 全局规则模块改为语义自述，消除跨模块悬空指代
- `workflow` 模块把「个人偏好可覆写」改为「除非规则另有约定」，按 `recommended` 预设复制时不再指向未包含的 `personal` 模块
- `usage` 与 `personal` 模块去掉对其它模块条目的具名引用，单独复制即可读通

### 📝 文档更新

- `docs/rules/commit.md` 与 `.trae/rules/git-commit-message.md` 同步投影
- 「一图看懂」页的层级说明改为顺读「接入 → 能力 → 产出」，与图中流向一致
- `docs/cli/skill.md`、`task.md`、`privacy.md`、`init.md`、`usage.md` 同步输出节奏与 `--dry-run` 说明
- 入口矩阵、作用域 / 使用情况 / 技能分发 / 初始化页与退出码场景同步
- 接入向导页落点为 `docs/cli/setup.md`，项目初始化说明并入 `docs/cli/task.md`
- 快速开始、30 秒上手、README 与首页统一以 `toolkit setup` 为官方接入入口
- `docs/cli/rule.md`、`docs/cli/setup.md`、`docs/rules/index.md` 同步预设适用面与四项说明
- `rule compose` 组合结果与文档站规则页同步更新锚点
- `docs/cli/rule.md`、`docs/cli/status.md`、`docs/cli/setup.md`、`docs/rules/commit.md` 同步显式同步口径
- 规则页、导航、规则组合器与上手文档同步

### 🧹 清理移除

- `workflow` 模块移除「技能上报」转发条，上报要求由 `usage` 模块独立承载

## 2.0.4

> 2026-11-23 发布

### ✨ 新增功能

- `skill uninstall` 交互多选按面分组并展示技能简介（真源描述优先，缺省用状态登记摘要），答案行显示「面｜名称」

### 🔧 功能调整

- `upgrade` 迁移多选改走统一交互基座，答案行只显示迁移项 id，ESC 按取消退出码（130）结束
- `skill list` 文本行不再展示目标目录数，统一为「名称 · 简介 · 版本 · 形态」；目录数仍保留在 JSON 的 `targets` 字段

### ⚡ 优化改进

- 目标选择、作用域向导的技能 / 项目列表与 `upgrade` 迁移项统一单行展示，长路径按中段省略，辅助说明暗色；向导项目答案行只显示「项目名 · 相对路径」
- 交互列表的技能简介改为单行、暗色，按终端列数并扣除勾选符与禁用原因宽度截断；提交后的答案行只保留选项名
- 多选答案超过 6 项折叠为「前 5 个 等 N 项」，作为交互基座统一行为

### 📝 文档更新

- 目标选择交互口径校正为「禁用行整体置灰、路径类名称中段省略」
- 修正 `skill uninstall` 交互分组口径为「多组时插入分隔行」，与实际行为一致

## 2.0.3

> 2026-11-23 发布

### ✨ 新增功能

- 作用域策略支持 `delivery`（`full` / `gated` / `off`），同一条规则同时给出生效结论与内容形态，可表达「同一技能在 A 目录入口壳、在 B 目录全文」
- `scope policy add --delivery`；`scope policy list` 与 `scope status --skills` 显示形态；`deny` 与 `full` 互斥，加载告警并丢弃
- `privacy.localPaths`（`off` / `warn` / `error`，默认 `off`）与写盘归一：开启后 `task add` / `update` / `import` / `archive` 把本机绝对路径归一为 `<本机>/…/末段`、`~/…/末段`；业务仓库不配置即保持 `off`，归档可继续保留本地路径
- `toolkit privacy scan [--fix]` 按档位扫描本机绝对路径，任务归档 / 规范载体 / 变更集阻断，文档与技能只提示；`--fix` 只归一任务区与规范载体，`off` 档位整次跳过
- 作用域写命令（`scope list *` / `policy *` / `skills *` 与向导）写入后按矩阵自动收敛技能产物，写前预览形态变更、写后逐技能报告
- `toolkit skill reconcile`，手工改配置或队友 pull 后一键对齐已装产物形态（不改选择集、不新增技能）
- `toolkit skill list` 查看已装技能的名称、简介、版本、形态与目标数；`--all` 含未安装（形态位显示「未安装」）、`--format json` 机器可读
- 技能状态条目增加 `summary`，来源不可解析时列表用登记的简介与版本兜底，旧账缺字段照常读取
- `skill status --matrix [--at <目录>]` 逐技能列出产物形态、当前目录形态与命中规则依据，支持 `--format json`
- 技能选择列表与 `skill list` 在名称后展示简介（`description` 首句，按终端显示宽度截断，中文按 2 列），选择 / 卸载 / 列表共用同一行格式与截断口径；JSON 契约不变

### 🔧 功能调整

- 项目面薄壳术语与规则帮助文案统一
- 作用域薄纪律改为 status 按需、同会话复用
- 作用域文本输出改用中文术语，内部规则 id 不再出现在人读输出
- 向导添加目录时询问生效范围；白名单裸路径在 status / list 给出提示
- 技能统计的人读输出改用中文 + 原值括注，不再直接打印枚举

### ⚡ 优化改进

- 状态符号统一为 ✔ / ✖ / ⚠️ / ·，状态与任务校验改「错误 / 警告」
- 帮助长描述收敛为一句
- `--no-redact` 只关密钥脱敏，路径归一由档位独立控制
- `task check` 复用同一扫描，`pnpm verify` 新增隐私步骤（`off` 时零噪音）
- 分发形态按「任一目录入口壳或不安装 → 全局入口壳」汇总，全全文技能不产生 guard 调用
- 作用域扫描菜单文案改为「按当前范围继续 / 扫描隐藏目录 / 展开仓库内部」
- 作用域向导提示改为可判断的人话（层、来源、名单外处理、技能规则）
- `--no-link` 只写配置并在 stderr 提示；`--dry-run` 预演包含技能形态变更；收敛失败退出码非 0
- `toolkit status` 检测到旧 `activation` / `skillDelivery.rules` 时给一次迁移提示（只提示，不自动改写）

### 🐛 问题修复

- 帮助与文档残留的旧术语 / 符号不一致
- 作用域判定与分发形态改为同一套解析器，消除「策略允许、形态却是入口壳」的分歧
- 规则层缺少作用域查询纪律，补一行薄引用
- 策略声明该目录不安装（`delivery: off`）时 guard 仍输出正文，现按未激活结束（stdout 为空、退出码 3）
- `scope list` 把含通配符的名单条目误报为「路径不存在」
- 扫描范围菜单在只剪枝嵌套仓库时不出现，且无法同时开启隐藏目录与嵌套仓库
- 白名单条目默认不覆盖子目录，新增 `--tree` 显式覆盖
- 作用域向导头部提示改用当前命令写法 `toolkit skill install`
- 名单配置的兜底拒绝被误判为无条件不安装，改为按目录限制推导入口壳
- 多个技能来源共用同一目标目录时，`skill status` 按后登记来源覆盖记录，把内置源已装技能误报为「同名冲突」

### 📝 文档更新

- 补充 docs/cli.md 的术语表与文案约定
- 统一 error 级在文档中的解释

## 2.0.2

> 2026-11-23 发布

### ⚡ 优化改进

- 统一交互措辞——Hook 状态行的「本机未检测到安装」改为「本机未检测到该 agent」，卸载多选提示改用「空格切换」
- 作用域向导的层选择在项目层 / 本地层不可用时只显示层名，不再展示实际不会写入的配置路径
- 技能多选中 core 条目去掉「（core）」后缀，禁用提示统一为「必装，不可取消」，与分组标题口径一致
- 安装目标选择列表去掉与禁用原因重复的括号后缀（未检测到 / 不存在 / 一次性 `--dir` / 共读），仅展示变化
- 安装目标选择列表改用分组标题（主目标 / agent / 自定义（一次性））并去掉「类型｜」前缀，与技能列表同一套分组语法

## 2.0.1

> 2026-11-23 发布

### 🔧 功能调整

- `task update` 从「搁置」转出时自动删除 `## 搁置` 节（转「已放弃」保留作终结理由），`task archive` 对已完成任务残留该节输出软告警（受 `--no-warn` 控制，不阻断）

### ⚡ 优化改进

- npm 搜索关键词补充 AI 协作与工具链相关词（`ai-agents`、`agent-skills`、`prompt-engineering`、`workflow-automation` 等）
- `skill install` 技能多选按来源分组并插入分隔标题（`包内 · 必装` / `包内 · 可选` / 外部来源名），组内按技能名升序，选择语义不变

## 2.0.0

> 2026-11-23 发布
>
> 本次为 major：升级步骤与命令 / 配置段 / 技能旧名对照见 `docs/upgrade-v2.md`；旧命令与旧技能名在 2.1.0 前保留别名并提示弃用。

### 🚨 重大变更

- 顶层命令统一为单数：`tasks → task`、`skills → skill`、`rules → rule`、`conventions → convention`；旧名保留别名并提示弃用，旧命令不再注册独立命令
- 发版域 `changelog` 改名为 `release`，子命令为 `status` / `bump` / `changelog` / `mirror` / `publish` / `audit` / `changeset`
- 技能名收敛为 `fxri-<族>-<主题>`：`plan-to-task → plan-task`、`session-recap → plan-recap`、`skill-authoring → writing-skill`、`docs-writing → writing-docs`、`text-encoding → code-encoding`；旧名写入 `metadata.previousNames`，已保存选择集与安装迁移自动跟随
- `usage` 收为 `show` / `data` / `config` / `setup` 四组，`record` / `log` 等上报入口保留在顶层；移除 `usage rule`，改用 `rule compose --module usage`（输出逐字一致）
- `scope` 的目录名单增删改收进 `scope list` 组，`scope list` 裸命令仍为查看
- `skills sources` 更名为 `skill source`；`install --from` 收敛为 `install --source <name|path>`，可直接传已登记来源名
- 包根输出下沉为 `skill status --path`，内容闸门开关下沉为 `config get|set skillDelivery.default`（on → gated、off → full）
- 配置段名统一为单数（`skillsInstall → skillInstall`、`skillsDelivery → skillDelivery`、`projectSkills → projectSkill`、`tasks → task`），旧段名读时兼容并提示，`init` 就地重写项目层 / 本地层配置文件
- 报告类 `--format json` 统一为八键信封 `{ schemaVersion, command, code, message, data, extend, debug, issues }`：`command` 为命令路径，`code` 为整数业务结论（成功 `200` / 报告含 error `422`），退出码移入 `extend.exitCode`，check 问题同时映射到顶层 `issues`；`usage data export`、`task export <path>` 与 `release changeset` 透传保持原格式；`config` 的 JSON 一并接入

### ✨ 新增功能

- `skills/namespaces.json` 族表与命名门禁：`skill lint` 校验族归属、主题与 `metadata.type/scope/triggers`
- `task add` / `task update`：按模板建档与改字段，非交互写入须 `--yes`；TTY 下答完提示即执行
- `rule check` 校验规则模块与规则页的更新锚点是否同源
- 根级 `--cwd <path>`：所有命令共用同一工作目录入口，非法路径按 1 退出
- `toolkit upgrade` 一键迁移 v1 工程（三层配置段名与旧闸门键、`package.json` 旧钩子与旧命令名、技能旧名、规范载体与历史 `.bak`），支持 `--check` / `--dry-run` / `--diff`（行级差异，JSON 给 `data.diffs[]`）/ `--format json` / `--restore` 备份恢复
- `toolkit status` 只读聚合：一条命令汇总任务区 / 技能现场 / 配置层 / 文档站 / 版本与弃用项，支持 `--check`（error 级问题退出 1）与 `--format json`；检测到 v1 旧形态时追加「迁移」区块（只查项目层与本地层，不进 `issues`）
- `toolkit config list / get / set / unset` 作为配置唯一写入口：键清单（类型 / 默认层 / 可写层 / 敏感标记）由 `src/config-keys.ts` 单源维护，非法键给最接近的候选；支持 `--cwd` 与 `list --layer`，未写键显示默认值，`--reveal` 控制敏感值原文；`docs.nav.helpChildren` / `docs.nav.pageSizeExclude` 可逗号分隔写入
- `release mirror` 按主版本分页（`docs/changelog.md` 只保留最新主版本，旧主版本归档到 `<major>.x.md`），支持 `--dry-run` 与 `--check`（逐页比对并汇总缺页 / 多页 / 内容差异）
- `docs/upgrade-v2.md` 升级说明与命令对照表：覆盖三步升级、命令 / 技能 / 配置段对照、JSON 信封与锚点变化；对照表由命令注册表生成，`pnpm verify` 校验生成段未漂移
- `fxri-plan-task` 冲突体检：≥2 个任务进入执行态时、建档之前检查文件争用 / 顺序 / 契约 / 文档 / 变更集 / 跨仓 / 授权与共享现场；阻断项停在体检阶段并附处理方案，调序经「继续」恢复、改范围须重新开工
- `fxri-plan-review` 增加冲突复核轴：只查最近一轮执行态是否体检、阻断是否经授权，讨论期改表不算问题
- 文档与技能产物改为生成块（项目面技能候选目录表、环境变量清单、升级对照表），`--check` 接入 `pnpm verify`
- 技能与工具离线自包含：候选目录表增包内生成副本，技能内远端文档链接改为本地指针
- 透传 changesets 的子命令原样返回子进程退出码，被信号终止时按 128 + 信号编号（如 SIGTERM → 143）
- `fxri-writing-docs` 增补代码块内联注释对齐口径：按显示宽度、分组取相对最长基准（≤5 行取最长，≥6 行取中位数 + 10 以内的最长），目录树整块一列到底；技能版本升至 0.2.1
- 可选技能 `fxri-test-tty`：沉淀 node-pty / ConPTY 交互测试驱动与断言清单，退出码以被测 CLI 文档为唯一真源

### 🔧 功能调整

- `docs` 裸命令改为默认全量校验（theme / nav / dist），并新增等价的 `docs check`
- v1→v2 升级提示改为先执行 `toolkit upgrade`；升级说明页与 CLI 参考新增「升级迁移」入口，帮助下拉移除该入口、侧栏新增「升级」分组
- 升级、init 与帮助尾部先给本地文件或本地命令，在线页面标为可选补充
- `skill plan`、`skill mount`、`usage log` 等低频命令在 help 中隐藏

### ⚡ 优化改进

- 旧顶层名在参数解析前重写到新命令并提示弃用，别名保留至 2.1.0，命中记录由 `toolkit status` 汇总；运行期生成的命令文案（`init` prepare 钩子、各域提示、门禁脚本）同步新名，help 只呈现新命令
- v1 更新检查识别 2.x 时先引导阅读升级页，不直接给出安装命令
- 配置默认值、技能枚举、状态文案、环境变量名与阈值常量收敛到单一真源，`config list` 与 help 自动跟随；退出码数值收敛到 `src/exit-codes.ts`，`src` 下不再允许 2 / 3 / 130 字面量
- `config list` 一次加载三层配置，不再逐键重复读盘；`unset` 提示删除后的生效值与来源层
- `init` 忽略片段补 `.toolkitrc.json.bak` / `.toolkitrc.local.json.bak`，避免重写配置时备份文件被误提交
- `fxri-writing-docs` 放宽导航锚点规则——允许导航指向稳定小节的页内锚点（须对应当前标题、同组显示名唯一、只作补充入口），死锚点与整页碎片化仍禁止
- 技能入口瘦身：`fxri-plan-task` / `fxri-plan-recap` 压到 150 行告警线内（同主题判别表与四级时间源表下沉 references），`fxri-plan-task` / `fxri-release-changelog` 的重复条文收敛到 references，判定口径与流程不变
- 技能安装交互多选按 core 组在前、optional 组在后展示，组内保持名称升序
- 品牌与描述统一：根描述改为「把对话里的方案与交付，沉淀为仓库内可校验、可分发、可迁移的工程资产」，同步 CLI 描述、包描述、README 与首页；README 写三层能力表述与命令域清单，能力矩阵按协作 / 分发 / 治理重排；社交分享图按原图参数复刻、副标题同步
- 文档触达面、命令域与文档索引集合加机检，语言列表收敛到单一出处；文档一致性测试补 `docs/site-nav.json` 锚点校验
- 新增 C-49 离线自包含规范，`check-consistency` 拦截技能内未标可选的远端链接、越界相对链接与无兜底的跨技能引用

### 🐛 问题修复

- 非 TTY 写确认退出码统一：`config set` / `config unset` 缺 `--yes` 时由 1 改为 2；TTY 下 `task add` / `task update` 答完提示即执行，不再多余要求 `--yes`
- 配置 JSON 非法时 `init` 报「解析失败，未改写」，不再误报「已是当前写法」；数值键拒绝十六进制与科学计数法；全局层 `~/.toolkitrc.json` 的旧段名提示改为手动改名指引
- 交互输入被关闭（非 TTY / EOF）时按无交互退出码结束，不再误报为用户按 Ctrl+C 取消；`skill install` / `skill uninstall` / `skill bump --all` 交互中按 Ctrl+C 按取消处理（130、不写文件）
- 缺必填参数或必填选项时的解析错误改为中文提示，与退出码文档承诺一致
- 标准输出管道被下游提前关闭（`toolkit --help | head -1`）时静默以 0 退出，不再打印 EPIPE 堆栈
- `skill source remove <未登记> --dry-run` 与实跑一致，退出 1 并提示未找到来源
- 技能自查清单的 `--from` 说明补齐 `skill bump` 命令前缀，避免按字面执行失败
- 归档完成时间识别支持单数字分钟，`2026-1-2 3:4` 归一为 `2026-01-02 03:04`
- Windows 上 Node 23 清理悬空技能链接时 `rmSync` 不生效，改为对悬空链接走 `unlink`
- 技能使用事件 schema 的 agent 枚举补齐 `dsh`

### 📝 文档更新

- 补充 `release changeset add` 非 TTY 不创建变更集、裸 `docs` 未检测到目录时跳过并退 0 的口径；退出码页补「外部终止与断管」契约
- 统一文档与示例代码块内联注释的对齐位置（按显示宽度计算，短命令对齐到组内相对最长命令后 2 空格，超长命令只留 1 空格）
- `fxri-plan-task` 的候选目录表改为指向配置参考；开工词闭集、技能体量阈值、脱敏规则清单与规则模块数改为指向单一真源
- 修正首页旧命令名、`skill` 裸命令表的 `mount` 交互口径与 `--no-hooks` / `uninstall --skills` 简写
- 补全文档站校验页的导航规则版本表
