import registry from "hydra-synth/src/glsl/glsl-functions.js";
import { describe, expect, it } from "vitest";
import { hydraIndex, type HydraFunction } from "./hydraIndex.ts";

const fn = (name: string, type: string, inputs: HydraFunction["inputs"] = []): HydraFunction => ({
  name,
  type,
  inputs,
});

describe("hydraIndex", () => {
  it("writes each function as its inputs with their defaults, under its type", () => {
    expect(
      hydraIndex([
        fn("osc", "src", [
          { name: "frequency", type: "float", default: 60 },
          { name: "sync", type: "float", default: 0.1 },
        ]),
        fn("kaleid", "coord", [{ name: "nSides", type: "float", default: 4 }]),
      ]),
    ).toEqual(["## sources", "osc(frequency=60, sync=0.1)", "## geometry", "kaleid(nSides=4)"]);
  });

  it("gives blend and modulate functions the texture they take first", () => {
    expect(
      hydraIndex([
        fn("add", "combine", [{ name: "amount", type: "float", default: 1 }]),
        fn("modulate", "combineCoord", [{ name: "amount", type: "float", default: 0.1 }]),
      ]),
    ).toEqual([
      "## blend (texture first)",
      "add(tex, amount=1)",
      "## modulate (texture first)",
      "modulate(tex, amount=0.1)",
    ]);
  });

  it("writes a texture input without its default", () => {
    expect(
      hydraIndex([fn("src", "src", [{ name: "tex", type: "sampler2D", default: null }])]),
    ).toEqual(["## sources", "src(tex)"]);
  });

  it("fails on a type it does not know, rather than leave a function out", () => {
    expect(() => hydraIndex([fn("blur", "renderpass")])).toThrow(/blur.*renderpass/);
  });

  it("lists all 52 functions of hydra-synth's registry", () => {
    const lines = hydraIndex(registry());
    expect(lines.filter((line) => !line.startsWith("## "))).toHaveLength(52);
    expect(lines).toContain("modulateRepeatY(tex, reps=3, offset=0.5)");
    expect(lines).toContain("sum(scale=1)");
    expect(lines.join("\n")).not.toMatch(/blur|mirror/);
  });
});
