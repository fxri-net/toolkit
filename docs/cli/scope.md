---
title: 作用域（scope）
---

# 作用域（scope）

> 按项目 / 目录决定技能是否生效。默认全域生效，只有写了作用域配置才出现局部生效。
> `status` / 裸 `list` / `policy list` / `skills list` 只读；`list` 的 add / exclude / remove / default / reset
> 与 `policy` / `skills` 写命令复用同一套预览与确认，预览会展示完整规则 / 档案内容。

## 用途与场景

- 全局装了 CLI 与技能，但只想在指定项目 / 父目录生效，或排除某些项目 / 目录
- 排查「为什么这个目录生效 / 不生效」：看命中的配置文件与规则
- 团队自建项目层配置时，同样按就近覆盖参与判定

## 常用命令

```bash
toolkit scope                                   # 状态优先向导：看状态 / 加白黑名单 / 管条目 / 名单外处理 / 高级规则 / 技能矩阵
toolkit scope wizard                            # 显式进入交互向导（非 TTY 按无交互退出码结束）
toolkit scope status                            # 当前目录的判定与说明
toolkit scope status --skill fxri-plan-review   # 按技能级规则判定单个技能
toolkit scope status --skills                   # 列出包内与已安装外部技能在该目录的生效结论
toolkit scope status --skills --at ~/work/repo  # 以指定目录为判定起点（不改进程 cwd）
toolkit scope status --format json              # 给 AI / 脚本消费
toolkit scope list                              # 名单、配置来源与判定目录
toolkit scope policy list                       # 列出策略、来源层与当前命中结果
toolkit scope policy add --paths ~/work --mode allowlist --allow fxri-plan-review # 新增策略
toolkit scope policy add --paths ~/work --tree --mode allowlist --allow fxri-plan-review # 覆盖子目录
toolkit scope policy remove --id policy-xxx     # 按稳定 id 移除
toolkit scope policy reset --paths ~/work --dry-run # 按路径批量清除（预演）
toolkit scope skills list                       # 技能档案与技能维度策略
toolkit scope skills allow fxri-plan-review --paths ~/work # 只允许列出的技能
toolkit scope skills deny fxri-code-encoding --paths ~/work # 排除列出的技能
toolkit scope skills profile front --allow "fxri-*" # 写入技能档案
toolkit scope list add ~/work                   # 加入白名单，默认切到「仅名单内生效」
toolkit scope list add ~/work --tree            # 覆盖 ~/work 及其下所有项目
toolkit scope list exclude ~/work/legacy        # 加入黑名单，默认值不变
toolkit scope list add ~/work --layer project   # 写入当前项目层（随仓库共享）
toolkit scope list remove ~/work --from include --to exclude # 白名单转黑名单
toolkit scope list remove ~/work/legacy --from exclude # 从黑名单移除
toolkit scope list default                      # 查看名单外目录的处理
toolkit scope list default off                  # 切换为「仅名单内生效」
toolkit scope list reset                        # 清除限制（全部生效）
toolkit skill mount ~/work --dry-run            # 批量项目面安装：先预览（由 scope mount 迁入）
toolkit scope guard fxri-plan-task              # 内容闸门：按当前目录作用域输出技能正文（未激活按未激活退出码结束）
```

名单的查看与增删改统一收进 `scope list` 组：裸 `scope list` 查看名单，
`list add` / `list exclude` / `list remove` / `list default` / `list reset` 负责写入。
旧写法 `scope add` / `scope exclude` / `scope remove` / `scope default` / `scope reset` 仍可用，但会提示已弃用并提示迁移到该子组。

## 策略命令

- `scope policy list [--at <目录>] [--format json]`：列出来源层、`id`、`name`、条件、技能维度、显式形态与当前命中结果；
  由 `activation` 编译出的名单规则标注「由名单配置生成，只读」
- `scope policy add`：条件 `--paths` / `--subpaths` / `--markers` / `--git-remotes`；
  技能维度 `--mode` / `--profile` / `--allow` / `--deny`；`--effect` 缺省 `allow`
  `--delivery <full|gated|off>` 把该范围的内容形态写进规则（`--effect deny` 不能配 `full`，命令直接报错不写盘）
  `--effect deny` 不接受这些技能名单，只按 `scope skills deny` 生成的技能选择器生效
  `--id` 不含空白 / 控制字符且不能以 `legacy:` 开头，缺省自动生成且不可变
  `--profile` 只能引用目标层及更低层已定义的档案
- `scope policy remove`：优先 `--id`；`--name` 仅在该层唯一且无跨层同名时可用
- `scope policy reset`：按 `--id` / `--paths`（精确或 glob 命中）批量清除；整层清空需 `--all` + `--yes`，
  只清 `policies`，不清旧 `activation`
- `scope skills` 是技能维度快捷视图：`allow` 只允许列出的技能，`deny` 排除列出的技能，`profile` 管理档案，`reset` 清空该层技能策略
  `profile` 移除时提示仍被哪些策略引用与同名回退
  `profile` 的精确技能名按包内清单校验；只含 deny 的档案不能用于 allowlist / deny 展开
  `profile` 省略档案名时按 `--layer` 过滤列表，未传为合并视图
