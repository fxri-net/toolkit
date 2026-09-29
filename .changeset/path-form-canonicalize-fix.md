---
"@fxri/toolkit": patch
---

- 修复：`toolkit tasks check` 的本地配置忽略告警在 Windows 8.3 短名环境下丢失——`git rev-parse` 返回长名工作树根（如 `C:\Users\runneradmin\…`）而调用方路径为短名（如 `C:\Users\RUNNER~1\…`），工作树归属比对因路径形态不同失配被误归 `outside-repo`，「未忽略 / 已跟踪」告警静默吞掉；现两侧先取磁盘真实形态再比对
- 修复：本地层配置查找的 home 边界在其形态与目录链不一致时失效（home 为短名或软链形态），存在把 `~/.toolkitrc.local.json` 误当项目本地层命中的风险；现 home 与目录链两侧统一取真实形态比对
