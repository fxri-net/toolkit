---
"@fxri/toolkit": minor
---

- 新增：`toolkit scope` 无参交互菜单，可查看状态、设置生效范围、管理目录与批量挂载
- 新增：`scope add` / `scope remove` 只改全局 `~/.toolkitrc.json`，采用读-合并-原子写
- 新增：`scope mount <父目录>` 批量项目面安装，扫描一层、多选仓库、显式确认，支持 `--dry-run`
