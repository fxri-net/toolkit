---
title: redact（隐私脱敏）
---

# redact：隐私脱敏

> 内置规则清单、按名禁用与自定义规则；三层合并语义见[配置参考总览](../config#合并语义)。

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | 总开关；被 CLI `--redact/--no-redact` 与环境变量 `FX_REDACT` 覆盖 |
| `disable` | string[] | `[]` | 按 `name` 禁用内置规则（如 `["手机号"]`），被禁用规则不再匹配，对应信息原样保留 |
| `rules` | object[] | `[]` | 自定义规则，**优先于内置**；同 `name` 可覆盖内置 |

自定义规则结构：

```json
{
  "redact": {
    "rules": [
      { "name": "自定义码", "pattern": "cod-[0-9]{6}", "flags": "i", "replacement": "cod-******" }
    ]
  }
}
```

| 字段 | 说明 |
| --- | --- |
| `name` | 规则名；与内置同名即覆盖，也可放进 `disable` 引用 |
| `pattern` | 正则字符串 |
| `flags` | 正则标志（可选，如 `i`） |
| `replacement` | 替换文本（可选，默认整体掩码） |

内置规则：`内网URL`（含端口）、`邮箱`、`JWT`、`AWS密钥`、`GitHub密钥`、`GitHub细粒度密钥`、`OpenAI密钥`、`OpenAI项目密钥`、`Slack密钥`、`Slack应用令牌`、`手机号`、`身份证`、`IPv4`。密钥类带长度门槛避免误伤。

## 相关页面

- 参考：[配置参考总览](../config) · [完整攻略 · 隐私脱敏](../guide#隐私脱敏)
