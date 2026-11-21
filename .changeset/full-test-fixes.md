---
"@fxri/toolkit": patch
---

- 修复：项目面分发计划把真源目录判成仓库根，安装完成后误报全部技能待收敛
- 修复：分发计划把未选择的已登记技能误报为「来源不可解析」
- 修复：Node API 未导出文档承诺的 `resolveTasksDir` 与 `configStatus`
- 修复：`toolkit help --help` 把 `--help` 当作命令名并以非 0 退出；根域与 `scope policy`、`scope skills` 同步修正
- 文档：明确多语言 CHANGELOG 镜像在 `--lang` 非默认语言时追加语言后缀
