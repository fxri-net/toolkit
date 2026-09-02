import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/cli.ts"], // 入口文件
  outDir: "dist", // 输出目录
  splitting: false, // 是否开启代码分割
  clean: true, // 是否清理dist目录
  dts: false, // 是否生成.d.ts类型文件
  format: ["esm"], // 输出ESM格式
  minify: process.env.NODE_ENV === "production",
  target: "node20" // Node.js版本目标
})
