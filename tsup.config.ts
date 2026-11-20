import { defineConfig } from "tsup"

export default defineConfig({
  // 入口文件：cli 仅做路由，guard 与常规 CLI 各自独立成包，避免快速路径解析完整命令集
  entry: ["src/index.ts", "src/cli.ts", "src/cli-main.ts", "src/guard-cli.ts"],
  outDir: "dist", // 输出目录
  splitting: false, // 是否开启代码分割
  clean: true, // 是否清理dist目录
  dts: true, // 是否生成.d.ts类型文件
  format: ["cjs", "esm"], // 输出CommonJS和ESM双格式
  // 运行时依赖与同仓库的分包入口都不打包进产物：cli 仅保留路由，guard / 常规 CLI 各自按需加载
  external: ["@changesets/cli", "commander", "./cli-main.js", "./guard-cli.js"],
  shims: true, // 为 cjs 输出提供 import.meta 等 shim
  minify: process.env.NODE_ENV === "production",
  target: "node18" // Node.js 运行时下限（与 package.json engines 对齐）
})
