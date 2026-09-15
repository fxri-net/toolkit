// 镜像脚本回归：CRLF 检出与结构异常两类缺陷须被覆盖，防止站点更新日志页静默产出错页
import { describe, it, expect } from "vitest"
import { buildPage } from "../../scripts/sync-changelog-doc.mjs"

// 最小合法 CHANGELOG：H1 标题 + 一个版本块
const minimal = "# pkg\n\n## 1.0.0\n\n### ✨ 新增功能\n\n- 新增：甲\n"

describe("buildPage：更新日志镜像转换", () => {
  it("CRLF 输入产出 LF 页：源标题被剥离、版本块保留", () => {
    const page = buildPage(minimal.replace(/\n/g, "\r\n"))
    expect(page).not.toContain("\r")
    expect(page).toContain("# 更新日志")
    expect(page).not.toContain("# pkg")
    expect(page).toContain("## 1.0.0")
  })

  it("BOM 前缀不影响首行 H1 判定", () => {
    expect(buildPage(`\uFEFF${minimal}`)).toContain("## 1.0.0")
  })

  it("首行非 H1 时抛错：避免把源标题带进镜像页", () => {
    expect(() => buildPage("## 1.0.0\n\n- 条目\n")).toThrow(/首行不是 H1/)
  })

  it("无版本块时抛错：结构异常时不静默产出错页", () => {
    expect(() => buildPage("# pkg\n\n> 无版本块\n")).toThrow(/未发现/)
  })

  it("幂等：同一输入两次转换结果一致", () => {
    expect(buildPage(minimal)).toBe(buildPage(minimal))
  })
})
