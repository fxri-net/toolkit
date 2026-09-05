# @fxri/toolkit

## 1.7.1

> 2026-09-05 发布

### 🐛 补丁修复

- 新增 `.toolkitrc.json` 全局配置层：读取 `~/.toolkitrc.json` 存放个人偏好（关升级提示、个人脱敏规则、自定义语言表等），与项目配置按配置段合并——项目出现的段整体覆盖全局同名段，未配的段取全局；覆盖链为 CLI > 环境变量 > 项目 > 全局 > 默认值；全局文件非法或带 BOM 同样忽略不报错
- 文档：推荐的 AI 全局规则模板升级——代码规范补验证纪律（改动后跑测试/类型检查，失败先修复再交付）；方案落盘并入执行顺序（先项目级 `pnpm exec toolkit` 后全局）与「先查后写」，保留质量门 normalize 指引、「三口径冲突以 check 为准」与不可用双分支处理；配套安装节与规则全文去重，逐段说明补齐对应条目
- 文档：文档站首页改版为 VitePress home 布局——新增 hero 标语与行动按钮、六张 features 能力卡片，正文精简为痛点能力速览并入卡片，保留 30 秒上手与文档索引；快速开始改为 code-group 四包管理器标签（pnpm/npm/yarn/bun）并前移至首节，浏览器标签补首页专属标题，文档索引 API 参考文案修正为「作为库引入 Node 项目」
- 文档：FAQ 新增「内网或离线环境怎么装」指引——按网络受限程度分三档给出 CLI 与 skills 的安装路径（GitHub 不可达时改以已装 CLI 包目录为 skills 本地源，实测验证），新手指南安装节末尾补入口链接
- 文档：文档站补齐站点成熟度要素——站点标题与内页标签统一为中文品牌「方弦工具集」，导航栏新增品牌 logo 与 favicon，配置社交分享卡片 og-image（1200×630 品牌图）；开启「最后更新于」（按 git 提交时间）与「在 GitHub 上编辑此页」，新增站点页脚与 sitemap；新增「更新日志」页面镜像根 CHANGELOG.md 全量历史并挂载导航与侧栏入口，提供 `pnpm sync:changelog-doc` 命令随发版自动同步；README 顶部增加品牌 logo；CI 文档站构建改为完整克隆保证 lastUpdated 日期准确

## 1.7.0

> 2026-09-05 发布

### ✨ 新增功能

- 新增 `toolkit init` 命令，一键初始化 .tasks 任务区
- 新增 `tasks stats` 任务周期统计视图
- 新增完成时间检测：晚于当前系统时间与恰为零点整（疑似只填日期被补零），check/normalize/archive 三道关口告警
- CLI help 底部新增文档链接，运行时新增版本升级检查提示
- 新增 fxri-session-recap 会话归档技能

### 🐛 补丁修复

- 修复：任务文件解析兼容 UTF-8 BOM（Windows PowerShell 写盘不再误报缺少 frontmatter）
- 修正版权主体与版权符号
- 依赖：commander 降级至 Node 20 兼容版本
- 文档：新增 VitePress 文档站点与 docs 八篇文档体系，README 重构为入口页，全文档统一 pnpm 命令
- skills：补充多包管理器下 pnpm 置前的探测顺序，收尾边界口径与文档同步

## 1.6.5

> 2026-09-04 发布

### 🐛 补丁修复

- 文档：同步 skills 与最新工具能力——fxri-release-changelog 的 changelog-format.md 版本块示例与规则补「标题与日期行间保留空行」（对齐 1.6.4 空行修复后的真实输出）；fxri-plan-to-task 的 task-spec.md 自查清单补「active 根目录直放」与「游离于 active/ 之外」两项软告警（对齐 1.5.3/1.6.3 的 check 能力）；两 SKILL.md metadata.version 递增至 1.0.1

## 1.6.4

> 2026-09-04 发布

### 🐛 补丁修复

