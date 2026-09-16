---
outline: false
---

# 更新日志

> 完整变更历史以随包发布的 CHANGELOG.md 为准，本页由 `pnpm sync:changelog-doc` 从根 CHANGELOG.md 自动同步，请勿手改。

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
  - 既有历史块本无前缀，剥离是回归原生形态；1.9.0–1.9.3 块经 `toolkit changelog --history format` 一并统一
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

- 治理设计审计发现的 14 处不成熟点（写盘事务性、文本协议脆弱性、三方一致性）

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

- 回补三方一致性核对发现的 8 处失同步，`tasks stats --format` 与其余命令对齐

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
  - 修复：发布日期行识别由硬编码「发布/released」改为「当前语言 `released` ∪ 全部内置语言 `released`」后缀集合——自定义语言（日文等）按自身 `released` 识别，内置 zh / en 互跑（如中文日志用 `--lang en` 输出）也不再重复追加日期行

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
  - 修复自愈「重建失败」时状态记录被静默写掉的问题：失败条目保留在 `~/.agents/.toolkit-skills.json`，下次运行仍会重试

### 🐛 问题修复

- 诊断提示污染机器可读输出：链接自愈提示与升级提示改走 stderr，stdout 保持纯 JSON

  - `toolkit tasks --format json` 等机器可读输出不再被追加提示文本，可安全 `JSON.parse` 与管道消费
  - `updateCheck` 的缓存文件带 BOM 时不再误判为损坏而重复联网（与配置文件、技能状态文件同口径剥离 BOM）

## 1.8.3

> 2026-09-07 发布

### 🐛 问题修复

- 范围字段多值口径落地——scope 多值以半角加号分隔（如 `toolkit+lxgl-web`），`--scope` 过滤改按任一段命中，`tasks stats` 按范围拆段统计
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

- fxri-plan-to-task 升级 1.0.7——completed 按四级时间源取证；归档后做任务级规范沉淀（写入 conventions.md），能力终点由「归档」升级为「归档 + 沉淀」；先查后写时读取并遵守 conventions.md
- fxri-plan-to-task 升级 1.1.0——「先查后写」强化为「动手前置建档评估」流程落点（所有仓库改动前必做），补同主题判别表：active 同主题更新原文件、archive 同主题无增量提示不重复建档、有增量重建并标注来源链、归档任务不可变
- fxri-session-recap 升级 1.1.0——会话收尾全量沉淀（先核对清单防漏档）、四级时间源还原真实完成时间、新会话三层恢复覆盖全部任务（含已归档，近窗超阈值自动降级统计）、历史任务时间批量修正、规范沉淀进 `.tasks/conventions.md`
- fxri-release-changelog 升级 1.0.5——触发词扩充为语义化意图描述（发一版/出个版本/记一下这次改动等近义表达均可触发，不要求字面一致）
- fxri-release-changelog 升级 1.0.6——description 与「何时使用」补反例排除：「提交个版本/先提交一版/commit」指 git 提交当前改动而非发版，仅在用户明确表达发布/生成 CHANGELOG 时才进入本技能

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
