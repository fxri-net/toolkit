---
owner: 唐启云
status: 进行中
created: 20260905
updated: 20260905
completed: ''
depends_on: []
scope: toolkit
---

# CI工作流Action升级至Node24运行时版本

## 背景

GitHub 于 2026-09-16 从 Actions runner 移除 Node 20，现有 workflow 使用的官方 action 均为 node20 运行时，每次运行产生弃用警告（被强制跑在 node24 上）。经核实各 action 最新版运行时确定升级映射：checkout v4→v5、pnpm/action-setup v4→v6（version 输入对 pnpm 10 兼容，官方示例同款）、setup-node v4→v5、upload-pages-artifact v3→v5（v4 及以下内部引用的 upload-artifact 仍为 node20）、deploy-pages v4→v5。FORCE_JAVASCRIPT_ACTIONS_TO_NODE24 环境变量方案已弃用（现已被强制 node24，加了无意义）。CI 配置变更不触达包能力，无需变更集。

## 实施项

- [ ] A. deploy-docs.yml 五处升级：checkout@v5、pnpm/action-setup@v6、setup-node@v5、upload-pages-artifact@v5、deploy-pages@v5
- [ ] B. ci.yml 六处升级：checkout@v5 ×2、pnpm/action-setup@v6 ×2、setup-node@v5 ×2
- [ ] C. 提交并推送 github 远端，确认 CI 全绿且无 Node 20 弃用警告
- [ ] D. Deploy Docs 全绿依赖 GitHub Pages 已开启（用户网页设置 Source: GitHub Actions 后 Re-run）

## 验收标准

- 两个 workflow 的 uses 全部为 node24 运行时版本
- CI 运行无 Node 20 弃用警告；Deploy Docs 部署成功
- 验证依赖推送，代码变更先行提交，Actions 全绿后取真实时间归档并单独提交归档文件
