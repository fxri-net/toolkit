// 入口壳模板守门：正文变化会在这里以快照差异暴露，防「改了文案忘了抬版本」的静默漂移
// 确认改动后运行 pnpm bump:entry-version（次版本 +1 并刷新快照）；结构变更请人工改主版本
import { describe, expect, it } from "vitest"
import { buildEntryShell } from "../conventions/entry"

// 快照忽略版本标记：抬版本本身不应改变模板，只有正文改写才应产生差异
const normalize = (shell: string) => shell.replace(/toolkit-conventions-entry: v[\d.]+/, "toolkit-conventions-entry: v<version>")

describe("入口壳模板", () => {
  it("正文与快照一致；改正文请运行 pnpm bump:entry-version", () => {
    expect(normalize(buildEntryShell())).toMatchSnapshot()
  })
})