- 修改：CLI `--help` 描述文案与 README 首行对齐——由「开发工程化工具集：任务管理 + 多语言 CHANGELOG 发布」改为「专为多人 + AI 跨项目协作打造：任务管理 + 多语言 CHANGELOG」（纯文案，无逻辑变化）
- 修复：changelog format 补发布日期时把日期行紧贴版本标题（缺空行）——现在版本标题与日期行间始终保留空行，并对历史已存在的缺空行数据自动自愈

## 1.6.3

> 2026-09-04 发布

### 🐛 补丁修复

- 新增：tasks check 检出游离于 active/ 之外的任务文件并软告警——对带 {YYYYMMDD}- 日期前缀且位于 .tasks 根目录或漏建 active 层的 {YYYYMM}/ 子目录下的 .md 给出提示（此类文件不被 tasks/check/archive 读取），避免建档错位后无任何反馈

## 1.6.2

> 2026-09-04 发布

### 🐛 补丁修复

- 文档：补充隐私脱敏禁用行为说明——README 自定义规则说明明确被禁用规则不参与匹配、敏感信息原样保留；效果示例增加手机号默认脱敏与禁用保留的对照行，并注明禁用仅影响该类匹配

## 1.6.1

> 2026-09-04 发布

### 🐛 补丁修复

- 修复：tasks archive 对 CRLF 源文件做换行还原时二次转换产生双重 CR（`\r\r\n`），读取 active 任务统一归一为 LF、解析归档块剥离孤立 CR；文档修订：根 README 特性列表补零依赖 AI 技能包条目；skills/README.md 补 npm 包自带技能目录路径（node_modules/@fxri/toolkit/skills/）；fxri-plan-to-task 可选加速节补 `toolkit tasks normalize`

## 1.6.0

> 2026-09-04 发布

### ✨ 新增功能

- 新增：新增零依赖 AI 技能包 skills/（fxri-plan-to-task、fxri-release-changelog）

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

### 🐛 补丁修复

- archive 合并写回按原文件换行风格还原（LF/CRLF），避免 Windows 仓库追加新块产生混合换行
- 导出（CSV/JSON/XLSX）改原子写，中断不再残留半截文件
- 展示路径统一走公共 helper（`displayRel`），跨命令输出一致
- check 已归档索引增加 mtime 感知缓存，重复校验不重复读盘
- `normalize --fix` 错月迁移后清理遗留空月份目录
- 标题提取 / 状态枚举 / 日期解析收口到公共实现（list/query/validate/import/changelog 共用），消除多份近似代码
- tsconfig 开启 `noUncheckedIndexedAccess`，数组与索引访问显式兜底

## 1.5.5

> 2026-09-03 发布

### 🐛 补丁修复

- archive/check/normalize 子命令统一「操作失败」兜底，不再抛原始 Node 堆栈
- `printTasks`（库 API）复用 board 渲染，分组顺序/日期口径/文案与 CLI 完全一致
- import 获取共享写锁（.archive.lock），防止并发导入互相覆盖
- 归档元数据段解析抽公共 `parseMetaSegments`（query 展示与补全复用）
- tsconfig 开启 `strict`（存量零错误基线）
- check 的待办词标记扫描跳过标题行，避免标题含「待办」等词误报
- import 输出路径统一为相对任务目录的 `/` 分隔
- 缺失 `depends_on` 指向已归档任务时，提示精确归档位置
- 修复 archive 汇总计数口径：按任务数统计（此前按日期文件数误报）

## 1.5.4

> 2026-09-03 发布

### 🐛 补丁修复

- `tasks normalize` 增加 `--check` 显式只读别名，并与 `--fix` 互斥报错
- `--status` 非法值改为告警并忽略，不再静默
- 任务总览对 `STATUS_ORDER` 之外的未知状态以兜底分组展示，并在汇总计入「其他」（不再“数得到看不到”）
- `depends_on` 解析抽公共 `parseDepends`（validate/query 复用），消除双实现漂移
- 导出目标目录不存在时自动创建（CSV / XLSX / JSON）
- `normalize --fix` 会把放错月份目录的归档文件移动到正确月份目录
- archive 多日期归档逐日失败汇总（失败日不删除 active，可安全重试）

