---
title: config（配置体检）
---

# config（配置体检）

> 只读查看三层配置文件的生效情况与来源，不打印配置值。

```bash
toolkit config status                    # 只读体检：三层命中 / 来源层 / 环境变量层（退出码恒 0）
toolkit config status --format json      # JSON 输出：层级明细、展示键来源、环境变量层、待处理项
toolkit config status --cwd <path>       # 指定向上查找的起始目录（缺省当前工作目录）
```

裸 `toolkit config` 打印本域帮助（列出 1 个子命令）。

| 子命令 | 行为 |
| --- | --- |
| `status` | 只读体检、只报不改（无 `--fix`）：依次输出**一句话结论** + **三层命中现场**（每层给出命中文件绝对路径；未命中为「无」。本地层另标 git 忽略态：已忽略 / 未忽略 / 已跟踪（需 `git rm --cached`）/ 不适用（非 git 仓库）/ 不适用（位于仓库工作树之外）/ 忽略判定不可用）+ **展示键来源层**（`tasks.dir` / `redact.enabled` / `updateCheck.enabled` / `check.warnings` 四键按**叶子键**标注来源层，三层均未显式写出即「默认值」）+ **环境变量层**（`FX_REDACT` / `FX_NO_UPDATE_CHECK` / `FX_CHECK_WARN` 命中的键名，只列来源不列值；**命中 = 已设置且非空，不代表开启**——`FX_REDACT=0` / `FX_CHECK_WARN=0` 会被列出但实际关闭对应能力，`FX_NO_UPDATE_CHECK` 设真值反而关闭更新检查，方向差异需按键名判断）+ **能力旁路**（`CI` 等非配置键覆盖，单列不混入覆盖列）+ **其余已配置段**（除展示键外仍有内容的段名，按「全局层 / 项目层 / 本地层」分组、只列段名不列值）+ **待处理项**（`⚠️` 记 warn、`·` 记 info；含配置降级、本地层忽略态、home 目录下本地配置文件不参与查找的提示、未知段名提示）。**一律不打印配置值**（`redact` 段含个人脱敏规则、`skills` 段含本机路径，落到终端 / CI 日志即外泄）。体检不阻断、**退出码恒 0**（仅 `--format` 非法与 `--cwd` 非法时按参数错误报错退出；配置文件非法 JSON / 顶层非对象经降级后退出码仍为 0，但计入 `warnings` 计数） |

| 选项 | 说明 |
| --- | --- |
| `--format <format>` | `--format json` 输出机器可读报告到 stdout（诊断走 stderr）；非法值按参数错误报错退出 |
| `--cwd <path>` | 向上查找的起始目录（缺省当前工作目录）；相对路径先 resolve 为绝对；指向不存在 / 非目录的路径时报错退出、不回落当前目录 |

报告（`--format json`）顶层为 `summary`（一句话结论）、`cwd`（查找起点）、`levels[]`（三层明细：`file` / `present` / `ignored` / 段名）、`displayKeys[]`（展示键 → 来源层）、`env[]` / `bypass[]`（环境变量命中，只列键名）、`items[]`（`level` / `scope` / `message`）、`warnings`（计数）。⚠️ **仅 `summary` / `items[]` / `warnings` 为稳定契约**（只增不减，与 `conventions status` 公共字段同形）；其余字段（`cwd` / `levels[]` / `displayKeys[]` / `env[]` / `bypass[]`）属实现细节，可能随版本变更。

⚠️ **`summary` 为固定三态文案**（层名一律用「全局层 / 项目层 / 本地层」三词，逐字一致）：命中 ≥1 层输出 `共命中 N 层：<层名、顿号分隔>`；三层全空输出 `三层均无配置文件，全部取默认值`；非 git 仓库时在主句后附 `；未检测到 git 仓库，忽略判定不适用`（旁注，不替换主句）。

⚠️ **`items[].level` 只有 `warn` 与 `info` 两值**（对齐 `conventions status`，无 error 级）；`info` 不计入 `warnings` 计数，仅 `warn` 计入——CI 可据 `warnings` 拦错。**`items[].scope` 当前只有 `配置`（配置降级项）与 `本地层`（本地文件忽略态与 home 边界提示）两值**，文本渲染形如 `[配置]` / `[本地层]`。

⚠️ **文本模式折叠 home**：层级路径与待处理项文案中内嵌的路径都把 home 前缀显示为 `~/…`（避免共享日志 / 截图泄露本机目录结构）；`--format json` 保留绝对路径供脚本定位。

⚠️ **自指关系与取舍**：`tasks check` 的「本地配置文件未入库」软告警受 `check.warnings` 支配，而该开关可被本地层（那个未入库的文件本身）设成 `false` → 告警被同一个文件静音、团队无从察觉。故**不为该告警开例外**，改由 `config status` 的对应提示兜底——它**不受任何配置开关影响**（除 `--format` 非法外恒输出），`level` 为 `warn`、计入 `warnings` 计数。

⚠️ **与 `conventions status` 的参数差异**：`conventions status` 按**任务目录**定位（提供 `--dir`），`config status` 面向**配置文件向上查找**（**不提供 `--dir`**，改用 `--cwd` 指定查找起点）；两者参数不可互换。

⚠️ **与 `tasks check` 的起点差异**：`tasks check` 恒以**运行 cwd** 判定本地配置文件的忽略状态、**无 `--cwd`**；`config status` 可用 `--cwd` 指定起点。两者「本地配置文件是否已忽略」的判据函数共用、态分类一致，仅起点参数能力不同，不可互相替代。

## 相关页面

- 参考：[配置参考](../config) · [完整攻略 · Git 纳管范围](../guide#git-纳管范围)
