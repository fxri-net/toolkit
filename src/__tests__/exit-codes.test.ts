// 退出码单一真源：常量值、文档表覆盖与兼容导出的一致性
import { spawnSync } from "node:child_process"
import { describe, expect, it } from "vitest"
import { childExitCode, EXIT, EXIT_CODE_TABLE } from "../exit-codes"
import { CANCEL_EXIT_CODE, INTERACTIVE_EXIT } from "../prompts"

describe("退出码单一真源", () => {
  it("常量值固定", () => {
    expect(EXIT.OK).toBe(0)
    expect(EXIT.FAIL).toBe(1)
    expect(EXIT.INTERACTIVE).toBe(2)
    expect(EXIT.USAGE).toBe(2)
    expect(EXIT.GUARD_INACTIVE).toBe(3)
    expect(EXIT.CANCEL).toBe(130)
  })

  it("文档表与常量数值一一对应，且无重复行", () => {
    const codes = EXIT_CODE_TABLE.map((row) => row.code)
    expect(new Set(codes).size).toBe(codes.length)
    const unique = [...new Set(Object.values(EXIT))].sort((a, b) => a - b)
    expect([...codes].sort((a, b) => a - b)).toEqual(unique)
    for (const row of EXIT_CODE_TABLE) {
      expect(row.name.trim()).not.toBe("")
      expect(row.meaning.trim()).not.toBe("")
      expect(row.scene.trim()).not.toBe("")
    }
  })

  it("兼容导出与真源同值", () => {
    expect(CANCEL_EXIT_CODE).toBe(EXIT.CANCEL)
    expect(INTERACTIVE_EXIT).toBe(EXIT.INTERACTIVE)
  })
})

describe("子进程退出码透传", () => {
  it("正常退出原样返回，被信号终止按 128 + 信号编号", () => {
    expect(childExitCode({ status: 0 })).toBe(0)
    expect(childExitCode({ status: 7 })).toBe(7)
    expect(childExitCode({ status: null, signal: "SIGTERM" })).toBe(143)
    expect(childExitCode({ status: null, signal: "SIGKILL" })).toBe(137)
    expect(childExitCode({ status: null, signal: "SIGINT" })).toBe(130)
  })

  it("未知信号与取值缺失回落失败码，不做编号猜测", () => {
    expect(childExitCode({ status: null, signal: "SIGUSR1" })).toBe(1)
    expect(childExitCode({ status: null, signal: null })).toBe(1)
  })

  // 真子进程核对 spawnSync 的 signal 字段与编号映射：Windows 无 POSIX 信号语义，跳过
  it.skipIf(process.platform === "win32")("子进程被 SIGTERM 终止时映射为 143", () => {
    const result = spawnSync(process.execPath, ["-e", "process.kill(process.pid, 'SIGTERM')"])
    expect(result.signal).toBe("SIGTERM")
    expect(childExitCode(result)).toBe(143)
  })
})
