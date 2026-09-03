// ESLint 扁平配置：@eslint/js 推荐 + typescript-eslint 推荐
import js from "@eslint/js"
import tseslint from "typescript-eslint"

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "coverage/**", ".toolkit-verify/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // exceljs 为 CJS namespace 类型，跨模块 interop 需 any 兜底（import.ts / export.ts 已注释说明用途）
      "@typescript-eslint/no-explicit-any": "off",
      // 元数据行（负责人/状态/范围/完成时间）需用全角空格分隔，模板字符串中属有意书写
      "no-irregular-whitespace": "off",
      // 归档/修复的排他锁：openSync 返回值仅作 fd 占用标记，读与否不影响语义
      "no-useless-assignment": "off",
    },
  },
)
