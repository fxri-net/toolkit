---
"@fxri/toolkit": patch
---

- 修改：Hook 命令写入前对 Node / CLI 路径做 realpath 归一，避免 fnm / nvm 会话级临时软链失效
- 修改：`usage hooks status` 与 `usage doctor` 检测 Hook 命令中的失效路径，并提示重跑 `hooks install`
- 修改：`usage hooks status` 对已安装但从未触发的 Hook 输出明确提示
- 修改：`usage status` / `usage info` 不再重复输出「上传」行，改为单行含待上传数量
