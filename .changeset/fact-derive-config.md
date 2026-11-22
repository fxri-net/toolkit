---
"@fxri/toolkit": minor
---

- 新增：`docs.nav.helpChildren` 与 `docs.nav.pageSizeExclude` 登记为可写配置键，支持 `config set` 以逗号分隔写入
- 优化：配置默认值、技能枚举、状态文案、环境变量名与阈值常量收敛到单一真源，`config list` 与 help 自动跟随
- 修复：技能使用事件 schema 的 agent 枚举补齐 `dsh`
