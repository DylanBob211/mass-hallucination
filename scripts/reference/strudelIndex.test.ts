import { describe, expect, it } from "vitest";
import { strudelIndex, type DocEntry } from "./strudelIndex.ts";

const duckorbit: DocEntry = {
  name: "duckorbit",
  kind: "member",
  description:
    "<p>Modulate the amplitude of an orbit to create a &quot;sidechain&quot; like effect.</p>\n<p>Can be applied to multiple orbits with the ':' mininotation, e.g. <code>duckorbit(&quot;2:3&quot;)</code></p>",
  synonyms: ["duck"],
  params: [{ name: "orbit" }],
};

describe("strudelIndex", () => {
  it("lists a documented name the bundle can call as signature, synonyms and first sentence", () => {
    expect(strudelIndex([duckorbit], new Map([["duckorbit", "function"]]))).toEqual([
      'duckorbit(orbit) =duck — Modulate the amplitude of an orbit to create a "sidechain" like effect.',
    ]);
  });

  it("leaves out what the bundle cannot call, and what autocomplete leaves out", () => {
    const names = new Map([
      ["_hidden", "function"],
      ["core", "function"],
      ["fast", "function"],
    ] as const);
    const docs: ReadonlyArray<DocEntry> = [
      { name: "all", kind: "function", description: "<p>Applies to all.</p>" },
      { name: "_hidden", kind: "function", description: "<p>Internal.</p>" },
      { name: "core", kind: "package", description: "<p>The package.</p>" },
      { name: "fast", kind: "member", description: "<p>Speed up a pattern.</p>" },
    ];

    expect(strudelIndex(docs, names)).toEqual(["fast() — Speed up a pattern."]);
  });

  it("does not end a sentence at i.e. or e.g.", () => {
    const speed: DocEntry = {
      name: "speed",
      kind: "member",
      description:
        "<p>Changes the speed of sample playback, i.e. a cheap way of changing pitch. Negative values play backwards.</p>",
    };

    expect(strudelIndex([speed], new Map([["speed", "function"]]))).toEqual([
      "speed() — Changes the speed of sample playback, i.e. a cheap way of changing pitch.",
    ]);
  });

  it("leaves out an undocumented entry already listed as another name's synonym", () => {
    const docs: ReadonlyArray<DocEntry> = [
      {
        name: "lpf",
        kind: "member",
        synonyms: ["cutoff"],
        description: "<p>Applies a low-pass filter.</p>",
      },
      { name: "cutoff", kind: "member" },
    ];
    const names = new Map([
      ["lpf", "function"],
      ["cutoff", "function"],
    ] as const);

    expect(strudelIndex(docs, names)).toEqual(["lpf() =cutoff — Applies a low-pass filter."]);
  });

  it("writes a value such as a signal without parentheses", () => {
    const sine: DocEntry = {
      name: "sine",
      kind: "constant",
      description: "<p>A sine signal between 0 and 1.</p>",
    };

    expect(strudelIndex([sine], new Map([["sine", "value"]]))).toEqual([
      "sine — A sine signal between 0 and 1.",
    ]);
  });

  it("marks rest, optional and defaulted params, and spells out an options object", () => {
    const docs: ReadonlyArray<DocEntry> = [
      { name: "cat", kind: "function", params: [{ name: "items", variable: true }] },
      {
        name: "firstCycle",
        kind: "function",
        params: [{ name: "with_context", defaultvalue: false }],
      },
      {
        name: "lfo",
        kind: "member",
        params: [
          { name: "config" },
          { name: "config.rate", optional: true },
          { name: "config.depth", optional: true },
          { name: "id" },
        ],
      },
    ];
    const names = new Map([
      ["cat", "function"],
      ["firstCycle", "function"],
      ["lfo", "function"],
    ] as const);

    expect(strudelIndex(docs, names)).toEqual([
      "cat(...items)",
      "firstCycle(with_context=false)",
      "lfo(config{rate?, depth?}, id)",
    ]);
  });

  it("lists a name once, from its documented entry", () => {
    const docs: ReadonlyArray<DocEntry> = [
      { name: "attack", kind: "member", description: "" },
      { name: "attack", kind: "member", description: "<p>Amplitude envelope attack time.</p>" },
      { name: "attack", kind: "member", description: "<p>Another attack.</p>" },
    ];

    expect(strudelIndex(docs, new Map([["attack", "function"]]))).toEqual([
      "attack() — Amplitude envelope attack time.",
    ]);
  });
});
