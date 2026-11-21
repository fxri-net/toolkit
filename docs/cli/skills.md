---
title: skills（技能分发）
---

# skills（技能分发）

> 把包内技能分发到各 agent，并管理来源、目标与版本。

```bash
toolkit skills install              # 安装包内技能（缺省按现场判定作用域）
toolkit skills install --scope project # 仅项目面：真源副本 + 候选目录薄壳
toolkit skills install --scope global  # 仅全局面：软链 / 副本到 agent 目录
toolkit skills install --scope all     # 项目面 + 全局面都执行
toolkit skills install --skills fxri-plan-to-task,fxri-text-encoding # 只装指定技能（core 恒装）
toolkit skills install --all        # 安装全部技能（含可选技能）
toolkit skills install --no-optional # 只装 core 技能
toolkit skills install --yes        # 非交互：跳过选择与确认，采用已保存选择
toolkit skills install --use-saved # 跳过选择交互，仍保留最终确认
toolkit skills install --agent claude-code,canonical # 只写指定 agent（canonical 为主目标）
toolkit skills install --all-agents # 写入全部已检测的 agent
toolkit skills install --no-save-agents # 目标选择只对本次生效，不写回配置
toolkit skills install --prune      # 清理未选择且与真源一致的旧产物
toolkit skills install --mode package # 纯包管理器模式：core 也可不装，允许零选
toolkit skills install --no-skills  # 仅本次零装，不改模式与已保存选择
toolkit skills install --gate       # 内容闸门：按 skillsInstall.gate 接管入口壳，--embed 回退
toolkit skills gate [on|off]        # 查看或切换内容闸门；切换后运行 skills install 生成 / 还原入口壳
toolkit skills mount --dry-run      # 批量挂载：预览将写入的项目（由 scope mount 迁入，原命令已移除）
toolkit skills install --copy       # 强制副本（仅全局面；`--gate` 接管技能仍写入口壳并告警）
toolkit skills install --dry-run    # 预演：只预览将执行的动作，不写文件
toolkit skills install --force      # 覆盖同名非本包产物（默认跳过；不改已登记副本形态）
toolkit skills install --dir <path> # 额外目标目录（可多次；全局面兜底未收录 agent，项目面须在仓库内）
toolkit skills install --from <path|url> # 临时外部来源（目录或 Git 地址；只写本次，可重复）
toolkit skills install --from https://github.com/fxri-net/playbook#vX.Y.Z --save play # 远程永久来源
toolkit skills uninstall --source play # 只清理指定外部来源的登记与产物
toolkit skills sources               # 列出外部来源、版本与生效的更新提示频率（内置源不在列表内）
toolkit skills sources notify play --frequency daily # 设置单个来源的提示频率（--scope global|project）
toolkit skills sources refresh       # 刷新全部外部来源缓存与版本（--dry-run 列出将刷新来源与当前版本，不联网）
toolkit skills sources remove play --prune # 注销来源登记并清理其产物、状态与提示配置
toolkit skills bump fxri-plan-to-task patch # 递增技能版本（frontmatter 与正文首部两处同源改写）
toolkit skills bump --all --dry-run      # 预演批量递增全部技能，只打印 from → to
toolkit skills bump --all minor --yes    # 批量递增（非交互须 --yes）
toolkit skills bump fxri-plan-review --set 2.0.0 # 直接设定版本（与递增类型互斥）
toolkit skills bump --dir skills --all patch # 外部仓：对指定技能目录批量递增
toolkit skills lint                     # 校验本包 skills/（150 行 / 8000 字符告警，200 行 / 12000 字符报错）
toolkit skills lint skills/ --base HEAD # 技能内容相对基准有变更时，版本必须已递增
toolkit skills status               # 查看技能现场状态与包内技能真源版本（缺省按现场判定作用域）
toolkit skills status --scope all   # 项目面与全局面都体检
toolkit skills status --format json # JSON 输出：scope、global / project 各自的现场报告
toolkit skills uninstall               # 卸载本包安装的技能产物（缺省按现场判定作用域；目标目录清空后一并回收）
toolkit skills uninstall --skills fxri-text-encoding # 只卸载指定技能的选择与产物（逗号分隔）
toolkit skills uninstall --scope all   # 项目面与全局面都卸载
toolkit skills uninstall --dry-run     # 卸载预演（只预览将移除的条目）
toolkit skills uninstall --format json # JSON 输出：dryRun、scope 与 global / project 各自的卸载报告
toolkit skills path                 # 输出包根路径（内含 skills/）
toolkit skills path --format json   # JSON 输出：包根、技能源目录、技能清单
```

