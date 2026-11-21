---
title: 作用域（activation）
---

# 作用域（activation）

> 控制技能与规则在哪些项目 / 目录生效。**不配置时全域生效**，与历史行为一致。

## 字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `mode` | `all` / `allowlist` / `denylist` | 默认 `all`；白名单模式需命中 `include`；`denylist` 为等价兼容别名，新写入不再产生 |
| `include` | 字符串数组 | 白名单规则（glob 或 `re:` 正则）；`allowlist` 必填，空数组视为不生效 |
| `exclude` | 字符串数组 | 排除规则（glob 或 `re:` 正则）；优先级最高，命中即不生效 |
| `markers.include` | 字符串数组 | 启用标记文件名；配置后需在 cwd 或 git 根存在其一 |
| `markers.exclude` | 字符串数组 | 排除标记文件名；存在即不生效 |
| `gitRemotes` | 字符串数组 | git 远端 glob；`https` / `ssh` / `scp` 写法归一后匹配 |
| `skills` | object | 旧字段技能级规则：键为技能名（glob 或 `re:`），值为 `{ mode?, include?, exclude? }`；加载时编译为同层技能策略 |

同级的 `policies`（策略规则）与 `skillProfiles`（技能档案）见下文「策略规则」「档案」，两者与 `activation` 平级。

## 示例

```json
{
  "activation": {
    "mode": "allowlist",
    "include": ["~/work/**"],
    "exclude": ["~/work/legacy/**"],
    "markers": { "include": [], "exclude": [] },
    "gitRemotes": []
  }
}
```

放在 `~/.toolkitrc.json`（全局层）即对整个目录树生效；团队或个人也可在项目里自建 `.toolkitrc.json` / `.toolkitrc.local.json`，
按就近覆盖参与判定。工具只在 `toolkit scope` 的写入命令（`add` / `remove` / 交互向导）中改动这些文件，其他场景不主动创建或修改。

## 路径写法

- 规则支持 glob（默认）与 `re:` 前缀正则，如 `re:^/home/u/work/(a|b)$`
- glob 规则支持 `~`（展开为 home）与相对路径（按判定基准解析）；`re:` 按正则原文匹配，不做展开
- glob 只支持最小子集：`**`（跨层）、`*` / `?`（不跨路径分隔符），其余字符按字面匹配
- 判定按**字符串口径**比较：不解析符号链接，同一份规则在各系统结论一致
- 路径、技能名与 `gitRemotes` 一律**不区分大小写**；Windows 上以 `/` 开头的规则不写盘符也能命中
- 旧版按真实路径写入的规则（如 macOS 的 `/private/...`）不再自动命中，`scope status` 会提示改用 `pwd` 看到的路径
- 结尾 `/**` 同时命中目录自身与其下任意层级
- `mode: all` 时 `include` 不参与判定；`denylist` 与 `all` 判定完全一致，`scope status` / `list` 显示为 `all（兼容读取 denylist）`
- 非法正则、超过 200 字符或含嵌套量词（如 `(a+)+`）的规则会被忽略并告警，不参与判定

## 判定基准

判定按**项目根**而非当前目录进行：优先 git 根，其次向上最近的含 `.tasks` 的目录，都没有则回落当前目录。
因此在仓库子目录里执行时，`include: ["D:/work/proj"]` 即可覆盖其下所有子目录，无需手写 `/**`。
基准从 cwd 变为项目根后，若同一目录的新旧结论不同，`scope status` 会给出提示。

## 技能级规则（旧字段）

`activation.skills` 保留兼容：加载时编译为同层技能策略，优先级高于同层目录规则；未命中时回落目录级。
新配置建议直接用 `policies` + `skillProfiles`。旧字段在 `scope policy list` 中标注 `legacy` 只读，
`scope policy reset --all` 不会清除它，需用 `scope reset`。

## 策略规则

`policies` 是 `activation` 的同级数组，每条由条件、技能维度与效果组成：

