---
"@fxri/toolkit": patch
---

修改：CLI 解析错误文案改为中文并附帮助指引

- 未知命令、未知选项、参数个数不符统一输出 `⚠️` 开头的中文提示（如「未知命令「zzzz」。」），并附一行 `运行 toolkit --help 查看可用命令`；相似命令/选项提示（原 `(Did you mean skills?)`）一并转中文，退出码仍为 `1`
- 修掉 commander 自行写 stderr 导致的英文原文残留，解析错误不再出现英文与中文两行并排
- `changelog` 透传给 changesets 的英文输出不受影响
