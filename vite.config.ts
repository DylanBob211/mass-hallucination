import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  plugins: [tailwindcss(), svelte()],
  // @strudel/core@1.2.6 reads process.env.NODE_ENV in its errorLogger; without this it throws a
  // ReferenceError in the browser (spec §3).
  // hydra-synth's `right-now` reads Node's `global`.
  define: { "process.env.NODE_ENV": JSON.stringify(mode), global: "globalThis" },
  // Strudel and Hydra are imported lazily, on the first gesture. Pre-bundling them up front stops
  // Vite finding them then, re-optimising, and reloading the page under the performer's first
  // Ctrl-Enter.
  optimizeDeps: { include: ["@strudel/web", "hydra-synth"] },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
          exclude: ["src/**/*.browser.test.ts", "src/**/*.real.test.ts"],
        },
      },
      {
        extends: true,
        // Against the real API, and billed: only `pnpm test:real` runs these, never `pnpm check`.
        test: {
          name: "real",
          environment: "node",
          include: ["src/**/*.real.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.ts"],
          browser: {
            enabled: true,
            provider: "playwright",
            headless: true,
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
}));
