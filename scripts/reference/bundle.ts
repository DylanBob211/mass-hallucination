import type { BundleNames } from "./strudelIndex.ts";

/**
 * Every name the app's own `@strudel/web` bundle exposes, `Object.keys(module)` ∪
 * `Object.getOwnPropertyNames(Pattern.prototype)` (spec §9.1). Loaded in Node: the bundle touches
 * `window` and `document` as it loads, so this puts two bare event targets on `globalThis`.
 */
export async function bundleNames(): Promise<BundleNames> {
  Object.assign(globalThis, { window: new EventTarget(), document: new EventTarget() });
  // The file Vite serves the app (the package's `module`); Node's `main` would be another build.
  const bundle = await import("@strudel/web/dist/index.mjs");
  const exports: Record<string, unknown> = bundle;
  const { prototype } = bundle.Pattern;

  const names = new Map<string, "function" | "value">();
  for (const name of Object.keys(exports)) {
    names.set(name, typeof exports[name] === "function" ? "function" : "value");
  }
  for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(prototype))) {
    // Getters such as `firstCycleValues` run a query when read: look, don't touch.
    if (names.get(name) !== "function") {
      names.set(name, typeof descriptor.value === "function" ? "function" : "value");
    }
  }
  return names;
}
