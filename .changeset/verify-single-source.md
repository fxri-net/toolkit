---
"@fxri/toolkit": patch
---

优化：本仓库验收步骤清单单源化——新增 `pnpm verify` 聚合门禁（步骤定义在 `scripts/verify.mjs`），本地与全部 CI 流水线共用同一份清单，消除此前四份手写清单彼此漂移导致的「本地自检通过、CI 才报错」

优化：本地新增 pre-push 钩子（`.githooks/pre-push`）跑 `pnpm verify`，启用方式写入 AGENTS——执行一次 `git config core.hooksPath .githooks` 即可在推送前拦下 CI 才能暴露的问题

优化：`fxri-plan-to-task` 技能补「验收与 CI 同源、不手写清单」纪律（版本 1.3.1）
