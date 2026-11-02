---
"@fxri/toolkit": minor
---

- 新增：技能按 `metadata.tier` 分层（`core` 必装、`optional` 可选），安装时 TTY 方向键多选，支持 `--skills` / `--all` / `--no-optional` / `--yes`，首次只装 core
- 新增：全局层 `skillsInstall` 与项目层 `projectSkills` 安装偏好，选择集安装后写回；误写层告警并忽略
- 新增：`skills install --prune` 清理未选择且内容与本包真源一致的旧产物；`skills remove --skills` 只清指定技能
- 修改：技能状态文件改为 `format` + `schemaVersion` + `sources` 结构，旧结构首次读取时一次性导入并备份 `.bak`
- 修改：`skills status` 的 `missing` 只表示已选择但缺失，新增「未选择但已安装」单列且不计入问题
- 修改：`skills remove` 按「配置 → 产物 → 状态」顺序清理
