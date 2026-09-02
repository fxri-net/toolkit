# @fxri/toolkit

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