裸 `toolkit skills` 打印本域帮助（列出全部子命令）。

## 子命令

### install

以包内 `skills/` 与 `--from` 外部来源为真源分发，只安装**本次选择集**内的技能（规则见下）。

- **全局面逐技能幂等**：指向正确跳过（含锚在 pnpm 稳定入口、内容一致的异地软链）；指向其他版本或悬空时重建；同名实体目录 / 普通文件默认跳过（`--force` 覆盖）
- **落点形态沿用既有登记**：本包以副本形式登记过的技能，裸 `install` 与 `--force` 都保持副本（`--force` 只解除冲突判定，不把副本翻回软链）
  - 未登记的同名实体目录被 `--force` 接管时，才按默认形态重建为软链
- 未安装的 agent 只报告、不凭空造目录
- `--prune` 只清理未选择（技能或目标）、本包登记且内容与真源一致的旧产物
  - 来源已无此名的条目（技能改名 / 移除）：登记为链接的按现场形态直接摘除（含悬空），副本因无从校验保留并报冲突
- **曾用名迁移**：来源声明 `previousNames` 时，旧名产物按归属清理（链接或同内容副本）并回显「已改名迁移：旧名 → 新名」
  - 仅在新名本次已新建 / 更新 / 跳过时清理；新名冲突或失败时保留旧名，沿用既有冲突 / 失败报告
  - 新名写入状态后旧名不再残留
