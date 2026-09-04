---
owner: 唐启云
status: 待办
created: 20260905
updated: 20260905
completed: ''
depends_on: ["20260905-唐启云-文档体系重构与上手体验优化"]
scope: toolkit
---

# 降级 commander 至 Node 20 兼容版本

## 背景

commander ^15.0.0 要求 Node >=22.12，与本包 engines.node >=20 冲突，Node 20 环境安装即告警。

## 实施方案

- package.json `commander ^15.0.0` → `^14.0.3`（14 系最新，engines 为 >=20）
- CLI 仅用 command/option/description/version/parse 基础 API，v14 完整支持，代码零改动
- 重新生成 lockfile

## 影响范围

- 仅 package.json 与 lockfile，src/ 零改动

## 验证方式

- pnpm install 无 engine 警告
- 全量门禁：typecheck / lint / test / build
- CLI 冒烟：toolkit --help / tasks --help / changelog --help / 无效参数报错

## 完成说明

（完成后填写）
