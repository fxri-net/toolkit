---
title: 技能分发偏好（skills）
---

# 技能分发偏好（skills）

> 软链自愈、全局与项目面安装偏好；分发命令与现场体检见 [技能分发](../cli/skills)。

## skills：技能分发

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `autoLink` | boolean | `true` | 链接自愈开关：每次执行 `toolkit` 命令时，对状态文件 `~/.agents/.toolkit-skills.json` 记载的**软链**做补链与修链（悬空、指向其他版本即内容与真源不一致的链接重建；内容一致的异地软链不视为错误、不重指） |
| `autoLinkReplaceForeign` | boolean | `true` | 自愈遇到同名**实体目录 / 普通文件**时是否先清理再重建为软链：`true` 清理重建，`false` 一律不动（状态记录保留，需处置时用 `toolkit skills install --force`）；只影响自愈，不影响显式 `install` |

**作用边界**（护栏）：

- **仅作用于全局面软链**：`autoLink` / `autoLinkReplaceForeign` 只做全局技能目录的软链自愈；项目面（仓库内唯一真源副本 + 各候选目录薄壳）不受这两个开关影响，
   其刷新由 `toolkit init` 写入的 `package.json` `prepare` 钩子（`toolkit skills install --scope project --refresh`）承担，
   产物归属账另存 `<仓库根>/.toolkit/state.json`（非配置文件、随 git 分发）
- **只补链与修链**：不含首次安装（未安装过、无状态文件时不动作），不含副本刷新（副本形式的技能不自动升级，需重跑 `toolkit skills install`）
- **只对状态文件记载的链接生效**：现场被替换成实体目录 / 普通文件时，默认清理后重建为软链；`autoLinkReplaceForeign: false` 改为一律不动——该开关**只豁免实体产物**，
   悬空与指向其他版本（内容与真源不一致）的链接仍照常修复
- **`CI` 环境自动跳过**：`CI` 为非空且不等于 `0` / `false` / `off` / `no` 时不执行，避免污染流水线；与升级提示共用同一判定
- **任何失败静默**：修链失败不影响命令本身，条目留在状态文件里下次再试
- 修复发生时向 **stderr** 输出一行 `已自动修复 N 个技能链接`（stdout 留给机器可读输出）；不需要自愈可把 `autoLink` 设为 `false` 关闭

```json
{
  "skills": { "autoLink": true, "autoLinkReplaceForeign": false }
}
```

## skillsInstall：全局技能安装偏好

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `selection` | object | 无 | 来源 → 技能名数组；内置源键为 `toolkit`。`toolkit skills install` 成功后写回，重装 / `status` 按此回显选择集；未保存过时按 `mode` 默认（`skills` 装 `core`、`package` 零装）。名单里的曾用名按来源声明的 `previousNames` 迁移；某来源整份名单都失效时按默认口径重算（内置取 `core`、外部取全部）并告警，本次零装不写空数组 |
| `targets` | string[] | 无 | 长期目标选择：`canonical`（主目标）与各 agent 的 `name`（如 `claude-code`、`cursor`）。安装 / 交互选择后写回；未保存过时首次写全部可用目标；`--no-save-agents` 不写回；`--dir` 自定义目录不进入本字段 |
| `sources` | object | 无 | 永久外部来源登记：本地来源写 `{ "root": "<绝对路径>" }`，远程来源写 `{ "url": "<Git 地址>", "ref": "<可选 ref>" }`。由 `toolkit skills install --from <path|url> --save [name]` 写入；启动时自动解析并纳入安装 / 状态，远程来源使用用户级缓存 `~/.toolkit/cache/skill-sources/`，来源失效时告警跳过 |
| `mode` | string | `skills` | 安装模式：`skills`（core 必装）/ `package`（纯包管理器，全部可选、允许零选）；由 `toolkit skills install --mode` 写入，非法值告警后按 `skills` 处理 |
| `gate` | boolean \| object | `false` | **旧键**（建议迁移到 `skillsDelivery`，2.0.0 起移除兼容）：`true` 开启并按默认规则全量接管；也可写 `{ "include": ["fxri-*"], "exclude": ["fxri-text-encoding"] }`（技能名 glob 或 `re:`，排除优先）裁剪范围。技能可用 `SKILL.md` 的 `metadata.gate: false` 单点退出，非法取值会告警并按未声明处理。读取时映射为等价的 `skillsDelivery` 配置；由 `toolkit skills install --gate` / `--embed` 写入（安装成功后才落盘，`--dry-run` 与存在失败条目不写），之后裸 `install` 沿用。只影响全局面 |

