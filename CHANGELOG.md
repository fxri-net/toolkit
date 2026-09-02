# @fxri/toolkit

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
