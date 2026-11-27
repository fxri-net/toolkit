// CLI 文案检查的假现场：裸枚举报出、允许形态放行、注释不参与扫描
import { describe, expect, it } from "vitest"
import { scanSource, scanText } from "../../scripts/check-cli-wording.mjs"

describe("CLI 文案中英混用检查", () => {
  it("中文句子里的裸枚举被报出", () => {
    expect(scanText("已跳过 project / local 层，仅处理 global")).not.toEqual([])
    expect(scanText("已按 off 处理")).not.toEqual([])
    expect(scanText("档位 warn 时只提示")).not.toEqual([])
  })

  it("反引号、括注、命令片段与 dotted 标识放行", () => {
    expect(scanText("改用 `--scope global`")).toEqual([])
    expect(scanText("仅支持 全局面（global）/ 项目面（project）")).toEqual([])
    expect(scanText("配置键 privacy.localPaths 保持原样")).toEqual([])
    expect(scanText("运行 toolkit upgrade --layers project")).toEqual([])
  })

  it("字符串与模板字面量参与扫描，注释不参与", () => {
    const source = [
      "// 用户主目录与 project 层只是注释",
      'const a = "跳过 project 层"',
      "const b = `仅处理 ${x} 层`",
      "const c = `仅处理 global`",
    ].join("\n")
    const hits = scanSource(source, "fixture.ts")
    expect(hits.map((hit) => hit.text)).toEqual(["跳过 project 层", "仅处理 global"])
  })
})