- 优先级：层（local > project > global）→ 具体度 → `deny` > `allow` → 后写覆盖；只取最高优先的一条，不合并
- 每条命中规则同时给出「是否生效」与「该目录形态」：拒绝为不安装、允许取 `--delivery`、未写即全文；`scope status --skills` 逐技能显示形态
- 非技能维度（纯路径 / 标记 / 远端）同样用 `scope policy` 表达；`--mode` / `--allow` 仅在 `allowlist` 下参与放行
- `deny` 只按技能选择器限定范围，携带名单会被拒绝；未限定技能会拒绝该范围全部技能，写入需 `--yes`

## 交互与写命令

- 无参 `toolkit scope`：TTY 下进入状态优先向导；非 TTY 输出状态摘要与子命令提示并以 `0` 退出。
  交互入口也可显式运行 `toolkit scope wizard`（非 TTY 按无交互退出码结束，见[退出码](./exit-codes)）
- `scope status` / `list` 的 `--format` 仅接受 `json`，非法值在 stderr 报错并以 `1` 退出，不再回落文本
- 向导首页固定显示「当前层 + 配置来源 + 名单模式 + 白名单 / 黑名单条数」；首项为查看状态 / 名单与策略，避免盲改
- 动作按意图排列：添加白名单 / 添加黑名单 / 管理条目（移除、互转）/ 修改名单外处理 / 清除限制 / 高级规则 / 技能矩阵 / 切换配置层 / 退出
- 添加流程先选白或黑，再选来源：扫描项目选择、手动输入目录、使用当前目录；扫描结果页显示跳过统计，
  可反复开启「扫描隐藏目录」「展开仓库内部」直到按当前范围继续；无结果页另提供下探更深
- 项目层 / 本地层额外提供「仅本项目生效」「在本项目内排除」两个快捷项，落到同一配置模型，不再走独立分支
- 管理条目合并两列表并标注 `[白]` / `[黑]`、路径存在性与被覆盖提示；勾选后移出或转到另一侧，写前展示 diff
- 高级规则（启用标记 / git 远端 / 技能级规则）只读展示并给出配置文件路径，复制后自行编辑，不自造低频编辑 UI
- 技能矩阵页：选择范围（当前项目 / 手动项目与子路径 / 扫描）、模式（只允许 / 全部允许但排除）、技能或档案，
  可选标记 / 远端条件；预览后写入，空现场提示先安装技能或创建档案，不写空规则
- 内容闸门与批量挂载已移出本域：默认分发形态用 `toolkit config set skillDelivery.default gated|full` 切换，
  `on` 对应 `gated`（入口壳）、`off` 对应 `full`（全文），查看用 `toolkit config get skillDelivery.default`；
  `toolkit skill install --gate` / `--embed` 生成或还原入口壳；批量挂载用 `toolkit skill mount`
- 选择页统一提供「← 返回」（末位）与 ESC 返回上一级；顶层「退出」按成功计 `0`，Ctrl+C 结束整个命令（取消退出码）
- ESC 有约 500ms 判定延迟（readline 需先排除方向键序列），属正常现象
- `scope list add` / `list exclude` / `list remove` 均需显式目录：无参只提示改用 `toolkit scope wizard`，不再隐式进入完整向导
- `list add` 加入白名单并把默认值切到「仅名单内生效」；`list exclude` 只加黑名单、默认值不变；同路径在另一侧时写前预览「移入 / 转入」
- `list add --tree` 与 `policy add --paths ... --tree` 把裸目录写成 `<目录>/**`，覆盖目录自身与其下所有项目；向导添加目录时会询问生效范围
- `list remove --from include|exclude|both`（默认 `both`）指定来源侧，`--to include|exclude` 一步转入另一侧；带参与交互同口径
- `list default on|off` 查看或切换名单外目录的处理；`list reset` 清除限制（全部生效并清空两列表，保留标记 / git 远端 / 技能级规则）
- 向导内对应入口为「修改名单外目录的处理」，不再叫「切换默认值」
- 写前统一展示预览：TTY 下确认后落盘，`--yes` 跳过确认，`--dry-run` 只预览；非 TTY 带显式参数直接执行
- 结果块统一输出写入文件、变更条目与当前名单模式；无变化时只提示「没有变化，无需写入」
- 相对路径按目标层项目根解析（全局层按当前目录）；`--layer global|project|local` 缺省全局
- `scope list` 同时输出条目存在性：文本模式列出「条目异常」，`--format json` 的 `data.items` 含 `path` / `list` / `exists`；
  相对路径条目按所属配置层的项目根解析；含 `*` / `?` 或 `re:` 的规则跳过存在性检查（`exists` 恒为 `true`）
