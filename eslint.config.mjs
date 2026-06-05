// Flat config (ESLint 9+) for the release repo. Mirrors the Obsidian community
// review ruleset (eslint-plugin-obsidianmd recommended) so `npm run lint` here
// reflects what the reviewer sees before publishing.
//
// NOTE: This repo is GENERATED from tag-and-tally-prime (scripts/sync-to-release-
// repo.sh). Source fixes must be made in prime, not here — `src/` and `vendor/`
// are overwritten on every sync. Only config like this file persists.
//
// Severity policy matches prime/packages/plugin/eslint.config.mjs: the deep
// type-safety long-tail is downgraded to warnings (the reviewer does not block on
// them). `vendor/` is shared code that also runs on the web, so Obsidian-only
// patterns (activeDocument, window timers) are not required there.
import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  // .vue SFCs need vue-eslint-parser; the Obsidian reviewer does not lint them
  // (the TS source they emit is covered via the composables/stores).
  { ignores: ["**/*.test.ts", "**/*.vue"] },

  ...obsidianmd.configs.recommended,

  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.json" },
    },
    rules: {
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/no-explicit-any": ["warn", { fixToUnknown: false }],
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/no-misused-promises": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
      "@typescript-eslint/no-base-to-string": "warn",
      "@typescript-eslint/restrict-template-expressions": "warn",
      "@typescript-eslint/no-for-in-array": "warn",
      "no-undef": "off",
      "import/no-nodejs-modules": "warn",
      "obsidianmd/ui/sentence-case": "warn",
    },
  },

  {
    // Vendored shared code (also consumed by the web app): Obsidian-only APIs
    // are unavailable here, so these rules can't apply — keep them non-blocking.
    files: ["vendor/**/*.ts", "vendor/**/*.vue"],
    rules: {
      "obsidianmd/prefer-active-doc": "off",
      "obsidianmd/prefer-window-timers": "warn",
    },
  },
]);
