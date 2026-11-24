---
title: 技能分发（skill）
---

# 技能分发（skill）

> 把包内技能分发到各 agent，并管理来源、目标与版本。

```bash
toolkit skill install                       # 安装包内技能（缺省按现场判定作用域）
toolkit skill install --scope project       # 仅项目面：真源副本 + 候选目录薄壳
toolkit skill install --scope global        # 仅全局面：软链 / 副本到 agent 目录
toolkit skill install --scope all           # 项目面 + 全局面都执行
toolkit skill install --skills fxri-plan-task,fxri-code-encoding # 只装指定技能（core 恒装）
toolkit skill install --all                 # 安装全部技能（含可选技能）
toolkit skill install --no-optional         # 只装 core 技能
toolkit skill install --yes                 # 非交互：跳过选择与确认，采用已保存选择
toolkit skill install --use-saved           # 跳过选择交互，仍保留最终确认
toolkit skill install --agent claude-code,canonical # 只写指定 agent（canonical 为主目标）
toolkit skill install --all-agents          # 写入全部已检测的 agent
toolkit skill install --no-save-agents      # 目标选择只对本次生效，不写回配置
toolkit skill install --prune               # 清理未选择且与真源一致的旧产物
toolkit skill install --check               # 只报告待收敛项：有漂移时退出码 1（CI 门禁）
toolkit skill install --scope project --refresh # 只刷新已存在的项目面产物（prepare 钩子口径）
toolkit skill install --mode package        # 纯包管理器模式：core 也可不装，允许零选
toolkit skill install --no-skills           # 仅本次零装，不改模式与已保存选择
toolkit skill install --gate                # 内容闸门：本次全部技能写入口壳，--embed 回退
toolkit config get skillDelivery.default    # 查看默认分发形态
toolkit config set skillDelivery.default gated # 切换为入口壳（full 回退全文，不覆盖 rules）
toolkit skill mount --dry-run               # 批量挂载：预览将写入的项目（由 scope mount 迁入，原命令已移除）
toolkit skill install --copy                # 强制副本（仅全局面；入口壳形态的技能仍写壳并告警）
toolkit skill install --dry-run             # 预演：输出分发计划，不写文件
toolkit skill install --force               # 覆盖同名非本包产物（默认跳过；不改已登记副本形态）
toolkit skill install --dir <path>          # 额外目标目录（可多次；全局面兜底未收录 agent，项目面须在仓库内）
toolkit skill install --source <name|path>  # 外部来源（已登记名 / 目录 / Git 地址；只写本次，可重复）
toolkit skill install --source https://github.com/fxri-net/playbook#vX.Y.Z --save play # 远程永久来源
toolkit skill uninstall --source play        # 只清理指定外部来源的登记与产物
toolkit skill source                         # 列出外部来源、版本与生效的更新提示频率（内置源不在列表内）
toolkit skill source notify play --frequency daily # 设置单个来源的提示频率（--scope global|project）
toolkit skill source refresh                 # 刷新全部外部来源缓存与版本（--dry-run 列出将刷新来源与当前版本，不联网）
toolkit skill source remove play --prune     # 注销来源登记并清理其产物、状态与提示配置
toolkit skill bump fxri-plan-task patch      # 递增技能版本（frontmatter 与正文首部两处同源改写）
toolkit skill bump --all --dry-run           # 预演批量递增全部技能，只打印 from → to
toolkit skill bump --all minor --yes         # 批量递增（非交互须 --yes）
toolkit skill bump fxri-plan-review --set 2.0.0 # 直接设定版本（与递增类型互斥）
toolkit skill bump --dir skills --all patch  # 外部仓：对指定技能目录批量递增
toolkit skill lint                           # 校验本包 skills/（150 行 / 8000 字符告警，200 行 / 12000 字符报错）
toolkit skill lint skills/ --base HEAD       # 技能内容相对基准有变更时，版本必须已递增
toolkit skill status                         # 查看技能现场状态与包内技能真源版本（缺省按现场判定作用域）
toolkit skill status --scope all             # 项目面与全局面都体检
toolkit skill status --format json           # JSON 输出：scope、global / project 各自的现场报告
toolkit skill status --explain fxri-plan-task # 解释该技能的分发形态推导过程
toolkit skill uninstall                      # 卸载本包安装的技能产物（缺省按现场判定作用域；目标目录清空后一并回收）
toolkit skill uninstall --skills fxri-code-encoding # 只卸载指定技能的选择与产物（逗号分隔）
toolkit skill uninstall --scope all          # 项目面与全局面都卸载
toolkit skill uninstall --dry-run            # 卸载预演（只预览将移除的条目）
toolkit skill uninstall --format json        # JSON 输出：dryRun、scope 与 global / project 各自的卸载报告
toolkit skill status --path                  # 输出包根路径（内含 skills/）
toolkit skill status --path --format json    # JSON 输出：包根、技能源目录、技能清单
toolkit skill list                           # 已装技能的名称 / 简介 / 版本 / 形态
toolkit skill list --all                     # 含包内未安装技能（形态位显示「未安装」）
toolkit skill list --format json             # JSON 输出：逐技能条目
```