## 1.5.3

> 2026-09-03 发布

### 🐛 补丁修复

- 修复补元数据整行重写改错状态：`normalize --fix` 现在保留原行已有的 负责人/状态/范围 段，仅补缺失项（防 `已放弃` 被误改成 `已完成`）
- `normalize --fix` 计数与行为对齐：降序重排、冗余分隔符清理计入修复数，并输出按文件的动作明细
- `printTasks` 日期列改为 created 优先（与 board/导出口径一致）
- `check` 对 active 根目录直放任务文件给出 {YYYYMM} 月份子目录软告警
- `--owner/--scope` 支持逗号分隔多值过滤
- changelog 域补单测（标题转换/去 hash/去重/补日期/脱敏/collect 排除），collect 排除 coverage；README 补充 changelog 中文润色示例

## 1.5.2

> 2026-09-03 发布

### 🐛 补丁修复

- `.toolkitrc.json` 改为从当前目录向上查找最近一份（支持 monorepo 子目录运行）；脱敏作用范围与配置查找写入 README
- `printTasks` 分组顺序统一为 STATUS_ORDER；`check.pendingMarkers=false` 可关闭词标记扫描（复选框开关保留）
- `normalize` 检出放错月份目录的归档文件（如 archive/202608/20260903.md）
- archive / import / 归一化写文件原子化（临时文件 + rename），降低半截文件风险
- `tasks --strict`：任务目录不存在时报错退出（默认仍容错为空结果）
- 工程化：vitest v8 coverage（`test:coverage`）、eslint `--cache`、CI 增加自身 `.tasks` 体检、README 增加 CI badge

## 1.5.1

> 2026-09-03 发布

### 🐛 补丁修复

- 修复 archive 合并覆盖归档文件自定义 header（改为保留既有头部，仅新文件用默认文案）
- 修复陈旧归档锁阻塞：锁文件超过 10 分钟视为进程残留自动清理接管，正常并发仍跳过
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

### 🐛 补丁修复

- 修复隐私脱敏对密钥新格式覆盖不全：补充 GitHub 细粒度 `github_pat_`、OpenAI 项目 `sk-proj-`、Slack app 级 `xapp-` 规则（均带长度门槛防误伤）；JWT 放宽为仅头段要求 `eyJ` 前缀，载荷/签名允许任意 base64url，避免真实载荷起始非 `eyJ` 时漏掩。

## 1.4.1

> 2026-09-03 发布

### 🐛 补丁修复

- 文档：README 补齐任务导出结构（终端 / CSV / XLSX / JSON 列定义与字段全集、排序与日期口径）、任务导入列别名内置表与 `.toolkitrc.json` 自定义示例、库 API 增补，供用户与 AI 查阅。

## 1.4.0

> 2026-09-03 发布

### ✨ 新增功能

- 新增 tasks 多视图查询与导入导出：`--view active/archived/all` 查看待完成/已归档/合并（状态分组 + 汇总），支持 `--owner/--scope/--status/--date/--since/--until` 过滤；`--export` 导出 CSV / XLSX（三 sheet）/ JSON，`--import` 从 CSV / XLSX / JSON 回读生成任务（内置列别名 + `.toolkitrc.json` 的 `tasks.importColumns` 自定义，目标 active/archive、可 dry-run、冲突自动加序号）。默认 `toolkit tasks` 行为不变。

## 1.3.3

> 2026-09-03 发布

### 🐛 补丁修复

- 修复 `tasks` 归档块解析缺陷：`normalize` 将归档正文 `## ` 小节误判为任务块（`--fix` 会打散正文）、`archive` 合并时块体在正文 `---` 处被截断丢正文。统一为共享解析（标题后紧跟含「完成时间」元数据行才算任务块），并保留原文件行尾。

## 1.3.2

> 2026-09-03 发布

### 🐛 补丁修复

