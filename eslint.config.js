import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import { defineConfig } from "eslint/config";
import svelte from "eslint-plugin-svelte";
import globals from "globals";
import ts from "typescript-eslint";
import svelteConfig from "./svelte.config.js";

export default defineConfig(
  { ignores: ["dist/", "coverage/", ".svelte-check/", ".scratch/", ".claude/"] },
  js.configs.recommended,
  ts.configs.strictTypeChecked,
  svelte.configs.recommended,
  prettier,
  svelte.configs.prettier,
  {
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        projectService: {
          allowDefaultProject: ["*.js", "vite.config.ts"],
        },
        extraFileExtensions: [".svelte"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["**/*.svelte", "**/*.svelte.ts"],
    languageOptions: { parserOptions: { parser: ts.parser, svelteConfig } },
  },
  {
    files: ["*.js", "*.ts"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // ADR 0006: the façade is the only place Effect meets the UI.
    files: ["src/**"],
    ignores: ["src/core/**", "src/facade/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["effect", "effect/*", "@effect/*"],
              message: "Effect lives only in the core and the façade (ADR 0006).",
            },
          ],
        },
      ],
    },
  },
);
