import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXOpeningElement[name.name='Link'] > JSXAttribute[name.name='className'][value.type='Literal'][value.value=/hover:underline|text-blue-600|text-primary|text-muted-foreground/]",
          message:
            "テキストリンク風の導線は禁止です。Button(asChild) か、ボタン相当のスタイル（境界線・余白・背景）を使用してください。",
        },
        {
          selector:
            "JSXOpeningElement[name.name='a'] > JSXAttribute[name.name='className'][value.type='Literal'][value.value=/hover:underline|text-blue-600|text-primary|text-muted-foreground/]",
          message:
            "テキストリンク風の導線は禁止です。Button(asChild) か、ボタン相当のスタイル（境界線・余白・背景）を使用してください。",
        },
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.type='Identifier'][callee.property.name='queryRawUnsafe']",
          message:
            "Prisma の $queryRawUnsafe は SQL インジェクションの温床になります。タグ付き $queryRaw または型付きクエリに置き換えてください。",
        },
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.type='Identifier'][callee.property.name='executeRawUnsafe']",
          message:
            "Prisma の $executeRawUnsafe は SQL インジェクションの温床になります。タグ付き $executeRaw または型付きクエリに置き換えてください。",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    // YAML-style config; ESLint の JS パーサでは解釈できない
    "commitlint.config.js",
  ]),
]);

export default eslintConfig;
