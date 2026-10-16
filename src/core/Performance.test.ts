import { describe, expect, it } from "@effect/vitest";
import { parsePerformance } from "./Performance";

const seed = `samples('github:tidalcycles/dirt-samples')
setcps(0.5)
kick: s("bd*4")
hats: s("hh*8").gain(.6)
chords: note("<c3 eb3 g3 bb3>").s("sawtooth").lpf(800)`;

describe("parsePerformance", () => {
  it("makes each top-level labelled statement a Part and the rest the Preamble", () => {
    const performance = parsePerformance(seed);

    expect(performance.parts.map((p) => [p.id, p.text])).toEqual([
      ["kick", 'kick: s("bd*4")'],
      ["hats", 'hats: s("hh*8").gain(.6)'],
      ["chords", 'chords: note("<c3 eb3 g3 bb3>").s("sawtooth").lpf(800)'],
    ]);
    expect(performance.preamble.text).toBe(
      "samples('github:tidalcycles/dirt-samples')\nsetcps(0.5)",
    );
  });

  describe("which labels are Parts", () => {
    it("puts anonymous $: blocks in the Preamble, as Strudel numbers them rather than naming them", () => {
      const source = `$: s("bd*4")
S$: s("cp")
_$: s("hh")
kick: s("bd")`;
      const performance = parsePerformance(source);

      expect(performance.parts.map((p) => p.id)).toEqual(["kick"]);
      expect(performance.preamble.text).toBe('$: s("bd*4")\nS$: s("cp")\n_$: s("hh")');
    });

    it("does not make labels below the top level Parts", () => {
      const source = `outer: inner: s("bd")
const f = () => { nested: s("hh") }
{ block: s("cp") }`;
      const performance = parsePerformance(source);

      expect(performance.parts.map((p) => p.id)).toEqual(["outer"]);
      expect(performance.preamble.text).toBe(
        'const f = () => { nested: s("hh") }\n{ block: s("cp") }',
      );
    });
  });

  describe("a Source that does not parse", () => {
    it("keeps the other Parts whole while one is half-typed", () => {
      const source = `setcps(0.5)
kick: s("bd*4")
hats: s("hh*8").gain(
chords: note("c3")`;
      const performance = parsePerformance(source);

      expect(performance.parts.map((p) => [p.id, p.text])).toEqual([
        ["kick", 'kick: s("bd*4")'],
        ["hats", 'hats: s("hh*8").gain('],
        ["chords", 'chords: note("c3")'],
      ]);
      expect(performance.preamble.text).toBe("setcps(0.5)");
    });

    it("leaves the next Part its leading comments", () => {
      const source = `hats: s("hh*8").gain( // loud
// the chords
chords: note("c3")`;

      expect(parsePerformance(source).parts.map((p) => p.text)).toEqual([
        'hats: s("hh*8").gain( // loud',
        '// the chords\nchords: note("c3")',
      ]);
    });

    it("keeps a half-typed label in the Preamble", () => {
      const source = 'kick: s("bd*4")\nhat\nchords: note("c3")';
      const performance = parsePerformance(source);

      expect(performance.parts.map((p) => p.id)).toEqual(["kick", "chords"]);
      expect(performance.preamble.text).toBe("hat");
    });
  });

  describe("duplicate identities", () => {
    it("keeps the first Part with an identity and leaves the later ones in the Preamble", () => {
      const source = `kick: s("bd*4")
_kick: s("bd*2")
kick: s("bd")`;
      const performance = parsePerformance(source);

      expect(performance.parts.map((p) => p.text)).toEqual(['kick: s("bd*4")']);
      expect(performance.preamble.text).toBe('_kick: s("bd*2")\nkick: s("bd")');
    });
  });

  describe("mute and solo", () => {
    const read = (label: string) => {
      const [part] = parsePerformance(`${label}: s("bd")`).parts;
      return part && { id: part.id, muted: part.muted, soloed: part.soloed };
    };

    it("reads an unmarked label as neither", () => {
      expect(read("kick")).toEqual({ id: "kick", muted: false, soloed: false });
    });

    it("mutes a label with a leading or trailing underscore, which is not its identity", () => {
      expect(read("_kick")).toEqual({ id: "kick", muted: true, soloed: false });
      expect(read("kick_")).toEqual({ id: "kick", muted: true, soloed: false });
      expect(read("__kick__")).toEqual({ id: "kick", muted: true, soloed: false });
    });

    it("solos a label with a leading S, which is not its identity", () => {
      expect(read("Skick")).toEqual({ id: "kick", muted: false, soloed: true });
    });

    it("solos any label longer than one character that starts with S, as Strudel does", () => {
      expect(read("Snare")).toEqual({ id: "nare", muted: false, soloed: true });
      expect(read("S")).toEqual({ id: "S", muted: false, soloed: false });
    });

    it("lets mute win over solo while keeping the identity", () => {
      expect(read("_Skick")).toEqual({ id: "kick", muted: true, soloed: false });
      expect(read("Skick_")).toEqual({ id: "kick", muted: true, soloed: false });
    });

    it("leaves a label that is only marks in the Preamble", () => {
      expect(read("_")).toBeUndefined();
      expect(parsePerformance('_: s("bd")').preamble.text).toBe('_: s("bd")');
    });
  });

  describe("Surface", () => {
    const surfaces = (source: string) =>
      parsePerformance(source).parts.map((p) => [p.id, p.surface]);

    it("makes a Part whose expression is exactly a hydra tagged template Visual", () => {
      expect(surfaces("viz: hydra`osc(10).out()`")).toEqual([["viz", "visual"]]);
      expect(surfaces("viz: hydra`osc(10).out()`;")).toEqual([["viz", "visual"]]);
    });

    it("makes every other Part Audio, Hydra in another shape included", () => {
      expect(
        surfaces(`kick: s("bd")
a: hydra\`osc().out()\`.slow(2)
b: hydra(\`osc().out()\`)
c: other\`osc().out()\`
d: x.hydra\`osc().out()\``),
      ).toEqual([
        ["kick", "audio"],
        ["a", "audio"],
        ["b", "audio"],
        ["c", "audio"],
        ["d", "audio"],
      ]);
    });

    it("leaves unlabelled Hydra in the Preamble", () => {
      const performance = parsePerformance("hydra`osc().out()`");
      expect(performance.parts).toEqual([]);
      expect(performance.preamble.text).toBe("hydra`osc().out()`");
    });
  });

  describe("Rev", () => {
    const revOfPart = (text: string) => parsePerformance(text).parts[0]?.rev;

    it("is the same for the same code in any Layout", () => {
      expect(
        revOfPart(`drums: s("bd*2").bank('RolandTR909').gain(.8).sometimes(x=>x.fast(2))`),
      ).toBe(
        revOfPart(`drums: s("bd*2")
  .bank('RolandTR909')
  .gain(0.8)
  .sometimes((x) => x.fast(2));`),
      );
      expect(revOfPart("viz: osc(1).rotate(() => a && b || c)")).toBe(
        revOfPart("viz: osc(1).rotate(() => (a && b) || c)"),
      );
    });

    it("tells strings apart by their quotes, which decide what is Mini-notation", () => {
      expect(revOfPart(`x: s("bd").bank('a')`)).not.toBe(revOfPart(`x: s("bd").bank("a")`));
      expect(revOfPart('x: s("bd  sd")')).not.toBe(revOfPart('x: s("bd sd")'));
    });

    it("tells apart a change of comment", () => {
      expect(revOfPart('// loud\nkick: s("bd")')).not.toBe(revOfPart('// soft\nkick: s("bd")'));
    });

    it("is the same for the same Visual Part code in any Layout", () => {
      expect(revOfPart("viz: hydra`osc(10).rotate(0.5).out()`")).toBe(
        revOfPart("viz: hydra`\n  osc(10)\n    .rotate(.5)\n    .out()\n`"),
      );
      expect(revOfPart("viz: hydra`osc(10).out()`")).not.toBe(
        revOfPart("viz: hydra`osc(20).out()`"),
      );
    });

    it("is of the exact text while the Part does not parse", () => {
      expect(revOfPart('kick: s("bd").gain(')).not.toBe(revOfPart('kick: s("bd") .gain('));
    });

    it("is 8 hex chars", () => {
      expect(revOfPart('hats: s("é")')).toMatch(/^[0-9a-f]{8}$/);
    });

    it("covers the Part's leading comments", () => {
      expect(revOfPart('// four on the floor\nkick: s("bd*4")')).not.toBe(
        revOfPart('kick: s("bd*4")'),
      );
    });

    it("does not change when the text around the Part does", () => {
      expect(revOfPart('setcps(0.5)\n\n\nkick: s("bd*4")\n\n')).toBe(revOfPart('kick: s("bd*4")'));
    });

    it("is given to the Preamble too, blind to its Layout", () => {
      expect(parsePerformance(seed).preamble.rev).toBe(
        parsePerformance("samples('github:tidalcycles/dirt-samples');setcps(0.5)").preamble.rev,
      );
      expect(parsePerformance(seed).preamble.rev).not.toBe(
        parsePerformance("setcps(0.5)").preamble.rev,
      );
    });
  });

  describe("comments", () => {
    it("gives a Part the comment lines directly above its label", () => {
      const source = `// four on the floor
/* keep it
   simple */
kick: s("bd*4")`;

      expect(parsePerformance(source).parts[0]?.text).toBe(source);
    });

    it("leaves a comment separated by a blank line in the Preamble", () => {
      const source = `// section one

// four on the floor
kick: s("bd*4")`;
      const performance = parsePerformance(source);

      expect(performance.parts[0]?.text).toBe('// four on the floor\nkick: s("bd*4")');
      expect(performance.preamble.text).toBe("// section one");
    });

    it("does not take a comment that ends a line of code above", () => {
      const source = `setcps(0.5) // slow
kick: s("bd*4")`;
      const performance = parsePerformance(source);

      expect(performance.parts[0]?.text).toBe('kick: s("bd*4")');
      expect(performance.preamble.text).toBe("setcps(0.5) // slow");
    });

    it("keeps a comment on the Part's last line with the Part", () => {
      const source = `kick: s("bd*4") // loud
// the hats
hats: s("hh*8")`;

      expect(parsePerformance(source).parts.map((p) => p.text)).toEqual([
        'kick: s("bd*4") // loud',
        '// the hats\nhats: s("hh*8")',
      ]);
    });
  });
});
