// 原子写文件：先写同目录临时文件再 rename，降低写一半进程崩溃产生半截文件的风险
// 临时文件独占创建（wx）+ 0600：名字带随机段不可预置，写完的正式文件也不被同机其他用户读取（Windows 忽略 mode）
import { writeFileSync, renameSync } from "node:fs"
import { dirname, join } from "node:path"

export function writeFileAtomic(file: string, content: string | Buffer): void {
  const tmp = join(dirname(file), `.tmp-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`)
  writeFileSync(tmp, content, { mode: 0o600, flag: "wx" })
  renameSync(tmp, file)
}
