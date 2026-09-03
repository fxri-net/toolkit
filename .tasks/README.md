# 任务管理规范（.tasks）

> @fxri/toolkit 项目自身的任务与归档区，规范与本工具 `tasks` 域一致。

## 目录结构

```
.tasks/
├── README.md          # 本规范
├── active/            # 实时任务（未完成）
│   └── 202609/        # 年月（YYYYMM，直接拼）
│       └── 20260902-唐启云-跨环境兼容加固.md
└── archive/           # 任务归档（已完成）
    └── 202609/
        └── 20260902.md
```

## 命名规范

- active 任务文件：`年月日-用户名-任务简述.md`（一任务一文件）
- archive 归档文件：`年月日.md`（按完成时间划分）
- 年月日 / 年月均直接拼（`20260902` / `202609`），不加 `-`

## 任务文件模板

```markdown
---
owner: 唐启云            # 负责人（git 用户名）
status: 进行中          # 待办 / 进行中 / 已完成 / 阻塞 / 已放弃
created: 20260902
updated: 20260902
completed: ''           # 完成时间（YYYY-MM-DD HH:mm），已完成/已放弃时必填
depends_on: []          # 依赖的任务文件
scope: toolkit          # 影响范围
---

# 任务标题
```

## 归档

- `toolkit tasks` 输出任务总览
- `toolkit tasks check` 校验 active（frontmatter 合法性、重名、依赖闭环、未闭合待办）
- `toolkit tasks archive` 归档已完成任务（`status` 为「已完成 / 已放弃」且带 `completed`）；`--dry-run` 预演
- `toolkit tasks normalize` 检查归档块（元数据四字段、日期漂移、排序）；`--fix` 补齐元数据 + 降序重排
- 归档文件按完成时间日期划分，文件内任务按完成时间**降序**排序（最新在前）
- 归档应先于 git 提交，保证任务记录与代码变更同批入库，不产生孤立提交
