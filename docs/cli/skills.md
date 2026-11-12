---
title: skills（技能分发）
---

# skills（技能分发）

> 把包内技能分发到各 agent，并管理来源、目标与版本。

```bash
toolkit skills install              # 安装包内技能（缺省按现场判定作用域：仓库内写项目面，否则写全局目录）
toolkit skills install --scope project # 仅项目面：仓库内唯一真源副本 + 各候选目录薄壳
toolkit skills install --scope global  # 仅全局面：软链 / 副本到各 agent 全局技能目录
toolkit skills install --scope all     # 项目面 + 全局面都执行
toolkit skills install --skills fxri-plan-to-task,fxri-text-encoding # 只装指定技能（skills 模式下 core 恒装，逗号分隔）
toolkit skills install --all        # 安装全部技能（含可选技能）
toolkit skills install --no-optional # 只装 core 技能
toolkit skills install --yes        # 非交互执行：跳过选择与确认，采用已保存选择（首次按模式默认：skills 装 core、package 零装）
toolkit skills install --use-saved # 技能与目标采用已保存选择，不进入选择交互（仍保留最终确认）
toolkit skills install --agent claude-code,canonical # 只写指定 agent（逗号分隔；canonical 为主目标）
toolkit skills install --all-agents # 写入全部已检测的 agent
toolkit skills install --no-save-agents # 目标选择只对本次生效，不写回配置
toolkit skills install --prune      # 清理未选择且内容与本包真源一致的旧产物
toolkit skills install --mode package # 纯包管理器模式：core 也可不装，允许零选
toolkit skills install --no-skills  # 仅本次零装，不改模式与已保存选择
toolkit skills install --copy       # 强制副本形式（仅全局面生效；项目面真源恒为副本、薄壳非副本，忽略并告警）
toolkit skills install --dry-run    # 预演：只预览将执行的动作，不写文件
toolkit skills install --force      # 覆盖同名非本包产物（默认跳过，避免破坏用户自装技能；不改本包已登记副本的形态）
toolkit skills install --dir <path> # 额外目标目录（可多次指定；全局面兜底内置表未收录的 agent，项目面须落在仓库内）
toolkit skills install --from <path|url> # 临时外部来源（本地目录或 Git 地址；副本写入，只写本次，不登记配置；可重复）
toolkit skills install --from https://github.com/fxri-net/playbook#vX.Y.Z --save play # 远程永久来源（标签以来源仓 Releases 为准）
toolkit skills uninstall --source play # 只清理指定外部来源的登记与产物
toolkit skills sources               # 列出外部来源、版本与生效的更新提示频率（内置源不在列表内）
toolkit skills sources notify play --frequency daily # 设置单个来源的提示频率（--scope global|project）
toolkit skills sources refresh       # 刷新全部外部来源缓存与版本（--dry-run 列出将刷新来源与当前版本，不联网）
toolkit skills sources remove play --prune # 注销来源登记并清理其产物、状态与提示配置
toolkit skills bump fxri-plan-to-task patch # 递增技能版本（frontmatter 与正文首部两处同源改写）
toolkit skills bump --all --dry-run      # 预演批量递增全部技能，只打印 from → to
toolkit skills bump --all minor --yes    # 批量抬 minor（非交互环境须显式 --yes）
toolkit skills bump fxri-plan-review --set 2.0.0 # 直接设定版本（与递增类型互斥）
toolkit skills install --format json # JSON 输出：dryRun、scope 与 global / project 各自的安装报告
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
- **曾用名迁移**：来源声明 `previousNames` 时，旧名产物按归属清理（链接或同内容副本）并回显「已改名迁移：旧名 → 新名」；新名建立后写入状态，旧名不再残留
- 项目面按「作用域」节的副本 + 薄壳口径写入
- `--format json` 输出机器可读安装报告到 stdout（含 `dryRun` / `scope` 标记与 `selection` / `targetSelection`）
  - 各目标另含 `migrated`（旧名 → 现用名）：改名迁移已清理的旧产物记录

### status

- 文本模式先打印版本检查块（CLI 当前 / 最新、registry 与提示频率），再打印技能真源版本清单与当前选择集，最后逐目标报告
- 选择集之后单列「来源内未选择」的技能（不在选择集、也不计入问题），避免改名 / 新增后静默不可见；零选择时不打印
- **逐目标状态**：软链正常 / 软链悬空 / 软链指向其他版本 / 副本已同步 / 副本已漂移（本包登记副本与真源不一致）/ 缺失（仅指已选择但缺失）/ 同名冲突（同名非本包产物）/ 未选择但已安装（单列提示，不计入问题）
- 来源中已无此名的悬空条目（改名后未声明曾用名）单独标注处理方式：`install` 无法补齐，按名字用 `uninstall --skills <名字>` 清理
- **健康目标折叠为一行**（`<目标>：<目录>　N 项正常`），仅含问题项或未选择产物的目标逐条展开
- 末尾汇总需处理条目并按型给出指引：缺失 / 悬空 / 指向其他版本 / 副本漂移用 `install` 补齐，同名冲突用 `install --force` 覆盖，未选择但已安装的产物需要清理时用 `install --prune`
- **目标纳入口径**：主目标恒报告；内置表内的 agent 与自定义目标仅在已有本包记录或目录非空时展开（卸载后的空壳目录不占版面）
  - 状态文件登记但本次未解析到的目标（如 `--dir` 安装后不再传参、agent 目录已被移除）也补报，不静默丢弃
- **历史落点**：Codex / Pi 的升级前落点（`~/.codex/skills`、`~/.pi/agent/skills`）在状态文件有登记且目录仍在时，标注为「历史落点」并在报告末尾单列「历史落点残留」
  - 只提示不自动删除，指引用 `remove` 清理
- **疑似残留**：未在任何来源或状态登记、但指向技能源缓存（`~/.toolkit/cache/skill-sources/`）或本包技能目录的链接，单列「疑似残留（仅提示）」
  - 同样只报告不删除，确认不再需要时按名字显式 `uninstall --skills <名字>`
- **canonical 共读**：本机已安装且经 canonical 共读的 agent（按探测路径判定）另单列一行说明其读取主目标、无需单独写入
- 项目面按「作用域」节体检
- `--format json` 输出机器可读报告到 stdout（含 `scope`、`versionStatus`、`selection` 与 `targetSelection`）
  - 两面报告含 `skillVersions`；全局面另含 `canonicalReaders` 与 `legacyTargets`
  - 真源不可读时版本用状态登记值兜底，同名技能列入 `skillVersionsFromState`，人读视图标注「（登记值）」，不冒充当期真源版本
  - 折叠不丢信息（替代人读版），无末尾汇总行
  - ⚠️ 文本层补充视图不进 JSON：疑似残留、来源内未选择汇总、项目面旧名改名指引仅出现在人读输出
- `versionStatus` 含 `cliVersion`、`latestVersion`、`updateAvailable`、`registry: { value, source }`、`channels`
  - `sources`：来源名 / 版本 / 是否临时 / 生效频率 / 频率来源
  - 两面报告另含 `skillsOutdated`（内置技能落后清单）

### remove

- **全局面**先清选择 / 来源配置、再清产物、最后重写状态：只清理状态文件记载的本包产物——链接（含悬空）摘除，副本内容与真源一致才删，其余交人工确认
- 清理后目标目录若已空则**一并回收**（`--dry-run` 只预览、不动现场；目录非空或不可读时不回收）；清理干净后删除状态文件
- `--skills` 只清指定技能的选择与产物，省略时清空全部；`--source` 只清指定外部来源的登记与产物
- 状态里未登记但显式点名的名字（如改名后的旧名）：只摘除「本工具形态」的同名链接（指向技能源缓存、本包技能目录或已登记来源根），其余仍交人工确认
- 项目面按「作用域」节清理归属账记载的条目
- `--format json` 输出机器可读卸载报告到 stdout（含各目标 `dirReclaimed` 回收标记与 `dryRun` / `scope` 标记）

### sources

- 列出已登记永久来源与状态中的临时来源（来源名 / 根目录 / 版本 / 生效提示频率 / 技能清单，临时来源标注「临时」）
- `sources notify <name> --frequency <always|daily|weekly|off>`：写单个来源的提示频率
  - 默认写全局层；`--scope project` 写项目层并向上找 git 根，非 git 仓库报错
- `sources refresh [name]`：刷新来源缓存与版本，只更新元数据、不自动安装；`--dry-run` 只列出将刷新的来源
- `sources remove <name>`：注销登记（产物与状态保留）；加 `--prune` 一并清理产物、状态与提示配置
- `--format json` 输出机器可读清单与刷新报告

### path

输出包根（内含 `skills/`），便于委托上游安装器安装到内置表未收录的 agent；`--format json` 输出包根、技能源目录与清单。

各子命令的 `--format json` 输出统一携带 `schemaVersion: 1` 锚点（与 `tasks export` 同口径）。

| 子命令 | 额外字段 |
| --- | --- |
| `install` / `status` / `uninstall` | `scope`（本次实际作用域）、`dryRun`（区分预演与实跑）；报告主体按 `global` / `project` 分面承载，未执行的面为 `null` |
| `install` / `status` | `mode`（当前安装模式）、`selection`（技能选择集）、`targetSelection`（目标选择集） |
| `status` | 两面报告另含 `skillVersions`（各技能真源版本，用于与会话上下文中已加载的技能内容对照）与 `skillVersionsFromState`（版本取自状态登记的技能名） |

## 技能选择

技能按 `SKILL.md` frontmatter 的 `metadata.tier` 分层，缺省按 `optional` 处理。

- `skills` 模式（默认）：`core` 必装、不可取消，`optional` 安装时可选
- `package` 模式（纯包管理器）：全部技能均可选、允许零选择

当前层级分布：

- `core`：`fxri-plan-to-task`、`fxri-session-recap`、`fxri-plan-review`
- `optional`：`fxri-release-changelog`、`fxri-text-encoding`

模式优先级：`--mode package|skills` 先切换并持久化，再按新模式重建基线（`package` 为空、`skills` 为 `core`），不沿用旧模式的保存选择。

`--no-skills` 仅本次零装，不改模式与已保存选择，且与 `--skills` / `--all` / `--no-optional` / `--mode` 互斥。

选择优先级（从高到低）：

1. `--skills <names>`：只装指定技能（逗号分隔）；`skills` 模式下 `core` 技能恒装
   - 包内不存在的名称告警后剔除，全部非法时报错退出（退出码 1）
2. `--all`：安装全部技能；`--no-optional`：只装 `core` 技能
3. TTY 交互：未传上述参数且未传 `--yes` 时，以方向键多选列出技能
   - `skills` 模式下 `core` 已选中且不可取消；`package` 模式下全部默认不选、`core` 可取消
   - `Enter` 确认、`Ctrl+C` 取消（取消时不写任何文件，退出码 130）
4. 已保存选择：非 TTY、传入 `--yes` 或交互取消后无写入时，按保存的选择回显
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

`--from <path|url>` 把符合技能源格式的本地目录或 Git 远程地址纳入同一套 tier / 选择 / 状态 / prune 管理。

- 远程地址支持 `https://`、`ssh://`、`git@`、`github:owner/repo`，可带 `#分支/标签/提交`
- 浅克隆到 `~/.toolkit/cache/skill-sources/` 缓存后复用同一套解析；缓存刷新失败时回落到旧缓存并告警
- `--save [name]` 将来源登记为永久来源（写入全局层 `skillsInstall.sources`）：本地记 `root`，远程记 `url` + `ref`；省略名字时按清单 `name`、仓库名或目录名派生

