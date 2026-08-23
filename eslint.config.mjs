import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
  {
    rules: {
      // Builder layouts are stored as mixed JSON; `any` is used deliberately at
      // those boundaries and normalized by the lib/* helpers instead.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);

export default eslintConfig;