裸 `toolkit skill` 打印本域帮助（列出全部子命令）。

## 子命令

### install

以包内 `skills/` 与 `--source` 外部来源为真源分发，只安装**本次选择集**内的技能（规则见下）。

- **全局面逐技能幂等**：指向正确跳过（含锚在 pnpm 稳定入口、内容一致的异地软链）；指向其他版本或悬空时重建；同名实体目录 / 普通文件默认跳过（`--force` 覆盖）
- **落点形态沿用既有登记**：本包以副本形式登记过的技能，裸 `install` 与 `--force` 都保持副本（`--force` 只解除冲突判定，不把副本翻回软链）
  - 未登记的同名实体目录被 `--force` 接管时，才按默认形态重建为软链
- 未安装的 agent 只报告、不凭空造目录
- `--prune` 只清理未选择（技能或目标）、本包登记且内容与真源一致的旧产物
  - 来源已无此名的条目（技能改名 / 移除）：登记为链接的按现场形态直接摘除（含悬空），副本因无从校验保留并报冲突
- **曾用名迁移**：来源声明 `previousNames` 时，旧名产物按归属清理（链接或同内容副本）并回显「已改名迁移：旧名 → 新名」
  - 仅在新名本次已新建 / 更新 / 跳过时清理；新名冲突或失败时保留旧名，沿用既有冲突 / 失败报告
  - 新名写入状态后旧名不再残留
