// UTF-8 BOM 兼容：Windows PowerShell Set-Content 默认写 BOM，任务文件与归档文件解析不应被 BOM 干扰
import { describe, it, expect } from "vitest"
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { validateTasks } from "../tasks/validate"
import { parseArchiveBlocks } from "../tasks/archive-block"
import { parseFrontmatter } from "../tasks/parse"

const TASK = `---\nowner: 唐启云\nstatus: 已完成\ncreated: 20260905\nupdated: 20260905\ncompleted: '2026-09-05 01:00'\ndepends_on: []\nscope: x\n---\n\n# t\n`

describe("UTF-8 BOM 兼容", () => {
  it("带 BOM 的任务文件不误报缺少 frontmatter，字段解析正常", () => {
    const dir = mkdtempSync(join(tmpdir(), "tk-bom-"))
    mkdirSync(join(dir, "active", "202609"), { recursive: true })
    // "\uFEFF" 前缀写盘即产生 EF BB BF 字节序（模拟 PowerShell utf8 写出）
    writeFileSync(join(dir, "active", "202609", "20260905-唐启云-BOM任务.md"), "\uFEFF" + TASK, "utf8")
    const result = validateTasks(dir)
    expect(result.errorCount).toBe(0)
    rmSync(dir, { recursive: true, force: true })
  })

  it("带 BOM 的归档内容块解析正常（标题与完成时间不受首字符干扰）", () => {
    const { header, blocks } = parseArchiveBlocks("\uFEFF# 20260905 归档\n\n## 20260905-唐启云-任务\n\n> 负责人：唐启云　状态：已完成　范围：x　完成时间：2026-09-05 01:00\n\n正文\n")
    expect(header).toBe("# 20260905 归档")
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.title).toBe("20260905-唐启云-任务")
    expect(blocks[0]?.completed).toBe("2026-09-05 01:00")
  })

  it("parseFrontmatter 对带 BOM 内容返回字段而非空对象", () => {
    const fm = parseFrontmatter("\uFEFF---\nstatus: 已完成\n---\n\n# t\n")
    expect(fm.status).toBe("已完成")
  })
})
