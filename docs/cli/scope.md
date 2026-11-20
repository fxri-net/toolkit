---
title: scope（作用域）
---

# scope（作用域）

> 按项目 / 目录决定技能与规则是否生效。默认全域生效；只有写了 `activation` 配置才出现局部生效。本页命令只读，不写配置。

## 用途与场景

- 全局装了 CLI、技能与规则，但只想在指定项目 / 父目录生效，或排除某些项目 / 目录
- 排查「为什么这个目录生效 / 不生效」：看命中的配置文件与规则
- 团队自建项目层配置时，同样按就近覆盖参与判定

## 常用命令

```bash
toolkit scope status                  # 当前目录的判定与原因
toolkit scope status --format json    # 给 AI / 脚本消费
toolkit scope list                    # 规则、来源与优先级
```

## 判定顺序

1. `exclude` 路径规则命中 → 不生效（优先级最高）
2. `markers.exclude` 标记存在 → 不生效
3. `markers.include` 已配置但一个都不存在 → 不生效
4. `gitRemotes` 已配置但远端未命中 → 不生效
5. `mode = allowlist`：未命中 `include` → 不生效；`mode = denylist` / `all`：生效

## 边界

- 默认 `mode = all`，不配置时与历史行为完全一致
- 只影响技能与后续的内容闸门，不影响 `toolkit` 命令本身（命令是显式调用的）
- 全局规则无法按目录排除（agent 限制）；项目专用规则需落在项目内
- 工具不创建、不修改项目内配置或标记；项目层配置由用户自行写入时正常参与

## 相关页面

- 配置：[作用域（activation）](../config/activation) · [配置参考](../config)
- 参考：[CLI 参考](../cli) · [技能分发](./skills)
