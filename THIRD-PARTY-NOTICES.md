# 第三方声明

本文件记录随 @fxri/toolkit 分发内容中改编自第三方项目的部分及其许可。

## vercel-labs/skills

- 上游：https://github.com/vercel-labs/skills
- 许可证：MIT
- 版权：Copyright (c) 2026 Vercel, Inc.
- 本仓改编范围：
  - `src/skills/types.ts` 的 `AGENT_SKILL_DIRS` 表（agent 全局技能目录快照）；
  - `src/conventions/entry.ts` 的 `PROJECT_SKILL_DIRS` 清单（项目级技能目录候选）；
  - 由上述清单生成的 `skills/fxri-plan-task/references/skill-dirs.generated.md`。
- 本仓在改编时补充了本地核实的条目与拒绝收录口径，原表结构与字段来源仍以上游为参照。

## MIT License

Copyright (c) 2026 Vercel, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
