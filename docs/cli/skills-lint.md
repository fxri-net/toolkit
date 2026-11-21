---
title: skills lint（技能校验）
---

# skills lint（技能校验）

> 可对任意技能目录运行的只读规范校验；规范真源在 toolkit，产品仓只调用命令、不复制规则。

```bash
toolkit skills lint                     # 校验本包 skills/（缺省档：150 行 / 8000 字符告警，200 行 / 12000 字符报错）
toolkit skills lint skills/ --base HEAD # 技能内容相对基准有变更时，版本必须已递增
toolkit skills lint --dir ../other/skills --strict # 外部仓技能目录：告警按失败处理
toolkit skills lint skills/ --format json # JSON 输出：files、issues（带 level）与 summary
toolkit skills lint skills/ --ignore 'fxri-temp-*' # 跳过误报技能（按目录名或相对路径）
```

缺省检查本包 `skills/`，位置参数与 `--dir` 可同时给出以支持多根；目录本身就是技能或目录下逐个技能均可。

## 检查项

- **目录与 frontmatter**：目录名小写 kebab 且带 `--prefix` 前缀（默认 `fxri-`）；
  必填 `name` / `description` / `license` / `metadata.version` / `metadata.tier` / `metadata.author` / `metadata.source`；
  `tier` 仅 `core` / `optional`；`name` 与目录名一致
- **版本双写**：`metadata.version` 为严格 `x.y.z`，正文首部「本技能版本」必须存在且与 frontmatter 一致（缺失按错误处理）
- **入口篇幅**：超告警线只告警，超硬上限报错；默认 150 行 / 8000 字符告警、200 行 / 12000 字符报错，
  `--warn-lines` / `--max-lines` / `--budget` 可调，字符告警线按硬上限的 2/3 推导；`references/` 不计入
- **references**：相对引用必须可达，且不得越出本次检查根（同一检查根内的跨技能引用允许）；
  `references/` 下未被任何文档引用的文件只告警
- **敏感信息**：私钥块、常见令牌前缀、机器相关绝对路径（盘符 + 用户目录、`/Users/`、`/home/`）命中即错误；
  通用占位示例（如 `/home/user`、`C:\Users\<name>`）放行
- **重复与基准**：跨检查根同名技能报错；传 `--base <ref>` 时，技能内容相对基准有变更（行尾归一后比较）则版本必须更高

`--ignore` 按技能目录名或相对检查根的路径匹配；`--prefix` 传空串表示不要求前缀。
敏感信息误报同样用 `--ignore` 跳过整个技能，不提供关闭整类检查的开关。

## 退出码与输出

| 退出码 | 含义 |
| --- | --- |
| `0` | 无问题 |
| `1` | 存在错误；`--strict` 下告警同样按失败处理 |
| `2` | 用法错误（非法数值、`--warn-lines` 大于 `--max-lines`、空 `--base` 等） |

stdout 只放校验数据（文本或 JSON），诊断信息写 stderr。
非 git 仓库、浅克隆缺基准或基准不存在时，`--base` 的递增校验会被跳过并在 stderr 说明原因，不静默通过。

## 外部仓接入

工具仓在 `verify` 中调用（不新增仓内脚本）：

```bash
toolkit skills lint skills/ --base <ref>
toolkit skills bump --dir skills --all patch
```

第一条守住规范与版本递增；第二条在发布前统一递增技能版本（版本独立于产品包版本）。

## 相关页面

- 参考：[技能分发](./skills) · [技能来源](./skills-sources) · [退出码](./exit-codes)