- 项目面按[作用域与安装面](../config/skills#作用域与安装面)的副本 + 薄壳口径写入
- `--format json` 输出机器可读安装报告到 stdout（含 `dryRun` / `scope` 标记与 `selection` / `targetSelection`）
  - 各目标另含 `gates`（入口壳）与 `migrated`（旧名 → 现用名）：改名迁移已清理的旧产物记录

非交互语义（`--yes` / `--use-saved` / `--no-save-agents` 的组合结果）：

| 组合 | 技能选择 | 目标选择 | 最终确认 | 说明 |
| --- | --- | --- | --- | --- |
| 无参数（TTY） | 交互 | 交互 | 有 | ESC 逐级返回；技能页 ESC 等同取消（130） |
| `--use-saved` | 跳过 | 跳过 | 有 | 沿用已保存选择；确认「否」按成功退出 0 |
| `--yes` | 跳过 | 跳过 | 跳过 | 非交互首选；首次只装 core 与全部可用目标 |
| 非 TTY 未给 `--yes` / `--use-saved` | 跳过 | 跳过 | 无 | 按已保存选择安装 |
| `--all`（非 TTY） | 跳过 | 跳过 | 不适用 | 须显式 `--yes`，否则报错退出 1 |
| `--no-save-agents` | 不变 | 交互 | 有 | 目标选择只本次生效，不写回配置 |
| `--dry-run` | 同上 | 同上 | 有 | 只预览，不写文件 |

### status

- 文本模式先打印版本检查块（CLI 当前 / 最新、registry 与提示频率），再打印技能真源版本清单、内容闸门开关与当前选择集，最后逐目标报告
- 选择集之后单列「来源内未选择」的技能（不在选择集、也不计入问题），避免改名 / 新增后静默不可见；零选择时不打印
- **逐目标状态**：软链正常 / 软链悬空 / 软链指向其他版本 / 副本已同步 / 副本已漂移（本包登记副本与真源不一致）/
  入口壳已过期（与当前版本不一致）/ 缺失（仅指已选择但缺失）/ 同名冲突（同名非本包产物）/ 未选择但已安装（单列提示，不计入问题）
- 来源中已无此名的悬空条目（改名后未声明曾用名）：`install` 无法补齐，汇总时给出含实际名字的 `uninstall` 命令
- **健康目标折叠为一行**（`<目标>：<目录>　N 项正常`），仅含问题项或未选择产物的目标逐条展开
- 末尾汇总需处理条目并按型给出指引：缺失 / 悬空 / 指向其他版本 / 副本漂移 / 入口壳过期用 `install` 补齐，
  同名冲突用 `install --force` 覆盖，未选择但已安装的产物需要清理时用 `install --prune`
- **目标纳入口径**：主目标恒报告；内置表内的 agent 与自定义目标仅在已有本包记录或目录非空时展开（卸载后的空壳目录不占版面）
  - 状态文件登记但本次未解析到的目标（如 `--dir` 安装后不再传参、agent 目录已被移除）也补报，不静默丢弃
- **历史落点**：Codex / Pi 的升级前落点（`~/.codex/skills`、`~/.pi/agent/skills`）在状态文件有登记且目录仍在时，标注为「历史落点」并在报告末尾单列「历史落点残留」
  - 只提示不自动删除，指引用 `remove` 清理
- **疑似残留**：未在任何来源或状态登记、但指向技能源缓存（`~/.toolkit/cache/skill-sources/`）或本包技能目录的链接，单列「疑似残留（仅提示）」
  - 只报告不删除；给出含实际名字的 `uninstall` 命令
- **矩阵联动**：仅项目面评估，全局面不评估并说明
- **canonical 共读**：本机已安装且经 canonical 共读的 agent（按探测路径判定）另单列一行说明其读取主目标、无需单独写入
- 项目面按[作用域与安装面](../config/skills#作用域与安装面)节体检
- `--format json` 输出机器可读报告到 stdout（含 `scope`、`versionStatus`、`linkage`、`selection` 与 `targetSelection`）
  - 两面报告含 `skillVersions`；全局面另含 `canonicalReaders` 与 `legacyTargets`
  - 真源不可读时版本用状态登记值兜底，同名技能列入 `skillVersionsFromState`，人读视图标注「（登记值）」，不冒充当期真源版本
  - 折叠不丢信息（替代人读版），无末尾汇总行
  - ⚠️ 文本层补充视图不进 JSON：疑似残留、来源内未选择汇总、项目面旧名改名指引仅出现在人读输出
- `versionStatus` 含 `cliVersion`、`latestVersion`、`updateAvailable`、`registry: { value, source }`、`channels`
  - `sources`：来源名 / 版本 / 是否临时 / 生效频率 / 频率来源
  - 两面报告另含 `skillsOutdated`（内置技能落后清单）

### uninstall

- **全局面**先清选择 / 来源配置、再清产物、最后重写状态：只清理本包登记产物（链接摘除、副本一致才删），其余交人工确认
- 清理后目标目录若已空则**一并回收**（`--dry-run` 只预览、不动现场；目录非空或不可读时不回收）；清理干净后删除状态文件
- `--skills` 精确卸载；`--all` 全量卸载已登记产物与疑似残留（非交互须 `--yes`）；两者互斥
- 裸命令交互多选（默认全不选）；非交互报错给用法；`--dry-run` 按全量预览
- `--source` 只清指定外部来源的登记与产物
- 状态里未登记但显式点名的名字（如改名后的旧名）：只摘除「本工具形态」的同名链接（指向技能源缓存、本包技能目录或已登记来源根），其余仍交人工确认
  - 该类名字若完全未命中可清理产物，stderr 告警「未找到可清理的产物」并说明未执行删除，退出码不变
- 项目面按[作用域与安装面](../config/skills#作用域与安装面)清理归属账记载的条目
- `--format json` 输出机器可读卸载报告到 stdout（含各目标 `dirReclaimed` 回收标记与 `dryRun` / `scope` 标记）

### gate

- 无参数查看开关与接管规则（`skillsInstall.gate` 归一后的 include / exclude）
- `skills gate on|off` 只写开关配置，之后运行 `toolkit skills install` 生成入口壳或还原全文
- `--format json` 输出 `{ enabled, rules }`；非法取值报错退出 1，配置不变

### mount

- 在父目录（缺省当前目录）下扫一层仓库（`.git` / `package.json` / `.tasks`），交互多选并确认后逐仓安装；`--dry-run` 只预览
- 会向所选项目写入技能文件，确认信息写明项目数
- 由 `toolkit scope mount` 迁入（该命令已移除），统一从 skills 域使用
- 非 TTY 环境提示无法交互（退出码 `2`），批量项目安装请在终端运行

### sources

- 列出已登记永久来源与状态中的临时来源（来源名 / 根目录 / 版本 / 生效提示频率 / 技能清单，临时来源标注「临时」）
  - 技能清单里状态有登记但当前来源已无的名字标注「（已失效）」；`--format json` 的 `skills` 数组保持原样，不加标记
- `sources notify <name> --frequency <always|daily|weekly|off>`：写单个来源的提示频率
  - 默认写全局层；`--scope project` 或等价的 `--layer project` 写项目层并向上找 git 根，非 git 仓库报错
  - 此处 `--scope` 指**配置层**，与安装面的 `--scope`（project / global / all）不同；两者冲突时报错
- `sources refresh [name]`：刷新来源缓存与版本，只更新元数据、不自动安装；`--dry-run` 只列出将刷新的来源
- `sources remove <name>`：注销登记（产物与状态保留）；加 `--prune` 一并清理产物、状态与提示配置
- `--format json` 输出机器可读清单与刷新报告

### lint

只读校验，可对技能目录运行；规则、预算、`--base` 递增与退出码见[技能校验](./skills-lint)。

### bump

递增版本声明；`--dir` 多根、`--from` 处理不一致。详见[技能版本递增](./skills-bump)。

### path

输出包根（内含 `skills/`），便于委托上游安装器安装到内置表未收录的 agent；`--format json` 输出包根、技能源目录与清单。

各子命令的 `--format json` 输出统一携带 `schemaVersion: 1` 锚点（与 `tasks export` 同口径）。

| 子命令 | 额外字段 |
| --- | --- |
| `install` / `status` / `uninstall` | `scope`（本次实际作用域）、`dryRun`（区分预演与实跑）；报告主体按 `global` / `project` 分面承载，未执行的面为 `null` |
| `install` / `status` | `mode`（当前安装模式）、`selection`（技能选择集）、`targetSelection`（目标选择集） |
| `status` | 两面报告另含 `skillVersions`（各技能真源版本，用于与会话上下文中已加载的技能内容对照）与 `skillVersionsFromState`（版本取自状态登记的技能名） |
| `status` | `linkage` 为矩阵联动结论，全局面为 `null`，与文本提示同口径 |

## 技能选择

技能按 `SKILL.md` frontmatter 的 `metadata.tier` 分层，缺省按 `optional` 处理。

- `skills` 模式（默认）：`core` 必装、不可取消，`optional` 安装时可选
- `package` 模式（纯包管理器）：全部技能均可选、允许零选择

当前层级分布：

- `core`：`fxri-plan-to-task`、`fxri-session-recap`、`fxri-plan-review`
- `optional`：`fxri-release-changelog`、`fxri-text-encoding`、`fxri-skill-authoring`

模式优先级：`--mode package|skills` 先切换并持久化，再按新模式重建基线（`package` 为空、`skills` 为 `core`），不沿用旧模式的保存选择。

`--no-skills` 仅本次零装，不改模式与已保存选择，且与 `--skills` / `--all` / `--no-optional` / `--mode` 互斥。

选择优先级（从高到低）：

1. `--skills <names>`：只装指定技能（逗号分隔）；`skills` 模式下 `core` 技能恒装
   - 包内不存在的名称告警后剔除，全部非法时报错退出（退出码 1）
2. `--all`：安装全部技能；`--no-optional`：只装 `core` 技能
3. TTY 交互：未传上述参数且未传 `--yes` 时，以方向键多选列出技能
   - `skills` 模式下 `core` 已选中且不可取消；`package` 模式下全部默认不选、`core` 可取消
   - `Enter` 确认、`Ctrl+C` 取消（取消时不写任何文件，退出码 130）；技能选择页按 ESC 等同取消，目标页与确认页按 ESC 逐级返回
4. 已保存选择：非 TTY 或传入 `--yes` 时按保存的选择回显（非交互不进入任何提示）
   - 全局层读 `~/.toolkitrc.json` 的 `skillsInstall.selection`；项目层读 `.toolkitrc.json` 的 `projectSkills.selection`
   - 保存名单里的曾用名（来源声明的 `previousNames`）会迁移为现用名后再回显
   - 某个来源的整份名单都已不存在（来源整体改名 / 重构）时，按默认口径重算：内置源取 `core`、外部来源取全部，并向 stderr 告警一次
   - 只有部分名字失效时只剔除失效项并告警，新增技能不自动补选（避免来源往用户环境塞技能）
5. 首次（无保存选择）：`skills` 模式只装 `core` 技能；`package` 模式零装

选择集在安装成功后写回对应层配置（`--dry-run` 不写），项目面与全局面各自独立。
某个来源本次零装时不写空数组（空名单会被当成「该来源一个都不选」），改按未保存处理，避免一次性的名单失效被固化成永久排除。

`SKILL.md` frontmatter `metadata.requires` 声明的依赖会自动补全：选择带依赖的技能时一并安装其依赖（可递归）；依赖缺失时告警并跳过该依赖，不阻断其余技能。

## 目标选择

技能选择之后是目标选择：全局面选 agent 目录，项目面选已存在的候选薄壳目录。
优先级、交互流程、长期选择写回与取消目标口径见[配置参考 · 安装目标选择](../config/skills#安装目标选择)。

## 外部来源

`--from <path|url>` 把本地目录或 Git 远程地址纳入同一套 tier / 选择 / 状态 / prune 管理；
来源格式、曾用名、永久登记与安装锁见[技能来源](./skills-sources)。

## 作用域

`install` / `status` / `remove` 三子命令均支持 `--scope <project|global|all>`，缺省按现场自动判定；
安装面判定、项目面归属账与逐技能状态见[配置参考 · 作用域与安装面](../config/skills#作用域与安装面)。

## 策略与内容闸门

- 内容闸门只决定正文由 `scope guard` 下发还是全文安装；策略（`scope policy` / `scope skills`）决定哪些技能 / 目录被允许
- 矩阵已配置但 `skillsInstall.gate` 未开启时，`skills status` / `scope status` / `scope skills list` 提示「矩阵已配置，但正文仍全量加载」
- 闸门规则排除该技能或技能声明 `metadata.gate: false` 时，策略不会生效，提示「策略无效：技能仍全文加载」
- 已安装但当前目录矩阵未允许的技能单列提示，不自动删除；确认不需要时用 `skills uninstall` 清理
- 项目面安装（`install --scope project`）提供更硬的边界；策略与闸门只影响正文读取，不改变安装产物
- 策略字段、优先级与子目录口径见[作用域（activation）](../config/activation)

## 相关页面

- 参考：[完整攻略 · AI 技能包](../guide#ai-技能包-skills) · [技能来源](./skills-sources) · [配置参考 · skills](../config/skills)
