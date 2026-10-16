import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { formatSource } from "./format";
import { parsePerformance } from "./Performance";

const long = `drums: s("bd*2 [~ sd]").bank('RolandTR909').fast(2).gain(.8).room(0.3).lpf(sine.range(200,2000).slow(4))`;

describe("formatSource", () => {
  it.effect("breaks a long chain one call per line, every string kept exactly as quoted", () =>
    Effect.gen(function* () {
      expect(yield* formatSource(long, 0)).toEqual({
        ok: true,
        source: `drums: s("bd*2 [~ sd]")
  .bank('RolandTR909')
  .fast(2)
  .gain(0.8)
  .room(0.3)
  .lpf(sine.range(200, 2000).slow(4))
`,
        cursor: 0,
      });
    }),
  );

  it.effect("keeps the cursor on the code it was on, past strings whose quotes it gave back", () =>
    Effect.gen(function* () {
      const source = `a: s('it\\'s').gain(.8)`;

      expect(yield* formatSource(source, source.indexOf("gain"))).toEqual({
        ok: true,
        source: `a: s('it\\'s').gain(0.8)\n`,
        cursor: `a: s('it\\'s').`.length,
      });
    }),
  );

  it.effect("keeps the cursor inside the string it was in", () =>
    Effect.gen(function* () {
      const source = `a: s('it\\'s bd')`;

      expect(yield* formatSource(source, source.indexOf("bd"))).toMatchObject({
        ok: true,
        cursor: source.indexOf("bd"),
      });
    }),
  );

  it.effect("refuses a Source that does not parse, naming the line", () =>
    Effect.gen(function* () {
      const source = 'kick: s("bd*4")\n\nhats: s("hh*8").gain(';

      expect(yield* formatSource(source, 0)).toEqual({
        ok: false,
        reason: "syntax error at line 3",
      });
    }),
  );

  describe("a Visual Part", () => {
    const viz =
      "viz: hydra`osc(10, 0.1, 1.2).rotate(() => time * .1).kaleid(4).modulate(noise(3), 0.2).color('red').out()`";

    it.effect("has its code laid out too, indented inside its template", () =>
      Effect.gen(function* () {
        expect(yield* formatSource(viz, viz.indexOf("kaleid"))).toEqual({
          ok: true,
          source: `viz: hydra\`
  osc(10, 0.1, 1.2)
    .rotate(() => time * 0.1)
    .kaleid(4)
    .modulate(noise(3), 0.2)
    .color('red')
    .out()
\`
`,
          cursor: `viz: hydra\`
  osc(10, 0.1, 1.2)
    .rotate(() => time * 0.1)
    .`.length,
        });
      }),
    );

    it.effect("keeps the cursor on its code past a blank line, which is not indented", () =>
      Effect.gen(function* () {
        const source =
          "viz: hydra`speed = 2\n\nosc(10, 0.1, 1.2).rotate(() => time * .1).kaleid(4).out()`";
        const formatted = yield* formatSource(source, source.indexOf("kaleid"));

        expect(formatted).toMatchObject({ ok: true });
        if (formatted.ok) expect(formatted.source.slice(formatted.cursor)).toMatch(/^kaleid\(4\)/);
      }),
    );

    it.effect("keeps short code on its label's line, joining lines it no longer needs", () =>
      Effect.gen(function* () {
        const short = "viz: hydra`osc(10).out()`\n";

        expect(yield* formatSource(short, 0)).toMatchObject({ source: short });
        expect(yield* formatSource("viz: hydra`\n  osc(10)\n    .out()\n`", 0)).toMatchObject({
          source: short,
        });
      }),
    );

    it.effect("gives code its own lines when what follows the template would pass 80", () =>
      Effect.gen(function* () {
        const source =
          "viz: hydra`osc(10, 0.1, 1.2).rotate(0.5).out()` // the slow spin, under the warm pads";

        expect(yield* formatSource(source, 0)).toMatchObject({
          source: `viz: hydra\`
  osc(10, 0.1, 1.2).rotate(0.5).out()
\` // the slow spin, under the warm pads
`,
        });
      }),
    );
  });

  it.effect("changes no Rev, and changes nothing a second time", () =>
    Effect.gen(function* () {
      const source = `await samples('github:tidalcycles/dirt-samples')
setcps(.5)
// four on the floor
_kick: s("bd*4").gain(.9) // loud
Shats: s(\`hh*8
  [~ hh]\`).sometimes(x=>x.fast(2)).pan(sine.range(0,1).slow(4)).room(0.2).lpf(4000)


viz: hydra\`osc(10, 0.1, 1.2).rotate(() => time * .1).kaleid(4).modulate(noise(3), 0.2).out()\`
bass: note("<c2 eb2>").s('sawtooth').lpf(sine.range(200,2000)).attack(.01).decay(.2).sustain(0)`;
      const revs = (text: string) => {
        const { parts, preamble } = parsePerformance(text);
        return [preamble.rev, ...parts.map((part) => [part.id, part.rev])];
      };

      const once = yield* formatSource(source, 0);
      if (!once.ok) throw new Error(once.reason);
      const twice = yield* formatSource(once.source, 0);

      expect(revs(once.source)).toEqual(revs(source));
      expect(twice).toMatchObject({ ok: true, source: once.source });
    }),
  );
});
