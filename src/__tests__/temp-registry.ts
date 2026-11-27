// 测试临时目录登记表：用例级删除漏写或被中断时，由文件结束与进程退出兜底删除，避免在 %TEMP% 永久残留
import { rmSync } from "node:fs"

// globalThis 上的登记键：vitest 默认按文件隔离模块，挂全局对象才能在同一进程内跨文件复用
const REGISTRY_KEY = Symbol.for("fxts-tk.tempDirs")

// 登记表形态：dirs 为待删目录，hooked 保证退出钩子只装一次
interface TempRegistry {
  dirs: Set<string>
  hooked: boolean
}

// 取当前进程的登记表，首次访问时创建
function registry(): TempRegistry {
  const holder = globalThis as typeof globalThis & Record<symbol, TempRegistry | undefined>
  holder[REGISTRY_KEY] ??= { dirs: new Set(), hooked: false }
  return holder[REGISTRY_KEY]!
}

// 登记临时目录并原样返回，便于在创建处链式使用
export function trackTempDir(dir: string): string {
  registry().dirs.add(dir)
  return dir
}

// 删除全部已登记目录；删除失败的保留在表中并返回，交由下一次兜底重试
export function cleanupTrackedTempDirs(): string[] {
  const { dirs } = registry()
  const failed: string[] = []
  for (const dir of [...dirs]) {
    try {
      rmSync(dir, { recursive: true, force: true })
      dirs.delete(dir)
    } catch {
      failed.push(dir)
    }
  }
  return failed
}

// 装进程退出兜底：只清本进程登记的目录；排查现场时按 FX_TOOLKIT_KEEP_TEST_TEMP 保留并打印路径
// 不拦截 SIGINT / SIGTERM：那会抢走 vitest 自身的关闭流程，强杀场景交由跨运行过期清扫兜住
export function installTempCleanup(): void {
  const reg = registry()
  if (reg.hooked) return
  reg.hooked = true
  process.once("exit", () => {
    if (process.env.FX_TOOLKIT_KEEP_TEST_TEMP) {
      for (const dir of reg.dirs) console.warn(`⚠️ 保留测试临时目录：${dir}`)
      return
    }
    cleanupTrackedTempDirs()
  })
}
