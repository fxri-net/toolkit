---
"@fxri/toolkit": patch
---

- 修改：`toolkit telemetry` 更名为 `toolkit usage`，中文统一为「技能使用情况」，旧命令不再保留
- 修改：全局配置段 `telemetry` 更名为 `usage`，环境变量 `TOOLKIT_TELEMETRY_DIR` 更名为 `TOOLKIT_USAGE_DIR`，默认数据目录改为 `~/.toolkit/usage`
- 修改：检测到旧配置段、旧环境变量、旧数据目录或旧版 Hook 时输出一次性提示，不读取也不迁移
- 修改：文档站相关页面迁至 `usage`，命令帮助与全局规则文案同步改写；已复制旧版全局规则或安装过旧版 Hook 的需按新命令重做