- **分发形态**：按 [`skillDelivery`](../config/skill#skilldelivery-技能分发形态) 推导，`gated` 只写入口壳、`off` 不写产物（残留由 `--prune` 清理）
  - 策略规则里显式写的 `delivery` 优先于名单推导（见[作用域策略](../config/activation#策略规则)）
  - `--gate` / `--embed` 为本次显式取值，成功后写 `skillDelivery.default`；项目面同样生效
- 项目面按[作用域与安装面](../config/skill#作用域与安装面)的副本 + 薄壳口径写入；`gated` 技能的候选目录落入口壳，真源副本保留供 guard 读取正文
- **输出节奏**：动作前一行写清作用层（全局层 / 项目层）；动作中按目标逐项列出新建 / 重建 / 跳过 / 清理 / 失败；
  动作后汇总「完成 / 跳过 / 失败」，有失败时给出重试命令
- `--dry-run` 只输出分发计划（标明全局层 / 项目层），不写文件
- `--check` 只报告待收敛项，有漂移时退出码 1；不进入交互
- `--refresh` 只收敛已存在的项目面产物，不新增技能、不改选择集；不进入交互，非 TTY / CI 只打印漂移
- `skill reconcile`：按当前配置把已装产物的形态对齐到矩阵，不改选择集、不新增技能；
  `--scope project|global|all`、`--skills`、`--dry-run` 可选，零差异时报「产物已一致」，未收敛条目非 0 退出
- `skill status --matrix [--at <目录>] [--format json]`：逐技能列出产物形态、当前目录形态、命中规则的策略 id 与条件；
  末尾附旧配置迁移提示。JSON 的 `data` 为 `at` / `matrix` / `migrationHints`
- **技能多选展示**：按「包内 · 必装 / 包内 · 可选 / 各外部来源名」分组并插入分隔行，组内按技能名升序；
  每项在名称后跟暗色单行简介（`SKILL.md` 的 `description` 首句，按终端列数并扣除勾选符与禁用原因宽度后截断），非 TTY 不展示；
  提交后的答案行只保留技能名，简介不进入答案；
  `--mode package` 下包内合并为「包内」一组、core 也可取消，选择语义不变
- `--format json` 输出机器可读安装报告到 stdout（含 `dryRun` / `scope` 标记与 `selection` / `targetSelection`）
  - 预演键为 `plan` / `project`；`--check` / `--refresh` 为 `plans` 数组
  - 各目标另含 `gates`（入口壳）与 `migrated`（旧名 → 现用名）：改名迁移已清理的旧产物记录

非交互语义（`--yes` / `--use-saved` / `--no-save-agents` 的组合结果）：

| 组合 | 技能选择 | 目标选择 | 最终确认 | 说明 |
| --- | --- | --- | --- | --- |
| 无参数（TTY） | 交互 | 交互 | 有 | ESC 逐级返回；技能页 ESC 等同取消 |
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
  入口壳已过期（与当前版本不一致）/ 形态不符（现场产物与目标分发形态不一致）/ 缺失（仅指已选择但缺失）/
  同名冲突（同名非本包产物）/ 未选择但已安装（单列提示，不计入问题）/ 残留（目标形态为 `off`，用 `install --prune` 清理）
- **分发形态**：按 `skillDelivery` 推导；`off` 的技能不参与缺失统计，其既有产物单列残留
- 来源中已无此名的悬空条目（改名后未声明曾用名）：`install` 无法补齐，汇总时给出含实际名字的 `uninstall` 命令
- **健康目标折叠为一行**（`<目标>：<目录>　N 项正常`），仅含问题项或未选择产物的目标逐条展开
- 末尾汇总需处理条目并按型给出指引：缺失 / 悬空 / 指向其他版本 / 副本漂移 / 入口壳过期用 `install` 补齐，
  同名冲突用 `install --force` 覆盖，未选择但已安装的产物需要清理时用 `install --prune`
- **目标纳入口径**：主目标恒报告；内置表内的 agent 与自定义目标仅在已有本包记录或目录非空时展开（卸载后的空壳目录不占版面）
  - 状态文件登记但本次未解析到的目标（如 `--dir` 安装后不再传参、agent 目录已被移除）也补报，不静默丢弃
- **历史落点**：Codex / Pi 的升级前落点（`~/.codex/skills`、`~/.pi/agent/skills`）在状态文件有登记且目录仍在时，标注为「历史落点」并在报告末尾单列「历史落点残留」
  - 只提示不自动删除，指引用 `uninstall --skills` 清理
- **疑似残留**：未在任何来源或状态登记、但指向技能源缓存（`~/.toolkit/cache/skill-sources/`）或本包技能目录的链接，单列「疑似残留（仅提示）」
  - 只报告不删除；给出含实际名字的 `uninstall` 命令
- **矩阵联动**：仅项目面评估，全局面不评估并说明；矩阵限制的技能已按策略推导自动进入入口壳
- **推导解释**：`status --explain <技能>` 逐级打印各层命中与被压规则，文本与 JSON 同源
- **待收敛**：汇总可由 `install` 修复的偏差（含来源不可解析条目）；JSON 带 `pending` 数组
- **canonical 共读**：本机已安装且经 canonical 共读的 agent（按探测路径判定）另单列一行说明其读取主目标、无需单独写入
- 项目面按[作用域与安装面](../config/skill#作用域与安装面)节体检
- `--format json` 输出机器可读报告到 stdout（含 `scope`、`versionStatus`、`linkage`、`selection` 与 `targetSelection`）
  - 两面报告含 `skillVersions`；全局面另含 `canonicalReaders` 与 `legacyTargets`
  - `gate` / `gateRules` 为旧键兼容字段，新消费方用 `delivery` 与 `pending`
  - 真源不可读时版本用状态登记值兜底，同名技能列入 `skillVersionsFromState`，人读视图标注「（登记值）」，不冒充当期真源版本
  - 折叠不丢信息（替代人读版），无末尾汇总行
  - ⚠️ 文本层补充视图不进 JSON：疑似残留、来源内未选择汇总、项目面旧名改名指引仅出现在人读输出
- `versionStatus` 含 `cliVersion`、`latestVersion`、`updateAvailable`、`registry: { value, source }`、`channels`
  - `sources`：来源名 / 版本 / 是否临时 / 生效频率 / 频率来源
  - 两面报告另含 `skillsOutdated`（内置技能落后清单）

### list

- 默认只列已装技能，每行「名称 · 简介 · 版本 · 形态」；`--all` 补上包内未安装技能，其形态位显示「未安装」
- 简介取 `SKILL.md` 的 `description` 首句并按终端宽度截断；来源不可解析时用状态文件登记的 `summary` 兜底，仍缺失显示 `—`
- 已装条目的形态按当前配置推导（与 `install` 同口径：全文安装 / 入口壳 / 不安装）；文本行不展示目标目录数，目录分布看 `skill status`
- 只读命令，不改配置与产物；目录级形态排查仍走 `skill status --matrix`
- `--format json` 的 `data` 为 `all` 与 `skills`（逐条 `name` / `summary` / `version` / `form` / `targets` / `installed`）
  - `form` 恒为分发形态推导值，是否已装看 `installed`；未安装条目 `targets` 为 0，`form` 仍按配置给出形态（含「不安装」）
  - `targets` 为已写入的目标目录数（仅 JSON 提供，文本行不展示）；文本层才以「未安装」替代形态位，脚本筛选未装技能请用 `installed === false`

### uninstall

- **全局面**先清选择 / 来源配置、再清产物、最后重写状态：只清理本包登记产物（链接摘除、副本一致才删），其余交人工确认
- 清理后目标目录若已空则**一并回收**（`--dry-run` 只预览、不动现场；目录非空或不可读时不回收）；清理干净后删除状态文件
- `--skills` 精确卸载；`--all` 全量卸载已登记产物与疑似残留（非交互须 `--yes`）；两者互斥
- 裸命令交互多选（默认全不选）；非交互报错给用法；`--dry-run` 按全量预览
  - 候选按「全局 / 项目 / 疑似残留」分组（多组时插入分隔行），行内为名称 + 暗色单行简介（真源 `description`，缺省用状态 `summary`）
  - 提交后的答案行显示「面｜名称」，不含简介，跨面同名仍可区分
- `--source` 只清指定外部来源的登记与产物
- 状态里未登记但显式点名的名字（如改名后的旧名）：只摘除「本工具形态」的同名链接（指向技能源缓存、本包技能目录或已登记来源根），其余仍交人工确认
  - 该类名字若完全未命中可清理产物，stderr 告警「未找到可清理的产物」并说明未执行删除，退出码不变
- 项目面按[作用域与安装面](../config/skill#作用域与安装面)清理归属账记载的条目
- `--format json` 输出机器可读卸载报告到 stdout（含各目标 `dirReclaimed` 回收标记与 `dryRun` / `scope` 标记）

### 分发形态（config）

- `config get|set skillDelivery.default` 读写默认形态（取值为 `full` / `gated` / `off`），不覆盖 `rules`

### mount

- 在父目录（缺省当前目录）下扫一层仓库（`.git` / `package.json` / `.tasks`），交互多选并确认后逐仓安装；`--dry-run` 只预览
- 会向所选项目写入技能文件，确认信息写明项目数
- 由 `toolkit scope mount` 迁入（该命令已移除），统一从 skill 域使用
- 非 TTY 环境提示无法交互（无交互退出码，见[退出码](./exit-codes)），批量项目安装请在终端运行

### source

- 列出已登记永久来源与状态中的临时来源（来源名 / 根目录 / 版本 / 生效提示频率 / 技能清单，临时来源标注「临时」）
  - 技能清单里状态有登记但当前来源已无的名字标注「（已失效）」；`--format json` 的 `skills` 数组保持原样，不加标记
- `source notify <name> --frequency <always|daily|weekly|off>`：写单个来源的提示频率
  - 默认写全局层；`--scope project` 或等价的 `--layer project` 写项目层并向上找 git 根，非 git 仓库报错
  - 此处 `--scope` 指**配置层**，与安装面的 `--scope`（project / global / all）不同；两者冲突时报错
- `source refresh [name]`：刷新来源缓存与版本，只更新元数据、不自动安装；`--dry-run` 只列出将刷新的来源
- `source remove <name>`：注销登记（产物与状态保留）；加 `--prune` 一并清理产物、状态与提示配置
- `--format json` 输出机器可读清单与刷新报告

### lint

只读校验，可对技能目录运行；规则、预算、`--base` 递增与退出码见[技能校验](./skill-lint)。

### bump

递增版本声明；`--dir` 多根、`--from` 处理不一致。详见[技能版本递增](./skill-bump)。

### status --path

`toolkit skill status --path` 输出包根（内含 `skills/`）与 JSON 清单，便于委托上游安装器。

`--format json` 走统一信封（字段见[输出约定](../cli#输出约定)），下表字段位于 `data`，
检查问题同时映射到顶层 `issues`。

| 子命令 | 额外字段 |
| --- | --- |
| `install` / `status` / `uninstall` | `scope`（本次实际作用域）、`dryRun`（区分预演与实跑）；报告主体按 `global` / `project` 分面承载，未执行的面为 `null` |
| `install` / `status` | `mode`（当前安装模式）、`selection`（技能选择集）、`targetSelection`（目标选择集） |
| `status` | 两面报告另含 `skillVersions`（各技能真源版本）与 `skillVersionsFromState` |
| `status` | `linkage` 为矩阵联动结论，全局面为 `null`，与文本提示同口径 |
| `list` | `all`（是否含未安装）、`skills`（逐条 `name` / `summary` / `version` / `form` / `targets` / `installed`） |

## 技能选择

技能按 `SKILL.md` frontmatter 的 `metadata.tier` 分层，缺省按 `optional` 处理。

- `skills` 模式（默认）：`core` 必装、不可取消，`optional` 安装时可选
- `package` 模式（纯包管理器）：全部技能均可选、允许零选择

当前层级分布：

- `core`：`fxri-plan-task`、`fxri-plan-recap`、`fxri-plan-review`
- `optional`：`fxri-release-changelog`、`fxri-code-encoding`、`fxri-writing-skill`、`fxri-writing-docs`

模式优先级：`--mode package|skills` 先切换并持久化，再按新模式重建基线（`package` 为空、`skills` 为 `core`），不沿用旧模式的保存选择。

`--no-skills` 仅本次零装，不改模式与已保存选择，且与 `--skills` / `--all` / `--no-optional` / `--mode` 互斥。

选择优先级（从高到低）：

1. `--skills <names>`：只装指定技能（逗号分隔）；`skills` 模式下 `core` 技能恒装
   - 包内不存在的名称告警后剔除，全部非法时报错退出（退出码 1）
2. `--all`：安装全部技能；`--no-optional`：只装 `core` 技能
3. TTY 交互：未传上述参数且未传 `--yes` 时，以方向键多选列出技能（core 组在前，组内按名称升序）
   - `skills` 模式下 `core` 已选中且不可取消；`package` 模式下全部默认不选、`core` 可取消
   - `Enter` 确认、`Ctrl+C` 取消（取消时不写任何文件，按取消退出码结束）；技能选择页按 ESC 等同取消，目标页与确认页按 ESC 逐级返回
4. 已保存选择：非 TTY 或传入 `--yes` 时按保存的选择回显（非交互不进入任何提示）
   - 全局层读 `~/.toolkitrc.json` 的 `skillInstall.selection`；项目层读 `.toolkitrc.json` 的 `projectSkill.selection`
   - 保存名单里的曾用名（来源声明的 `previousNames`）会迁移为现用名后再回显
   - 某个来源的整份名单都已不存在（来源整体改名 / 重构）时，按默认口径重算：内置源取 `core`、外部来源取全部，并向 stderr 告警一次
   - 只有部分名字失效时只剔除失效项并告警，新增技能不自动补选（避免来源往用户环境塞技能）
5. 首次（无保存选择）：`skills` 模式只装 `core` 技能；`package` 模式零装

选择集在安装成功后写回对应层配置（`--dry-run` 不写），项目面与全局面各自独立。
某个来源本次零装时不写空数组（空名单会被当成「该来源一个都不选」），改按未保存处理，避免一次性的名单失效被固化成永久排除。

`SKILL.md` frontmatter `metadata.requires` 声明的依赖会自动补全：选择带依赖的技能时一并安装其依赖（可递归）；依赖缺失时告警并跳过该依赖，不阻断其余技能。

## 分发目标与来源

- **目标选择**：技能选择之后是目标选择——全局面选 agent 目录，项目面选已存在的候选薄壳目录；
  优先级、交互流程、长期选择写回与取消目标口径见[配置参考 · 安装目标选择](../config/skill#安装目标选择)。
- **外部来源**：`--source <name|path>` 把已登记来源名、本地目录或 Git 远程地址纳入同一套 tier / 选择 / 状态 / prune 管理；
  来源格式、曾用名、永久登记与安装锁见[技能来源](./skill-sources)。
- **作用域**：`install` / `status` / `uninstall` 三子命令均支持 `--scope <project|global|all>`，缺省按现场自动判定；
  安装面判定、项目面归属账与逐技能状态见[配置参考 · 作用域与安装面](../config/skill#作用域与安装面)。

## 策略与内容闸门

- 策略（`scope allow` / `deny` 带条件选项时）直接决定技能分发形态：带条件限制 → 入口壳，无条件拒绝 → 不安装，无需手动开闸门；
  名单配置的兜底拒绝属于目录 / 技能名单的补集，按带条件限制算入口壳
- 矩阵限制的技能由 `install` 自动生成入口壳，`skill install --dry-run` 可预览；显式 `skillDelivery.rules` 仍可覆盖推导
- 显式规则把被拒技能钉成全文时，提示「策略对该技能无效：已显式设为全文安装」；旧键 `skillInstall.gate` / `metadata.gate` 仍读时兼容
- 已安装但当前目录矩阵未允许的技能单列提示，不自动删除；确认不需要时用 `skill uninstall` 清理
- 项目面安装（`install --scope project`）提供更硬的边界；策略与闸门只影响正文读取，不改变安装产物
- 策略字段、优先级与子目录口径见[作用域配置（activation / policies）](../config/activation)

## 相关页面

- 参考：[完整攻略 · AI 技能包](../guide#ai-技能包-skills) · [技能来源](./skill-sources) · [配置参考 · 技能分发偏好](../config/skill)
