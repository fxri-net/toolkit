---
"@fxri/toolkit": patch
---

- 修复：`toolkit trash restore` 遇到悬空链接按跳过回报，不再重建悬空链接
- 修改：恢复逐项继续，单项失败记入 `failed` 并保留条目（`status` 标记 `partial`），`trash list` 同步展示状态
