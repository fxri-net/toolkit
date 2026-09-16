---
"@fxri/toolkit": minor
---

新增：规范载体目录化与端分类——`.tasks/conventions.md` 单文件升级为 `.tasks/conventions/` 目录形态（`index.md` 唯一入口 + `common.md` 全端通用条文 + `<端名>.md` 各端专属条文，分册按需创建），端名与任务 `scope` 取值逐字一致、`index.md` 顶部端清单为端的唯一权威，读取分层为「常驻只读 index + 按 scope 命中加载分册与 common」。

- 新增：存量迁移支持——旧单文件可整体搬为 `index.md` 后逐条给归属建议、用户确认后拆分册，迁移三段式可中断不丢内容；新旧形态兼容读，两者并存时以目录形态为准
- 新增：内容修订路径——旧条目过时走「演进记录留痕 + index 行更新 + 状态置 `已废弃`」，不删行
- 修改：`toolkit init` 预生成 `conventions/index.md` 骨架（含端清单模板）；`toolkit tasks check` 在旧单文件残留或 `conventions/` 缺 `index.md` 时给软告警，即迁移入口
- 优化：fxri-plan-to-task 升级 1.2.0（写入归属判定 + 存量迁移触发）、fxri-session-recap 升级 1.2.0（R3 落点、读取分层、内容修订与形态迁移分流）、fxri-release-changelog 升级 1.0.12（发版流程补「润色后跑一次 `changelog --history format` 归一历史块」步骤与失败模式，references 补格式化不动点口径）
- 文档：补迁移教程——guide 新增「存量规范载体迁移」节，handbook 新增「四、规范载体迁移」节，faq 新增迁移问答
- 文档：修正文档承诺未实现——guide 原称 conventions.md「两种形态 skill 均支持」，实际 SPEC.md / task-spec.md / 两个 SKILL.md 均无「形态」概念，已按实际能力改写
