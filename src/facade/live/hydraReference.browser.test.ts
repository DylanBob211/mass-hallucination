import Hydra from "hydra-synth";
import { afterAll, describe, expect, it } from "vitest";
import { hydraScope, runBody } from "./visuals";
import hydraIndex from "../../reference/hydra-index.txt?raw";

// A Hydra built as the host builds its own, on a small canvas of its own.
const hydra = new Hydra({
  canvas: document.createElement("canvas"),
  width: 8,
  height: 8,
  makeGlobal: false,
  autoLoop: false,
  detectAudio: false,
  enableStreamCapture: false,
});
afterAll(() => {
  hydra.regl.destroy();
});

const { synth } = hydra;
const source = Object.getPrototypeOf(synth.solid(0, 0, 0, 0)) as Record<string, unknown>;
const [functions = "", runtime = ""] = hydraIndex.split("## runtime");

describe("the committed Hydra index", () => {
  it("lists only functions a Visual Part can call", () => {
    const names = [...functions.matchAll(/^(\w+)\(/gm)].map(([, name]) => name ?? "");
    expect(names).toHaveLength(Number(/\((\d+), from hydra-synth/.exec(hydraIndex)?.[1]));
    const missing = names.filter(
      (name) => typeof synth[name] !== "function" && typeof source[name] !== "function",
    );
    expect(missing).toEqual([]);
  });

  it("lists a runtime a Visual Part's body can use", () => {
    expect(runtime).toContain("s0.initImage(url)");
    const body = `
      speed = 1
      bpm = 30
      const size = width * height + time
      update = (dt) => {}
      afterUpdate = (dt) => {}
      s0.clear()
      if (typeof s0.initImage !== "function" || typeof s0.initVideo !== "function") throw new Error("no init")
      osc([1, 2, 3].fast(1).smooth(1).ease('linear').offset(0.5).fit(0, 1)).add(src(o1)).out(o0)
      src(s0).out(o1)
      osc().out(o2)
      src(o3).out(o3)
      osc().out()
    `;
    expect(() => {
      runBody(
        body,
        0,
        hydraScope(synth, (_, value) => value),
      );
    }).not.toThrow();
  });
});