```json
{
  "skillsInstall": {
    "selection": { "toolkit": ["fxri-plan-to-task", "fxri-session-recap", "fxri-plan-review", "fxri-text-encoding"] },
    "targets": ["canonical", "claude-code"],
    "sources": {
      "play": { "root": "D:/skills/playbook" },
      "remote": { "url": "https://github.com/fxri-net/playbook", "ref": "vX.Y.Z" }
    }
  }
}
```

⚠️ **仅认全局层**：`skillsInstall` 只从全局层 `~/.toolkitrc.json` 读取；
写在项目层 `.toolkitrc.json` 或本地层 `.toolkitrc.local.json` 时向 **stderr** 告警并忽略（不静默生效）。写入时只合并 `skillsInstall` 段、
保留同文件其他配置段，写前备份 `.bak`、写后原子落盘并失效配置缓存。

## skillsDelivery：技能分发形态

每个技能只有一种分发形态，由本段单源推导，三态互斥且穷尽：

| 形态 | 含义 | 落盘 |
| --- | --- | --- |
| `full` | 全文安装，到处可用（默认） | 软链 / 副本 |
| `gated` | 只放入口壳，正文由 `toolkit scope guard` 按作用域下发 | 薄壳 |
| `off` | 不安装；已装残留不自动删除，`install --prune` 才清理 | 无产物 |

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `default` | string | `full` | 未命中规则时的默认形态：`full` / `gated` / `off`；非法值告警后按未配置处理 |
| `rules` | array | `[]` | 显式规则：`{ "match": ["fxri-*"], "delivery": "gated" }`，`match` 任一模式命中即生效（技能名 glob 或 `re:`）。同一技能命中多条时按具体度取胜（命中模式数 → 字面量长度 → 书写顺序），具体度相同取最后一条并向 **stderr** 提示被压规则；非法模式与非法枚举告警后剔除 |

推导优先级（高 → 低）：命令行显式取值 → 技能声明 `metadata.gate: false`（旧键，按全文）→ `skillsDelivery.rules` →
策略推导（矩阵）→ `skillsDelivery.default` → 默认全文。

**策略推导**：矩阵对技能的声明直接决定形态，不需要再手动开闸门——

- 带条件的拒绝（`effect: deny` 且带路径 / 标记 / 远端条件，或 `skills.deny` 命中）→ `gated`
- 允许名单收窄（`skills.mode: allowlist` 且名单不是 `*`）且技能不在其中 → `gated`
- 无条件拒绝（无任何条件）→ `off`；无条件 `allow: ["*"]` 不产生限制
- 多个策略命中时 `source` 列出全部策略 id，`reason` 取最具体一条；显式 `skillsDelivery.rules` 仍可覆盖推导
- `toolkit skills status --explain <技能>` 逐级打印命中 / 未命中与被压规则

**技能包默认**：`SKILL.md` frontmatter 可声明 `metadata.delivery: full | gated`，位于策略推导之后、全局默认之前；
第三方技能可自带默认，用户 `rules` 仍可覆盖；非法取值告警后按未声明处理（不认 `off`，不安装只能由用户策略决定）。

**按安装面读取**：全局面读全局层 + 本地层（项目层写法告警并按未配置处理）；项目面读全局层 + 项目层 + 本地层——
项目层整段覆盖全局、本地层按字段覆盖。项目面的 `gated` 同样落入口壳：真源副本仍在 `<仓库根>/.agents/skills/`，
入口壳调用同一个 `toolkit scope guard`，判定读项目层配置，正文取项目真源副本。

**旧键兼容**（读时映射、只提示不写盘，2.0.0 起移除）：

- `skillsInstall.gate: true` → `default: "gated"`；`skillsInstall.gate: { include, exclude }` → 等价的 `rules`
  （include → `gated`、exclude → `full`，排除优先）
- `SKILL.md` 的 `metadata.gate: false` → 该技能按全文安装
- 新旧并存时以 `skillsDelivery` 为准，旧键被忽略并在 **stderr** 告警

`toolkit skills gate on|off` 只写本段 `default`，不覆盖 `rules`；`toolkit skills install --gate` / `--embed` 仍是本次安装的显式取值。

```json
{
  "skillsDelivery": {
    "default": "full",
    "rules": [
      { "match": ["fxri-plan-*", "fxri-session-*"], "delivery": "gated" },
      { "match": ["fxri-docs-writing"], "delivery": "off" }
    ]
  }
}
```

`off` 的技能不参与 `skills status` 的缺失统计；既有产物在 `status` 单列为残留，
`toolkit skills install --prune` 才按归属清理，`toolkit skills plan` 中显示为「清理」。

