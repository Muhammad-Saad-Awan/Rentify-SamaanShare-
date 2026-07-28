import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // Global ignores must be first and separate
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "node_modules/**",
      "next-env.d.ts",
      "*.config.mjs",
      // Generated Prisma Client - not ours to lint
      "src/generated/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript", "prettier"),
  {
    rules: {
      // Allow console.warn and console.error
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
];

export default eslintConfig;
