#!/usr/bin/env node

import { createRequire } from "node:module"

const require = createRequire(import.meta.url)

// 版本号从 package.json 读取，避免与 package.json 重复维护
const { version } = require("../package.json")

// Windows 控制台 UTF-8 输出（best-effort：避免中文在 GBK 控制台下乱码）
function ensureUtf8() {
  if (process.platform === "win32") {
    try {
      process.stdout.setDefaultEncoding("utf8")
      process.stderr.setDefaultEncoding("utf8")
    } catch {
      // 流编码设置失败忽略，不影响主流程
    }
  }
}

// 内容闸门快速路径：仅 argv 恰为 `scope guard <技能名>` 时命中；带任何其它参数（含 --help）回落常规 CLI
function guardTarget(argv: string[]): string | null {
  if (argv.length !== 3) return null
  if (argv[0] !== "scope" || argv[1] !== "guard") return null
  const name = argv[2]
  if (!name || name.startsWith("-")) return null
  return name
}

// 入口路由：guard 走独立小产物（不解析完整 CLI 包），其余进入常规 CLI
// 两者拆成独立入口，保证 guard 的启动成本不含完整命令集的解析开销
async function main(): Promise<void> {
  ensureUtf8()
  const guardName = guardTarget(process.argv.slice(2))
  if (guardName) {
    process.exitCode = (await import("./guard-cli.js")).runGuard(guardName)
    return
  }
  await (await import("./cli-main.js")).runCli(version)
}
// 执行语义不变，仅导出 Promise 供测试 await 主流程（cli.ts 无法被静态 import，见 src/__tests__/options-matrix.test.ts）
export const cliReady = main()
