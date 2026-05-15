import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Legacy/Browser scripts that shouldn't be linted as Node/TS
    "temp_check.js",
    "scripts/watchlist-inline-script.js",
    "scripts/gen.js",
    "scripts/gen-watchlist.js",
    "scratch/**",
  ]),
]);

export default eslintConfig;
