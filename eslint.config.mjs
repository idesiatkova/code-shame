import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/**", "local_dev/**", "coverage/**"] },
  js.configs.recommended,
  {
    files: ["src/**/*.js", "test/**/*.{js,mjs}", "*.{js,mjs,cjs}"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["src/**/*.js", "test/**/*.js"],
    languageOptions: { sourceType: "commonjs" },
  },
  {
    files: ["public/app/**/*.js"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["test/**/*.mjs"],
    languageOptions: { globals: { document: "readonly", window: "readonly" } },
  },
];
