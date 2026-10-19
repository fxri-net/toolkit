---
"@fxri/toolkit": patch
---

- 优化：`fxri-session-recap` 1.6.0 将模式二（恢复上下文）与模式三（历史时间修正）下沉为 `references/mode-2-recovery.md` / `mode-3-time-fix.md` 按需加载，主文件只留概要、关键护栏与读取指针，常用且高风险的模式一仍内联
- 优化：`fxri-plan-to-task` 1.9.1 与 `fxri-session-recap` 的存量迁移、载体升级细节压缩为触发条件 + 指针，细则只在 `conventions-migration.md` 维护
- 修复：`fxri-release-changelog` 1.2.1 修正 `changelog-format.md` 文件结构示例仍带类型前缀、与「归类后剥离前缀」规则冲突
- 文档：`skills/README.md`、`docs/guide.md`、`docs/faq.md` 澄清技能加载口径——`description` 常驻用于匹配触发、正文触发时加载、`references/` 按需读取，不再声称「零上下文占用」「未声明不会自动介入」
- 文档：发布核对清单与单元测试新增加载体积守卫——主干 `SKILL.md` 不超过 8,000 字符
