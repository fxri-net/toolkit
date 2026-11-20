---
title: 作用域（activation）
---

# 作用域（activation）

> 控制技能与规则在哪些项目 / 目录生效。**不配置时全域生效**，与历史行为一致。

## 字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `mode` | `all` / `allowlist` / `denylist` | 默认 `all`；白名单模式需命中 `include`，黑名单模式默认生效 |
| `include` | 字符串数组 | 白名单 glob；`allowlist` 必填，空数组视为不生效 |
| `exclude` | 字符串数组 | 排除 glob；优先级最高，命中即不生效 |
| `markers.include` | 字符串数组 | 启用标记文件名；配置后需在 cwd 或 git 根存在其一 |
| `markers.exclude` | 字符串数组 | 排除标记文件名；存在即不生效 |
| `gitRemotes` | 字符串数组 | git 远端 glob；`https` / `ssh` / `scp` 写法归一后匹配 |

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
按就近覆盖参与判定。工具不会主动写入这些文件。

## 路径写法

- `~` 展开为 home；相对路径按当前工作目录解析
- glob 只支持最小子集：`**`（跨层）、`*` / `?`（不跨路径分隔符），其余字符按字面匹配
- 判定按磁盘真实路径与统一大小写口径比较；符号链接与 Windows 分隔符不会造成两种结论
- 结尾 `/**` 同时命中目录自身与其下任意层级

## 与规则的关系

- 作用域只决定技能是否生效与后续内容闸门的放行；**全局规则无法按目录排除**，这是 agent 的限制
- 需要项目专用规则时，把规则文件放进项目；全局规则只保留通用纪律

## 相关页面

- 命令：[scope（作用域）](../cli/scope) · [skills（技能分发）](../cli/skills)
- 参考：[配置参考](../config) · [常见问题](../faq)
