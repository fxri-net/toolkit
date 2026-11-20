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
| `skills` | object | 技能级规则：键为技能名（glob 或 `re:`），值为 `{ mode?, include?, exclude? }`；命中后覆盖目录级对应字段，其余条件沿用目录级 |

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

## 技能级规则

`skills` 用于「某个技能只在部分项目启用」这类矩阵场景，优先级高于目录级：精确键优先，其次按模式匹配（最长键优先）。

```json
{
  "activation": {
    "mode": "all",
    "skills": {
      "fxri-plan-review": { "mode": "allowlist", "include": ["~/work/team/**"] }
    }
  }
}
```

未命中技能级规则的技能回落到目录级判定；`matchedRule` 以 `skill:<键>:` 前缀标明来源。

## 与规则的关系

- 作用域只决定技能是否生效与后续内容闸门的放行；**全局规则无法按目录排除**，这是 agent 的限制
- 需要项目专用规则时，把规则文件放进项目；全局规则只保留通用纪律

## 相关页面

- 命令：[scope（作用域）](../cli/scope) · [skills（技能分发）](../cli/skills)
- 参考：[配置参考](../config) · [常见问题](../faq)