**来源格式**（按优先级识别）：

1. `skills.json` 清单，`formatVersion` 非 `1` 直接报错、不静默回退目录扫描：

   ```json
   { "formatVersion": 1, "name": "...", "version": "...", "skills": ["skills/a", { "path": "skills/b", "name": "b", "previousNames": ["b-old"] }] }
   ```

2. 根 `SKILL.md`：单技能来源，名称取 frontmatter `name`，缺失时取目录名
3. `<root>/skills/*/SKILL.md`：多技能来源

**曾用名**（`previousNames`）：清单条目级优先，其次 `SKILL.md` frontmatter 的 `metadata.previousNames`（行内数组，语法同 `requires`）。
技能改名后声明旧名，选择集与状态会按别名迁移，旧名产物在下次 `install` 时按归属清理；只支持一级，且不得与同源现用名或其他别名重复，违反即整源报错。

**规则**：

- 技能目录须落在来源根之内；清单路径或软链解析后越界即拒绝
- 同一来源内技能名重复、跨来源同名均直接报错，不静默覆盖
- 临时来源（`--from` 不带 `--save`）**只写副本**、只登记状态，不写选择集与来源配置
- 永久来源默认**软链到技能真源目录**（远程来源指向本地缓存），链接失败降级副本；`--copy` 可强制副本
- `--save` 只能与单个 `--from` 搭配；永久来源失效时安装告警跳过，可用 `toolkit skills sources remove <name>` 注销
- `status` 按来源列出 `sources`（名称 / 根目录或远程地址与 ref / 版本 / 临时标记）；`status` 与 `remove` 均按来源精确处理
- 远程来源的项目面状态只记地址与 ref，不写本机缓存路径；`skills sources` 查看来源清单，`skills sources remove <name> --prune` 注销并清理产物
- 安装 / 卸载期间持有操作锁，避免多进程同时改写；`--dry-run` 不取锁
  - 全局 `~/.agents/.toolkit-skills.lock`、项目 `<仓库根>/.toolkit/skills.lock`
  - 锁记录 pid / host / startedAt，5 分钟过期可接管

