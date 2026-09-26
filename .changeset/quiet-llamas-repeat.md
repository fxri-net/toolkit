---
"@fxri/toolkit": minor
---

- 新增 `toolkit conventions` 命令域：`upgrade` 把 v1 规范载体升级为 v2（发稳定 ID `C-<n>`、演进记录切独立 `history.md`、内部引用改稳定 ID），`status` 做只读体检（形态 / 索引 / 入口层三块，只报不改，退出码恒 0）
  - `upgrade` 幂等、先判后写，异常形态在写盘前拒绝；已为 v2 时返回 `already-v2`；`--dry-run` 可预演
- 规范载体引入结构 v2：`index.md` 首行为形态标记、索引表首列改为稳定 ID `C-<n>`（去补零、只追加不重排不回收）、演进记录抽为独立 `history.md`（只追加、不改旧行）；v1 三态兼容读取
- `toolkit init` 生成 v2 载体骨架（`index.md` + `history.md`）与项目级技能入口壳，并逐项报告实际动作（新建 / 保持 / 追加 / 跳过）
- `toolkit tasks check` 对载体形态异常与技能入口壳给出软告警（壳标记版本不一致、或被 gitignore 覆盖不会随 git 分发）