## projectSkills：项目面技能安装偏好

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `selection` | string[] | 无 | 项目面选择集（技能名数组），由 `toolkit skills install --scope project` 成功后写回；未保存过时按 `mode` 默认（`skills` 装 `core`、`package` 零装）。曾用名按来源声明的 `previousNames` 迁移，外部来源技能默认选中；整份名单失效时按默认口径重算 |
| `targets` | string[] | 无 | 长期薄壳目录选择：仓库根相对的候选目录（如 `.trae/skills`）。安装 / 交互选择后写回；未保存过时首次写全部已存在候选目录；`prepare` 等非交互场景按此刷新，不新增未选择目录 |
| `mode` | string | `skills` | 项目面安装模式：`skills` / `package`；由 `toolkit skills install --scope project --mode` 写入，零选择时不生成技能薄壳与 `.toolkit/state.json` |

```json
{
  "projectSkills": {
    "selection": ["fxri-plan-to-task", "fxri-session-recap", "fxri-plan-review"],
    "targets": [".trae/skills", ".claude/skills"]
  }
}
```

⚠️ **仅认项目层**：`projectSkills` 只从项目层 `.toolkitrc.json` 读取；写在全局层或本地层时告警并忽略。项目面与全局面的选择集相互独立，`--scope all` 时两面共用本次交互结果。

## 安装目标选择

技能选择之后是**目标选择**：全局面选 agent 目录，项目面选已存在的候选薄壳目录；结果写入 `skillsInstall.targets` / `projectSkills.targets`。

- **优先级**（从高到低）：`--all-agents` / `--agent <names>` 显式指定 → TTY 方向键多选 → 已保存的 targets → 首次全部可用目标
- **交互**：按「共读（canonical）→ agent → 自定义目录」分组展示；本机未检测到的已保存 agent 置灰保留，不凭空创建目录；只有一个可用目标时跳过选择
- 选择完成后打印技能 + 目标汇总并二次确认，确认前 `Ctrl+C` 不写任何文件
- **长期选择**：交互或 `--agent` / `--all-agents` 的结果写回配置；`--no-save-agents` 只影响本次；`--dir` 始终一次性，不写回长期选择
- **取消目标**：已安装产物默认保留，`status` 将这些目标标为「未选择」并把其产物单列「未选择但已安装」、不计入问题；
  加 `--prune` 重跑 `install` 才清理本包登记且内容一致的产物，第三方 / 本地改动过的产物永不自动删除
- **项目面**：`prepare` 钩子只刷新归属账已存在的本包产物，不新增技能；非 TTY 与 `CI` 下只打印漂移不写盘，避免 `pnpm install` 产生意外 diff。保存的目录已不存在时告警跳过，补齐目录后重跑即可

## 分发目标与环境变量

各 agent 的全局技能目录以 `~` 为基准，可被 home 类环境变量改写：

| 变量 | 作用 |
| --- | --- |
| `XDG_CONFIG_HOME` | 改写 amp / devin / goose / opencode / replit / universal 的基准 |
| `AUTOHAND_HOME` / `CLAUDE_CONFIG_DIR` / `GROK_HOME` / `HERMES_HOME` / `VIBE_HOME` | 各自命中时生效；空值或非绝对路径回落默认 |
| `SARVAM_HOME` / `CODEX_HOME` / `APPDATA` / `FLATPAK_XDG_CONFIG_HOME` | 仅参与探测，不改变写入落点 |

Codex / Pi 的全局目录就是主目标（`~/.agents/skills/`），`CODEX_HOME` 只用于判断是否安装，不改变写入落点。

### 分发落点

**全局面三层目标**（按顺序去重）：

1. 主目标 `~/.agents/skills/`：上游 canonical 目录，多家 agent 共读
2. 内置表中「已安装」的各 agent 全局技能目录（判据：agent 配置目录存在或探测路径命中）
3. `--dir <path>` 指定的兜底目录

共读主目标的 agent：Cline、Codex、Dexto、Kimi Code CLI、Loaf、Pi、Sarvam Code、Warp、Zed、DeepSeek Harness。
它们读取的就是主目标本身，写入一次即全部覆盖；`status` 单列「经 canonical 共读的 agent」。
DeepSeek Harness 的项目级技能目录与项目面真源同路径（`<仓库根>/.agents/skills/`），无需向 `~/.dsh/skills/` 额外写入。

⚠️ **`--dir` 自定义目录**：只在当次安装时写入并登记，技能增删后不同步；变化后需带相同 `--dir` 重跑 `toolkit skills install`。

**项目面候选目录**（19 个，仅在目录已存在时落壳）：

