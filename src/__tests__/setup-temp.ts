// vitest 全局前置：装进程退出兜底，并在每个测试文件结束后删净本文件登记的临时目录
import { afterAll } from "vitest"
import { cleanupTrackedTempDirs, installTempCleanup, isKeepTestTemp } from "./temp-registry"

installTempCleanup()

afterAll(() => {
  if (isKeepTestTemp()) return
  const failed = cleanupTrackedTempDirs()
  if (failed.length > 0) console.warn(`⚠️ 测试临时目录清理失败（进程退出时重试）：${failed.join("、")}`)
})
