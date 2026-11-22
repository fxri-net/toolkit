// 断管处理：stdout / stderr 的下游提前关闭（如 `toolkit --help | head -1`）会以 EPIPE 报错，
// Node 默认把它当未捕获异常打印堆栈并以非 0 退出；这里改为静默成功退出，与常见 shell 工具一致
import { EXIT } from "./exit-codes"

// 只依赖 on / off 的最小接口，便于测试注入伪流
type ErrorEmitter = Pick<NodeJS.WriteStream, "on" | "off">

// 幂等标记：同一流只挂一次监听，反复加载入口（测试内多次运行 CLI）不会累积 listener
const GUARDED = Symbol.for("fxri.toolkit.epipe-guard")
type GuardedStream = ErrorEmitter & { [GUARDED]?: () => void }

// 安装断管守护：返回卸载函数；非 EPIPE 错误保持 Node 默认的未捕获行为，不在这里吞掉
export function installEpipeGuard(streams: ErrorEmitter[] = [process.stdout, process.stderr]): () => void {
  const disposers: Array<() => void> = []
  const onError = (error: NodeJS.ErrnoException): void => {
    if (error?.code === "EPIPE") process.exit(EXIT.OK)
    throw error
  }
  for (const stream of streams as GuardedStream[]) {
    if (stream[GUARDED]) continue
    stream.on("error", onError)
    const dispose = (): void => {
      stream.off("error", onError)
      delete stream[GUARDED]
    }
    stream[GUARDED] = dispose
    disposers.push(dispose)
  }
  return () => {
    for (const dispose of disposers) dispose()
  }
}
