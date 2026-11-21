---
"@fxri/toolkit": patch
---

- 新增：`toolkit config list / get / set / unset` 作为配置唯一写入口，键清单（类型 / 默认层 / 可写层 / 敏感标记）由 `src/config-keys.ts` 单源维护，非法键给最接近的候选
- 修改：配置段名统一为单数（`skillsInstall → skillInstall`、`skillsDelivery → skillDelivery`、`projectSkills → projectSkill`、`tasks → task`），旧段名读时兼容并提示，`toolkit init` 就地重写项目层 / 本地层配置文件
- 修改：移除 `toolkit usage rule`，改用 `toolkit rules compose --module usage`（输出逐字一致）；执行旧命令时直接提示替代写法
