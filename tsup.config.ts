import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"], // 入口文件
  outDir: "dist", // 输出目录
  splitting: false, // 是否开启代码分割
  clean: true, // 是否清理dist目录
  dts: true, // 是否生成.d.ts类型文件
  format: ["cjs", "esm"], // 输出CommonJS和ESM双格式
  external: ["@changesets/cli", "commander"], // 运行时依赖不打包进产物
  shims: true, // 为 cjs 输出提供 import.meta 等 shim
  minify: process.env.NODE_ENV === "production",
  target: "node20" // Node.js版本目标
})
