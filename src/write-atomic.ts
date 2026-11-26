// 原子写文件：先写同目录临时文件再 rename，降低写一半进程崩溃产生半截文件的风险
// 临时文件名字带随机段并独占创建（wx），避免临时名被预置抢占；文件权限沿用平台默认
import { writeFileSync, renameSync } from "node:fs"
import { dirname, join } from "node:path"

export function writeFileAtomic(file: string, content: string | Buffer): void {
  const tmp = join(dirname(file), `.tmp-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`)
  writeFileSync(tmp, content, { flag: "wx" })
  renameSync(tmp, file)
}
