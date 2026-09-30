import { expect, it } from "vitest";
import { bundleNames } from "./bundle.ts";

it("names what the app's own @strudel/web bundle can reach, as functions or values", async () => {
  const names = await bundleNames();

  expect(names.get("every")).toBe("function");
  // A method but not an export (research 06).
  expect(names.get("duckorbit")).toBe("function");
  expect(names.get("sine")).toBe("value");
  expect(names.has("sidechain")).toBe(false);
  expect(names.has("whenmod")).toBe(false);
  // Documented at main, not in 1.3.0.
  expect(names.has("setcpm")).toBe(false);
});
