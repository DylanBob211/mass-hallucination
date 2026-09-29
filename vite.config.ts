import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  plugins: [tailwindcss(), svelte()],
  // @strudel/core@1.2.6 reads process.env.NODE_ENV in its errorLogger; without this it throws a
  // ReferenceError in the browser (spec §3).
  define: { "process.env.NODE_ENV": JSON.stringify(mode) },
  // Strudel is imported lazily, on the first gesture. Pre-bundling it up front stops Vite finding it
  // then, re-optimising, and reloading the page under the performer's first Ctrl-Enter.
  optimizeDeps: { include: ["@strudel/web"] },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.browser.test.ts"],
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
