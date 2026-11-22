// 断管守护：EPIPE 静默成功退出、其余错误维持抛出、重复安装不累积监听
import { EventEmitter } from "node:events"
import { afterEach, describe, expect, it, vi } from "vitest"
import { installEpipeGuard } from "../epipe"

// 伪流：只需 on / off，足以模拟 stdout / stderr 的 error 事件
function fakeStream(): NodeJS.WriteStream {
  return new EventEmitter() as unknown as NodeJS.WriteStream
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("断管守护", () => {
  it("EPIPE 以 0 退出，不打印堆栈", () => {
    // 真实 process.exit 不返回：用抛出哨兵模拟，避免把后续代码当成可执行路径
    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`EXIT:${code}`)
    }) as never)
    const stream = fakeStream()
    installEpipeGuard([stream])
    const error = Object.assign(new Error("write EPIPE"), { code: "EPIPE" })
    expect(() => stream.emit("error", error)).toThrow("EXIT:0")
    expect(exit).toHaveBeenCalledWith(0)
  })

  it("非 EPIPE 错误保持默认的抛出行为", () => {
    const stream = fakeStream()
    installEpipeGuard([stream])
    expect(() => stream.emit("error", Object.assign(new Error("bad"), { code: "EIO" }))).toThrow("bad")
  })

  it("同一流重复安装只保留一个监听，卸载后不再拦截", () => {
    const stream = fakeStream()
    const disposeFirst = installEpipeGuard([stream])
    const disposeSecond = installEpipeGuard([stream])
    expect(stream.listenerCount("error")).toBe(1)
    disposeSecond()
    disposeFirst()
    expect(stream.listenerCount("error")).toBe(0)
  })
})