- 批量项目面安装已迁至 `toolkit skill mount`（原 `scope mount` 已移除）；写入边界与 `--dry-run` 见 [技能分发 · mount](./skill#mount)
- 非 TTY 环境：`wizard` 会提示无法交互（无交互退出码，见[退出码](./exit-codes)）；写命令请直接带参数
- **写入即收敛**：`list *` / `policy *` / `skills *` 与向导写配置后会按矩阵自动收敛技能产物——
  写前预览同时列出「配置变更」与「技能形态变更」（哪个技能从全文变入口壳 / 变不安装），确认后先落配置再改产物，逐技能报告结果
  - 层 → 安装面：写全局层只动全局面，写项目层只动项目面，写本地层同时重算两面；项目面在 `CI` / 非 TTY 下只报告不写盘
  - 收敛失败不静默：退出码非 0，并提示「配置已写入，产物未完全收敛，可重跑 `toolkit skill reconcile`」；无差异时只报「技能形态：无变化」
  - `--no-link` 只写配置（stderr 提示可事后收敛）；`--dry-run` 预演包含形态变更；已装产物与目标一致时幂等不重写

## 内容闸门 guard

- 前置：技能已被判定为入口壳形态（矩阵限制或 `skillDelivery` 规则），由 `toolkit skill install` 生成入口壳；
  旧键 `skillInstall.gate` / `metadata.gate: false` 仍读时兼容，新配置用 `skillDelivery`
- `toolkit scope guard <技能名>` 读取当前目录的作用域判定：**激活时**把真源 `SKILL.md` 正文写到 stdout。
  guard 已包含目录判定，无需先跑 `scope status`；`status` 用于排查与解释，建议同目录同会话只查一次。
  **未激活或策略声明该目录不安装（`delivery: off`）时** stdout 为空、原因写 stderr 并以**未激活退出码**结束（见[退出码](./exit-codes)）
  形态按目录解析：`full` 与 `gated` 都输出正文，区别只在安装产物是全文还是入口壳
- 输出契约：stdout 只放正文（供 AI 直接消费），参考文件目录与诊断一律走 stderr；只读，不写缓存
- 技能名须为内置包或已登记来源中存在的单段名字；未知名字或含路径分隔符时以退出码 `1` 报错
- 仅在 argv 恰为 `scope guard <技能名>` 时走快速路径（不加载完整命令集）；带其它参数（含 `--help`）回落常规 CLI
- 入口壳只降低正文被读取的概率，不是物理隔离；需要绝对干净用 `skill mount` 或 `skill install --scope project` 做项目面安装
- `toolkit skill install --embed` 可随时回退为全文安装
- 联动提示：矩阵限制的技能已按策略推导自动进入入口壳；仅当显式规则把被拒技能设为全文时，
  `scope status` / `scope skills list` / `skill status`（项目面）提示「策略对该技能无效：已显式设为全文安装」

## 判定顺序

1. 多条策略命中时按层（local > project > global）→ 同层具体度（`subpaths` > `paths` > 无条件；技能精确名 > glob > 无技能约束；
   条件更多、路径更长）→ `deny` > `allow` → 后写覆盖，只取最高优先的一条
2. `effect: deny` 直接拒绝；`effect: allow` 再按 `skills.mode` 判断当前技能（allowlist 需命中允许项，denylist / all 仅排除项）
3. 无策略命中默认允许

旧 `activation` 加载时编译为同层策略：`exclude` / 标记排除为 deny，`include` 与启用条件为 allow，空 allowlist 产生兜底 deny，
既有配置结论不变。判定目录为项目根：优先 git 根，其次最近 `.tasks` 根，都没有则回落当前目录。
`scope status --format json` 走统一信封，`data` 内含 `active` / `mode` / `baseDir` / `skill` /
`sourceFile` / `matchedRule` / `reason`。
`matchedRule` 为纯 `policy:<id>`（不含 name）；文本模式再按策略记录补中文名，名单配置生成的规则只显示中文名。
`scope status --skills --format json` 的 `data` 另含 `skills` 与 `linkage`。
只有 `policies` 时，`scope status` 不显示名单模式，改为显示策略条数与策略来源；`scope list` 同样追加策略摘要。
基准变化或规则按真实路径写入导致不命中时，status 会在 stderr 给出提示。

## 边界

- 默认 `mode = all`，不配置时与历史行为完全一致；`denylist` 是等价的兼容别名，`status` / `list` 显示为 `全部生效（兼容读取 denylist）`，
  任何写命令都会把旧值归一为 `all`
- `mode = all` 时 `include` 不参与判定，`list` 会在白名单后标注「当前默认全部生效，未参与判定」
- 只影响技能与内容闸门（`scope guard`），不影响 `toolkit` 命令本身（命令是显式调用的）
- `scope policy reset --all` 只清 `policies`；旧 `activation` 需 `scope list reset`，两者不要混用
- 矩阵未允许的已安装技能只提示、不自动删除，用 `toolkit skill uninstall` 清理
- 全局规则无法按目录排除（agent 限制）；项目专用规则需落在项目内
- 工具不创建、不修改项目内配置或标记；项目层配置由用户自行写入时正常参与

## 相关页面

- 配置：[作用域配置（activation / policies）](../config/activation) · [配置参考](../config)
- 参考：[CLI 参考](../cli) · [技能分发](./skill)
