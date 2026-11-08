> 规则更新时间 2026-11-08 08:31

## 环境与版本
（前置说明，非执行流程步骤）

- 一次性安装（全局，所有项目可用）：
  ```
  pnpm add -g @fxri/toolkit
  toolkit skills install
  ```
  （技能随包分发到各 agent 全局技能目录，与 CLI 同一发布批次；`toolkit skills status` 可查现场）
- 升级：`pnpm add -g @fxri/toolkit` 后开启新会话即生效；副本形式需再跑一次 `toolkit skills install`（技能分发机制细节见技能包文档）
- 升级提示：CLI 运行时自带升级检查提示（设 `FX_NO_UPDATE_CHECK=1` 可关闭）；看到版本提示提醒用户升级，不自行执行
- 校验：`toolkit tasks --help` 可正常输出、对应 agent 的全局 skills 目录下可见 fxri 技能文件即为就绪
