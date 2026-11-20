// 运行时下限：Node 版本门槛与比较的单一真源
// 刻意不依赖交互组件，供 cli 快速路径与常规 CLI 共用，避免仅做版本判断就加载重型模块
export const MIN_NODE = { major: 18, minor: 17 } as const

// 判断 Node 版本是否达到下限：version 缺省取当前进程，解析失败按不满足处理
export function nodeVersionAtLeast(min: { major: number; minor: number }, version = process.versions.node): boolean {
  const [major = 0, minor = 0] = version.split(".").map((part) => Number(part))
  return major > min.major || (major === min.major && minor >= min.minor)
}