| 字段 | 说明 |
| --- | --- |
| `id` | 稳定机器标识：跨层唯一、不可变；CLI 生成，手写建议显式写上 |
| `name` | 可读标签，可重复，只用于展示 |
| `when` | 条件：`paths` / `subpaths` / `markers` / `gitRemotes`；同字段内 OR，跨字段 AND |
| `skills` | 技能维度：`match` 限定适用技能，`mode` / `profiles` / `allow` / `deny` 决定放行 |
| `effect` | `allow`（默认）或 `deny`；`deny` 命中即拒绝整个范围 |

- `effect: allow` 时按 `skills.mode`：`allowlist` 需命中 `profiles` / `allow` 且不在 `deny`；`denylist` 与 `all` 仅 `deny` 排除
- `effect: deny` 不读取技能名单，写入带名单且无 `skills.match` 的 deny 规则会被拒绝；
  只拒绝某个技能时用 `scope skills deny` 生成带 `skills.match` 的规则
- `when` 为空或全空数组即兜底规则，加载时会告警

```json
{
  "policies": [
    {
      "id": "work-review-only",
      "when": { "paths": ["~/work/**"], "gitRemotes": ["github.com/acme/**"] },
      "skills": { "mode": "allowlist", "profiles": ["review"] }
    }
  ],
  "skillProfiles": { "review": { "allow": ["fxri-plan-review", "fxri-code-review"] } }
}
```

## 档案

`skillProfiles` 与 `activation` 同级：键为档案名，值为 `{ allow?, deny? }` 技能名 / glob。
策略通过 `skills.profiles` 引用档案；同名档案按最近层**整份覆盖**，不做名单合并。
策略只能引用其所在层及更低层定义的档案（全局策略只能引用全局档案）；手写配置越层引用时加载告警但保留。
档案 `allow` / `deny` 中的精确技能名按包内清单校验；只含 `deny` 的档案不能用于 allowlist 或 `scope skills deny --profile` 展开。
`scope skills profile` 可查看 / 写入 / 移除档案。

## 优先级与合并

多条规则命中时只取**最高优先的一条**（覆盖语义，不合并）：

1. 层：`local` > `project` > `global`
2. 同层具体度：带 `subpaths` > 带 `paths` > 无条件；技能精确名 > glob > 无技能约束；条件更多、路径更长者更具体
3. 同具体度：`deny` > `allow`；仍相同则后写覆盖

无规则命中时默认允许。规则是覆盖而非叠加：项目要追加技能时，引用同一档案并补一条更具体的增量规则。
旧 `activation` 编译为同层策略；最近一份 `activation` 仍整段覆盖更远层，是该模型唯一的例外。
父目录 glob（如 `~/work/**`）自动覆盖其后新建的项目，无需逐项目配置。

## 子目录

`subpaths` 按项目根相对当前 cwd 匹配，用于「同一项目只在某个子目录生效」。
在项目根执行时，带 `subpaths` 的 allow 规则按**失败关闭**处理，deny 规则视为不适用。
查看结论用 `toolkit scope skills list --at <目录>` 或 `scope status --skills --at <目录>`；`--at` 不改进程 cwd。

## 软限制边界

策略只决定技能**正文是否下发**，前提是内容闸门已开启：

- `skillsInstall.gate` 未开启时正文仍全量加载，`scope status` / `scope skills list` 提示「矩阵已配置，但正文仍全量加载」
- 闸门规则排除该技能或技能声明 `metadata.gate: false` 时策略不生效，提示「策略无效：技能仍全文加载」
- 已安装但当前目录矩阵未允许的技能只提示、不自动删除，可用 `toolkit skills uninstall` 清理
- 软限制不是物理隔离；需要更强边界时用 `toolkit skills install --scope project` 或 `--embed` 回退全文

## 与规则的关系

- 作用域只决定技能是否生效与后续内容闸门的放行；**全局规则无法按目录排除**，这是 agent 的限制
- 需要项目专用规则时，把规则文件放进项目；全局规则只保留通用纪律

## 相关页面

- 命令：[scope（作用域）](../cli/scope) · [skills（技能分发）](../cli/skills)
- 参考：[配置参考](../config) · [常见问题](../faq)