| 候选目录 | 候选目录 | 候选目录 |
| --- | --- | --- |
| `.agents/skills/`（真源） | `.trae/skills/` | `.claude/skills/` |
| `agent/skills/`（Eve） | `.augment/skills/` | `.codebuddy/skills/` |
| `.continue/skills/` | `.crush/skills/` | `.devin/skills/` |
| `.goose/skills/` | `.grok/skills/` | `.hermes/skills/` |
| `.iflow/skills/` | `.junie/skills/` | `.kiro/skills/` |
| `.openhands/skills/` | `.qwen/skills/` | `.roo/skills/` |
| `.windsurf/skills/` |  |  |

`.cursor/skills/`、`.trae-cn/skills/` 是这两家 agent 的**全局**目录，不在项目级候选内。

## 作用域与安装面

`install` / `status` / `remove` 三子命令均支持 `--scope <project|global|all>`，缺省按**现场自动判定**：

- **project（项目面）**：仅在**仓库内**生效。真源固定为仓库根下 `.agents/skills/`（完整副本一份，随 git 入库），
  其余**已存在**的候选目录各放每个技能一个薄壳；候选目录清单与落点细节见[分发落点](#分发落点)。
- **global（全局面）**：写到各 agent 的**全局**技能目录，三层目标与共读 agent 见[分发落点](#分发落点)
- **all**：两面都执行（报告各自成段）

薄壳的 `description` 派生自真源以保持触发面一致，正文只指向真源路径并带本包标记；未命中的候选目录只报告、不凭空建目录。
不写到仓库之外：`--dir` 落在仓库外会告警剔除，不静默丢弃。不支持 `--copy`：真源恒为副本、薄壳非副本，传入时告警忽略。

⚠️ **自动判定判据**：自当前工作目录逐级向上，任一层含 `package.json` 且 CLI 包根真实落在其下 → `project`，否则 `global`。
monorepo 子目录执行亦能命中项目面；**本包源仓库自身视为 `global`**（维护者靠全局技能自举，不把自身 `skills/` 复制进自身仓库）。
传入非法取值（非 `project` / `global` / `all`）时报错退出（退出码 1），不静默回落默认值。

⚠️ **项目面归属账**：产物登记在 `<仓库根>/.toolkit/state.json`，含真源副本、各薄壳目录与逐技能条目（名称 / 版本 / 形态），
路径均仓库根相对、随 git 分发。`remove` 只清账内条目，不碰账外同名产物；
卸载时真源副本内容与包内真源一致才删、薄壳带本包标记才删，其余交人工确认。

⚠️ **项目面逐技能状态**（`status` 口径）：取值与全局面同一套，未选择但已安装单列提示、不计入问题。
来源改名的旧副本命中曾用名时，漂移项后标注「已改名为 X，确认后手工删除旧副本」；项目面副本无从校验旧真源，不自动删除。
「来源内未选择」汇总与折叠、补齐口径同全局面：漂移与缺失用 `install --scope project` 补齐，同名冲突加 `--force`，未选择产物清理加 `--prune`。

⚠️ **clone 即用**：项目面真源副本与归属账随 git 入库，队友 clone 后无需重跑 `skills install` 即开箱可用。
`toolkit init` 在本地依赖含 `@fxri/toolkit` 时，向 `package.json` 补 `prepare` 钩子
（`toolkit skills install --scope project --refresh`），依赖升级后自动刷新项目面（详见 [项目初始化](../cli/init)）。

全局面软链 / 副本形态、pnpm 锚点、写入穿透与状态文件结构见下文[全局面分发细节](#全局面分发细节)。

## 全局面分发细节

- 产物形态默认**软链**（Windows 用 `junction`，免管理员、免开发者模式）
  - 软链锚在 pnpm 稳定入口（`<node_modules>/@fxri/toolkit`，升级时由 pnpm 重写），不随版本段失效
  - 链接创建失败**自动降级副本**并在报告里标注 ⚠️，不静默跳过
- 卸载链接时**只摘链、不碰真源**
- 软链落点是**写入穿透**形态：在落点目录里编辑文件等于编辑技能真源，且该真源随包升级整体换新
  - `status` 在存在软链落点时于报告末尾提示「写入将穿透至技能真源目录，改内容请改真源」
- `skills.autoLink` / `autoLinkReplaceForeign` 控制软链自愈（默认开；不含首次安装与副本升级，`CI` 自动跳过），边界见「skillsInstall：全局技能安装偏好」一节
- 状态文件为**用户级**（`~/.agents/.toolkit-skills.json`），与上游安装器的 `skills-lock.json` 相互独立
  - 结构为 `format`（`fxri.toolkit.skills-state`）+ `schemaVersion`（`1`）+ `sources`（来源 → 目标 → 逐技能条目）
  - 升级前的旧结构在首次读取时一次性导入并备份为 `.bak`

## 相关页面

- 参考：[配置参考总览](../config) · [技能分发](../cli/skills) · [完整攻略 · AI 技能包](../guide#ai-技能包-skills)
