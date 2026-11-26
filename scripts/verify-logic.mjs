// 构建触发面纯函数：只有会影响 dist 的文件才算构建改动，供 verify.mjs 与单测共用
// 测试文件不参与 tsup 入口，改测试不重建；源码、构建配置与 tsconfig 仍触发
export const BUILD_TOUCH_FILES = new Set(["package.json", "pnpm-lock.yaml", "tsup.config.ts", "tsup.dev.config.ts"])

// 测试路径：任意层级的 __tests__ 目录，或 *.test.ts 文件
export function isTestPath(name) {
  return name.startsWith("src/__tests__/") || name.includes("/__tests__/") || name.endsWith(".test.ts")
}

// 单个改动文件是否触发构建
export function touchesBuild(name) {
  if (name.startsWith("src/")) return !isTestPath(name)
  if (BUILD_TOUCH_FILES.has(name)) return true
  return /^tsconfig[^/]*\.json$/.test(name)
}
