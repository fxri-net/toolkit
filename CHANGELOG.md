# @fxri/toolkit

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