## 作用域

`install` / `status` / `remove` 三子命令均支持 `--scope <project|global|all>`，缺省按**现场自动判定**：

- **project（项目面）**：仅在**仓库内**生效。真源固定为仓库根下 `.agents/skills/`（完整副本一份，随 git 入库），
  其余**已存在**的候选目录各放每个技能一个薄壳；候选目录清单与落点细节见[配置参考 · 分发落点](../config/skills#分发落点)。
- **global（全局面）**：写到各 agent 的**全局**技能目录，三层目标与共读 agent 见[配置参考 · 分发落点](../config/skills#分发落点)
- **all**：两面都执行（报告各自成段）

薄壳的 `description` 派生自真源以保持触发面一致，正文只指向真源路径并带本包标记；未命中的候选目录只报告、不凭空建目录。
不写到仓库之外：`--dir` 落在仓库外会告警剔除，不静默丢弃。不支持 `--copy`：真源恒为副本、薄壳非副本，传入时告警忽略。

⚠️ **自动判定判据**：自当前工作目录逐级向上，任一层含 `package.json` 且 CLI 包根真实落在其下 → `project`，否则 `global`。
monorepo 子目录执行亦能命中项目面；**本包源仓库自身视为 `global`**（维护者靠全局技能自举，不把自身 `skills/` 复制进自身仓库）。
传入非法取值（非 `project` / `global` / `all`）时报错退出（退出码 1），不静默回落默认值。

⚠️ **项目面归属账**：产物登记在 `<仓库根>/.toolkit/state.json`，含真源副本、各薄壳目录与逐技能条目（名称 / 版本 / 形态），路径均仓库根相对、随 git 分发。
`remove` 只清账内条目，不碰账外同名产物；卸载时真源副本内容与包内真源一致才删、薄壳带本包标记才删，其余交人工确认。

⚠️ **项目面逐技能状态**（`status` 口径）：取值 `已就绪` / `已漂移`（内容与真源或期望不一致）/ `同名冲突`（非本包产物）/
`缺失`（仅指已选择但缺失）/ `未选择但已安装`（单列提示，不计入问题）。
来源改名的旧副本命中曾用名时，漂移项后标注「已改名为 X，确认后手工删除旧副本」；项目面副本无从校验旧真源，不自动删除。
健康目录折叠为一行，仅异常项逐条展开；漂移与缺失用 `install --scope project` 补齐，同名冲突加 `--force` 覆盖，未选择产物需要清理时加 `--prune`。

⚠️ **clone 即用**：项目面真源副本与归属账随 git 入库，队友 clone 后无需重跑 `skills install` 即开箱可用。
`toolkit init` 在本地依赖含 `@fxri/toolkit` 时，向 `package.json` 补 `prepare` 钩子（`toolkit skills install --scope project`），
依赖升级后自动刷新项目面（详见 [init](./init)）。

各 agent 目录的 `~` 基准可被 home 类环境变量改写，清单见[配置参考 · skills](../config/skills#分发目标与环境变量)。

**全局面行为细节**：

- 产物形态默认**软链**（Windows 用 `junction`，免管理员、免开发者模式）
  - 软链锚在 pnpm 稳定入口（`<node_modules>/@fxri/toolkit`，升级时由 pnpm 重写），不随版本段失效
  - 链接创建失败**自动降级副本**并在报告里标注 ⚠️，不静默跳过
- 卸载链接时**只摘链、不碰真源**
- 软链落点是**写入穿透**形态：在落点目录里编辑文件等于编辑技能真源，且该真源随包升级整体换新
  - `status` 在存在软链落点时于报告末尾提示「写入将穿透至技能真源目录，改内容请改真源」
- `skills.autoLink` / `autoLinkReplaceForeign` 控制软链自愈（默认开；不含首次安装与副本升级，`CI` 自动跳过），边界见[配置参考](../config/skills)
- 状态文件为**用户级**（`~/.agents/.toolkit-skills.json`），与上游安装器的 `skills-lock.json` 相互独立
  - 结构为 `format`（`fxri.toolkit.skills-state`）+ `schemaVersion`（`1`）+ `sources`（来源 → 目标 → 逐技能条目）
  - 升级前的旧结构在首次读取时一次性导入并备份为 `.bak`

## 相关页面

- 参考：[完整攻略 · AI 技能包](../guide#ai-技能包-skills) · [配置参考 · skills](../config/skills)