- 修复 `changelog format`（及 `version` 自带格式化）未去掉 changesets changelog-git 写入的 commit hash 前缀，导致中文 CHANGELOG 条目带 `800a1cf: ` 这类前缀。

## 1.3.1

> 2026-09-03 发布

### 🐛 补丁修复

- 修复 `tasks normalize --fix` 缺少排他锁，与归档并发时可能互相覆盖归档文件；收敛 README/SPEC/package.json 定位文案，融入「多人 + AI + 跨项目」。

## 1.3.0

> 2026-09-03 发布

### ✨ 新增功能

- 依赖升级：commander 14 → 15，changelog 自有选项改为置于子命令之前
- changelog 全语言化：.toolkitrc.json 的 changelog.languages 支持自定义语言与覆盖内置 zh/en
- 文档：SPEC/README 语言描述改为「全语言支持」

## 1.2.0

> 2026-09-03 发布

### ✨ 新增功能

- 新增任务校验与归档归一化能力：

  - 新增 `tasks check` 校验 active（frontmatter 合法性、跨文件重名、depends_on 依赖闭环、未闭合待办）
  - 新增 `tasks normalize --check/--fix` 检查与修复归档块（元数据四字段、日期漂移、降序）
  - `tasks archive` 新增 `--dry-run` 预演与排他锁防并发覆盖
  - 软告警双向三档开关（`--warn/--no-warn`、`FX_CHECK_WARN`、`.toolkitrc.json`），默认开启
  - 隐私脱敏开关升级为双向（`--redact/--no-redact`、`FX_REDACT=0/1`）
  - changelog 协同软告警：归档时无变更集提示、发版时未归档提示
  - 统一配置读取（.toolkitrc.json）与开关解析，供各能力域复用

## 1.1.3

> 2026-09-03 发布

### 🐛 补丁修复

- README 与 .tasks/SPEC 文档补充「归档与提交约束」：任务完成后先归档再提交，保证任务记录与代码变更同批入库。

## 1.1.2

> 2026-09-03 发布

### 🐛 补丁修复

- package.json 补充 repository 字段，npm 包详情页展示 GitHub 仓库地址。

## 1.1.1

> 2026-09-03 发布

### 🐛 补丁修复

- CLI 改用 Commander 实现，新增 --help/--version 与 tasks/changelog 子命令帮助，changelog 透传子命令支持未知选项；commander@^14 作为运行时依赖。

## 1.1.0

> 2026-09-03 发布

### ✨ 新增功能

- 新增隐私脱敏能力：落盘记录自由文本时默认对邮箱、手机号、身份证、IPv4、密钥、JWT、内网 URL 做掩码，支持 --no-redact / FX_REDACT / .toolkitrc.json 三档开关与自定义规则；归档任务改为按完成时间降序并规范化 completed；修复 CHANGELOG 日期补全重复插入。

## 1.0.2

> 2026-09-03 发布

### 🐛 补丁修复

- README 新增「方案落盘（任务区）」章节，明确 npx→ 全局 → 兜底输出的调用优先级，以及 toolkit tasks 校验/归档与 changelog 变更集/发版的使用流程。

## 1.0.1

> 2026-09-02 发布

### 🐛 补丁修复

- 修复 CHANGELOG 格式化在 CRLF 文件下失效及正文中段重复条目无法合并的问题
- 发布日期后缀文案随语言切换，英文 CHANGELOG 不再混入中文「发布」
- 新增 exports 条件导出，CJS 消费方可正常 require
- changesets 调用改走进程内 node 与数组参数，规避跨平台 shell 差异
- 修复 changelog 域不带 --lang 时首命令被误删的问题
- 移除公开包元数据中的私有仓库地址

## 1.0.0

> 2026-09-02 发布

### ✨ 新增功能

- 新增任务管理域（tasks）：扫描、总览、归档 Markdown 任务文件
- 新增多语言 CHANGELOG 域（changelog）：封装 changesets，支持中英文标题格式化

### 🐛 补丁修复

- 完善 npm 发布配置并为英文变更日志补充分类图标
