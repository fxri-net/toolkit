// 文件卫生软告警（缺陷 15）：BOM / 行尾空白 / 换行符混用统一为 warn 且不阻断；
// 统一 CRLF 属 Windows 检出常态，不告警（仅同文件混用才提示）
import { describe, it, expect } from "vitest"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { makeTasksDir } from "./helpers"
import { validateTasks } from "../tasks/validate"

// 写 active 任务文件到 {YYYYMM}/ 月份子目录，返回文件绝对路径（原文写入，不做换行/BOM 归一）
function writeRaw(dir: string, name: string, raw: string): string {
  const p = join(dir, "active", "202609", name)
  mkdirSync(join(dir, "active", "202609"), { recursive: true })
  writeFileSync(p, raw, "utf8")
  return p
}

// 合法 frontmatter 骨架（待办态，无 completed 也可）；sep 为换行序列，便于构造 CRLF / LF / 混用文本
function taskRaw(sep: string, body = "# t"): string {
  return [`---`, `owner: 唐启云`, `status: 待办`, `created: 20260903`, `updated: 20260903`, `completed: ''`, `depends_on: []`, `scope: 测`, `---`, ``, body].join(sep) + sep
}

describe("文件卫生软告警", () => {
  it("含 UTF-8 BOM：告警但不阻断（errorCount 仍为 0）", () => {
    const dir = makeTasksDir("tk-hyg-")
    writeRaw(dir, "20260903-唐启云-BOM.md", "\uFEFF" + taskRaw("\n"))
    const result = validateTasks(dir)
    expect(result.errorCount).toBe(0)
    const hit = result.issues.find((i) => i.message.includes("BOM"))
    expect(hit?.level).toBe("warn")
    expect(hit?.line).toBe(1)
    rmSync(dir, { recursive: true, force: true })
  })

  it("行尾空白：定位到具体行并告警", () => {
    const dir = makeTasksDir("tk-hyg-")
    writeRaw(dir, "20260903-唐启云-行尾.md", taskRaw("\n", "# t\n正文有尾随空格   "))
    const hit = validateTasks(dir).issues.find((i) => i.message.includes("行尾有多余空白"))
    expect(hit?.level).toBe("warn")
    // 骨架 10 行 + 正文首行「# t」为第 11 行，尾随空格所在正文行为第 12 行
    expect(hit?.line).toBe(12)
    rmSync(dir, { recursive: true, force: true })
  })

  it("换行符混用：同文件含 CRLF 与 LF 时告警", () => {
    const dir = makeTasksDir("tk-hyg-")
    // 正文用 CRLF、正文内嵌一段 LF，构成混用
    writeRaw(dir, "20260903-唐启云-混用.md", taskRaw("\r\n", "# t\n正文"))
    const hit = validateTasks(dir).issues.find((i) => i.message.includes("换行符混用"))
    expect(hit?.level).toBe("warn")
    expect(hit?.line).toBeGreaterThan(0)
    rmSync(dir, { recursive: true, force: true })
  })

  it("统一 CRLF：不告警（Windows 检出常态，避免跨平台误报）", () => {
    const dir = makeTasksDir("tk-hyg-")
    writeRaw(dir, "20260903-唐启云-统一CRLF.md", taskRaw("\r\n"))
    const issues = validateTasks(dir).issues
    expect(issues.some((i) => i.message.includes("换行符混用"))).toBe(false)
    expect(issues.some((i) => i.message.includes("BOM"))).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })

  it("无 frontmatter 文件：既报缺少 frontmatter 也报卫生问题", () => {
    const dir = makeTasksDir("tk-hyg-")
    writeRaw(dir, "20260903-唐启云-裸文本.md", "\uFEFF这是无 frontmatter 的文本\n")
    const issues = validateTasks(dir).issues
    expect(issues.some((i) => i.level === "error" && i.message.includes("缺少 frontmatter"))).toBe(true)
    expect(issues.some((i) => i.message.includes("BOM"))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })
})
