---
title: updateCheck（升级检查）
---

# updateCheck：升级检查提示

> 提示频率、通道、registry 与缓存；关闭方式与诊断开关。

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | 升级检查总开关；`false` 时不联网、不提示 |
| `notify` | string | `always` | 默认展示频率：`always` / `daily` / `weekly` / `off`；非法值告警后回落 `always` |
| `channels.cli.notify` | string | 继承 `notify` | CLI 本体提示频率；`off` 可单独关闭 |
| `channels.builtinSkills.notify` | string | `inherit` | 本包内置技能提示频率；`inherit` 表示 CLI 已落后时由 CLI 提示覆盖，CLI 最新但磁盘副本落后时才单独提示 |
| `channels.externalSkills.notify` | string | 继承 `notify` | 第三方来源技能的默认提示频率 |
| `sources.<name>.notify` | string | 继承 `channels.externalSkills` | 单个第三方来源独立覆盖 |
| `registry` | string | 见下方解析顺序 | 查询最新版本的 registry 地址 |

提示频率优先级：`sources.<name>` > `channels.externalSkills` > `notify` 全局默认；CLI 走 `channels.cli` > 全局默认，内置技能默认 `inherit`。

- 通道关闭不是总闸：`channels.externalSkills: off` 时，显式写了 `sources.<name>.notify` 的来源仍按来源值提示
- 要全部静默用 `enabled: false`
- 临时来源不写独立配置，继承 `channels.externalSkills`
- 配置里写了未注册来源名时，`skills status` 归入「未知来源配置」提示，不阻断命令
- 单个来源的频率用 `toolkit skills sources notify <name> --frequency <always|daily|weekly|off> [--scope global|project]` 写入

registry 解析顺序（前者优先）：

- `updateCheck.registry` 配置
- 环境变量 `npm_config_registry`
- 项目 `.npmrc`
- 家目录 `.npmrc`
- `https://registry.npmjs.org`

- 仅接受 http / https；含账号密码的地址会剥离 userinfo 并告警
- 认证读取 `NPM_TOKEN`，其次读取 `.npmrc` 中与 registry host 匹配的 `_authToken`；token 不写入日志、报告或缓存
- Node fetch **不自动读取 `HTTP(S)_PROXY`**，代理环境下请求会静默失败，可用 `updateCheck.enabled: false` 关闭检查

提示只在**命令成功**（退出码 0）时输出。以下情形不输出文本提示：

- `--help` / `help` 子命令 / 裸 `toolkit`
- `skills path` / `skills status` / `tasks export` / `docs theme`
- `changelog` 的非 version / format / doc 子命令
- `--format json`

`--version` 与 `--check` 的提示只走 stderr；TTY 下提示走 stderr，非 TTY（AI / 脚本）走 stdout 结尾。

版本比较口径：

- 数字段不等时按补零比较（`0.2` 等价 `0.2.0`）
- 预发布低于同号正式版（`0.2.6-beta < 0.2.6`）
- 忽略构建元数据（`+build`）
- 任一侧无法解析为版本时不提示
- 外部来源比较的是**技能自身**的 `metadata.version`（读自来源缓存目录），不用来源仓库的包版本——两者独立编号

**已尝试修复即收敛**：执行过 `skills install` 后，本次仍未解决的条目按「技能 + 最新版本」记入缓存（`~/.toolkit/cache/update-check.json` 的 `dismissed`）。

- 同一版本不再提示；来源版本变化自动恢复，CLI 版本升级后旧记录整体失效
- `skills status` 展示上次检查时间与下次可提示时间（`always` 为「随时」、`off` 为「已关闭」）
- JSON 侧对应 `versionStatus.checkedAt` / `versionStatus.nextHintAt`

**诊断开关** `FX_DEBUG_UPDATE_CHECK=1`：在 stderr 输出每轮判定依据，不改变提示结果，也不污染 stdout。

判定依据含：CLI 当前 / 缓存最新 / 检查时间 / 频率与来源、每个技能的已装与最新版本、被跳过的原因。排查「为什么一直提示 / 为什么不提示」时使用。

CLI 每次命令执行时**同步读取本地缓存**；缓存不新鲜时派生一个**分离的后台子进程**联网查询最新版本（1 秒超时，离线 / 内网 / 超时静默失败）。父进程不联网、不等待结果，**不阻塞命令、不影响退出码**。

缓存位于 `~/.toolkit/cache/update-check.json`：

- 成功结果 24 小时内不重复请求，失败结果 1 小时内不重试
- 过期不删除上次成功版本，按 stale-while-revalidate 继续用旧值提示并后台刷新
- 提示只来自缓存，因此首次运行只静默刷新缓存，下一次命令才提示新版本

关闭方式二选一：环境变量 `FX_NO_UPDATE_CHECK` 设为真值（`0/false/off/no` 视为未关闭），或配置 `enabled: false`。

关闭后不派生后台进程、不发起任何网络请求。脚本需要稳定输出时请用 `--format json` 或设 `FX_NO_UPDATE_CHECK=1`。

## 相关页面

- 参考：[配置参考总览](../config) · [完整攻略 · 升级与版本兼容](../guide#升级与版本兼容) · [配置体检](../cli/config)
