// vitest 配置：默认不启用 coverage，通过 pnpm test:coverage 生成覆盖率报告
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/__tests__/**", "src/cli.ts", "src/index.ts"],
      // 覆盖率门槛：低于阈值时 pnpm test:coverage 直接失败（CI 已接入，防回归）
      thresholds: {
        statements: 80,
        branches: 65,
        functions: 80,
        lines: 82,
      },
    },
  },
})
