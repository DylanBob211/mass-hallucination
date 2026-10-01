import { page, userEvent } from "@vitest/browser/context";
import { Effect, Either, Layer, ManagedRuntime } from "effect";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { apply } from "../../core/apply";
import { ErrorSlotStore } from "../../core/ErrorSlotStore";
import { makeFakeEditor } from "../../core/fakes";
import type { Scope } from "../../core/liveCode";
import { LiveCodeStore } from "../../core/LiveCodeStore";
import { StrudelLive } from "./strudel";

// One real repl for the file, under a fake editor whose Source each test sets.
const editor = Effect.runSync(makeFakeEditor(""));
const runtime = ManagedRuntime.make(
  LiveCodeStore.layer.pipe(
    Layer.provideMerge(ErrorSlotStore.layer),
    Layer.provideMerge(Layer.merge(editor.layer, StrudelLive)),
  ),
);

beforeAll(async () => {
  // The gesture that lets the page start audio.
  await userEvent.click(document.body);
});
afterAll(() => runtime.dispose());

const seed = `kick: s("bd*4").analyze('kick')
hats: s("hh*8")
viz: hydra\`osc(10).out()\``;

/** Applies `source` whole, as a human Ctrl-Enter would, so it is what plays. */
const play = (source: string) => runtime.runPromise(Effect.andThen(editor.type(source), apply()));

const dryRun = (scope: Scope, texts: Record<string, string>) =>
  runtime.runPromise(
    Effect.either(
      Effect.flatMap(LiveCodeStore, (store) => store.dryRun(scope, new Map(Object.entries(texts)))),
    ),
  );

const outcome = (result: Awaited<ReturnType<typeof dryRun>>) =>
  Either.isLeft(result)
    ? { message: result.left.message, part: result.left.part, kind: result.left.kind }
    : "passed";

const warningsOf = (result: Awaited<ReturnType<typeof dryRun>>) =>
  Either.map(result, ({ warnings }) => warnings);

/** The outputs the dry-runs found for a Visual Part's exact `text`. */
const outputsOf = (text: string) =>
  runtime.runPromise(
    Effect.map(
      Effect.flatMap(LiveCodeStore, (store) => store.outputs),
      (outputs) => outputs.get(text),
    ),
  );

/** The colour on screen at the middle of the page, once the canvas has drawn a few frames. */
const seen = async () => {
  for (let frame = 0; frame < 3; frame++)
    await new Promise((resolve) => requestAnimationFrame(resolve));
  const image = new Image();
  image.src = `data:image/png;base64,${await page.screenshot({ save: false })}`;
  await image.decode();
  const canvas = new OffscreenCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no 2D context");
  context.drawImage(image, 0, 0);
  const [r, g, b] = context.getImageData(image.width / 2, image.height / 2, 1, 1).data;
  return [r, g, b];
};

describe("the visual dry-run", () => {
  test(
    "passes a valid Visual Part, with no warnings, and finds its outputs",
    { timeout: 20_000 },
    async () => {
      await play(seed);
      const glow = "glow: hydra`osc(10, .1, () => level('kick')).kaleid(4).out(o1); render(o1)`";

      const result = await dryRun(["glow"], { glow });

      expect(warningsOf(result)).toEqual(Either.right([]));
      expect(await outputsOf(glow)).toEqual(["o1"]);
    },
  );

  test("leaves the live canvas as it was", async () => {
    await play(seed.replace("osc(10).out()", "solid(1, 0, 0).out()"));
    const before = await seen();

    await dryRun(["glow"], { glow: "glow: hydra`solid(0, 0, 1).out(); render(o0)`" });
    await dryRun(["glow"], { glow: "glow: hydra`solid(0, 0, 1).out(o9)`" });

    expect(before).toEqual([255, 0, 0]);
    expect(await seen()).toEqual(before);
  });

  describe("refuses, as invalid with its kind and Part", () => {
    test("a body that does not parse, as syntax", async () => {
      await play(seed);

      expect(outcome(await dryRun(["glow"], { glow: "glow: hydra`osc(10).out(`" }))).toEqual({
        message: "Unexpected token",
        part: "glow",
        kind: "syntax",
      });
    });

    test("a body with ${…}, as syntax", async () => {
      await play(seed);

      expect(outcome(await dryRun(["glow"], { glow: "glow: hydra`osc(${10}).out()`" }))).toEqual({
        message: "a hydra template takes no ${…}: only Hydra's names are in scope",
        part: "glow",
        kind: "syntax",
      });
    });

    test("Hydra in any shape but a Visual Part, as syntax", async () => {
      await play(seed);

      expect(
        outcome(await dryRun(["(preamble)"], { "(preamble)": "hydra`osc(10).out()`" })),
      ).toMatchObject({ part: "(preamble)", kind: "syntax" });
      expect(
        outcome(await dryRun(["glow"], { glow: "glow: hydra`osc(10).out()`.fast(2)" })),
      ).toMatchObject({ part: "glow", kind: "syntax" });
    });

    test("a name nothing defines, as name", async () => {
      await play(seed);

      expect(outcome(await dryRun(["glow"], { glow: "glow: hydra`osk(10).out()`" }))).toEqual({
        message: "osk is not defined",
        part: "glow",
        kind: "name",
      });
      expect(
        outcome(await dryRun(["glow"], { glow: "glow: hydra`osc(10).nope().out()`" })),
      ).toMatchObject({ part: "glow", kind: "name" });
    });

    test("an argument Hydra cannot take, as argument", async () => {
      await play(seed);
      const refusing = async (body: string) =>
        outcome(await dryRun(["glow"], { glow: `glow: hydra\`${body}\`` }));

      expect(await refusing('osc("fast").out()')).toEqual({
        message: 'osc(): frequency must be a number, an array of numbers or a function, not "fast"',
        part: "glow",
        kind: "argument",
      });
      expect(await refusing("osc(10).modulate(5).out()")).toEqual({
        message:
          "modulate(): its first argument must be a source such as osc(), or an output such as o1, not 5",
        part: "glow",
        kind: "argument",
      });
      expect(await refusing("src(5).out()")).toEqual({
        message: "src(): tex must be an output such as o1, not 5",
        part: "glow",
        kind: "argument",
      });
      expect(await refusing("osc(Infinity).out()")).toEqual({
        message:
          "osc(): frequency must be a number, an array of numbers or a function, not Infinity",
        part: "glow",
        kind: "argument",
      });
      expect(await refusing("osc(10).out(5)")).toEqual({
        message: ".out() takes o0, o1, o2 or o3, not 5",
        part: "glow",
        kind: "argument",
      });
    });

    test("a shader that does not compile, as shader", async () => {
      await play(seed);
      const glow = `glow: hydra\`setFunction({ name: "broken", type: "src", inputs: [], glsl: "return vec4(nope);" })
broken().out()\``;

      expect(outcome(await dryRun(["glow"], { glow }))).toEqual({
        message: expect.stringMatching(/^shader: .*nope/) as unknown,
        part: "glow",
        kind: "shader",
      });
    });

    test("a parameter function that fails at a probe, as parameter, naming the probe", async () => {
      await play(seed);
      const refusing = async (body: string) =>
        outcome(await dryRun(["glow"], { glow: `glow: hydra\`${body}\`` }));

      expect(await refusing("osc(() => 1 / level('kick')).out()")).toEqual({
        message: "osc(): frequency, at cycle 0, level=0: returned Infinity",
        part: "glow",
        kind: "parameter",
      });
      expect(await refusing("osc(10, () => (cycle() > 3 ? null.x : 1)).out()")).toEqual({
        message: "osc(): sync, at cycle 3.9: Cannot read properties of null (reading 'x')",
        part: "glow",
        kind: "parameter",
      });
      expect(await refusing("osc(() => (pulse('kick') === 1 ? 'fast' : 10)).out()")).toEqual({
        message: 'osc(): frequency, at cycle 0, pulse=1: returned "fast"',
        part: "glow",
        kind: "parameter",
      });
      expect(await refusing("osc(10).modulate(noise(() => time * NaN)).out()")).toEqual({
        message: "noise(): scale, at cycle 0: returned NaN",
        part: "glow",
        kind: "parameter",
      });
    });
  });

  describe("warns, and passes,", () => {
    test("when a Visual Part writes no output", async () => {
      await play(seed);

      const result = await dryRun(["glow"], { glow: "glow: hydra`osc(10)`" });

      expect(warningsOf(result)).toEqual(
        Either.right(["glow: writes no output; nothing shows without .out()"]),
      );
    });

    test("when a Visual Part hides another on an output, unless one of them is not drawn", async () => {
      await play(seed);

      const hiding = await dryRun(["glow"], { glow: "glow: hydra`noise().out(o0)`" });
      const muted = await dryRun(["glow"], { glow: "_glow: hydra`noise().out(o0)`" });

      expect(warningsOf(hiding)).toEqual(Either.right(["glow hides viz on o0"]));
      expect(warningsOf(muted)).toEqual(Either.right([]));
    });

    test("when a helper names a Part that does not exist", async () => {
      await play(seed);

      const result = await dryRun(["glow"], {
        glow: "glow: hydra`osc(() => pulse('snare') * 10, () => value('bass', 'note')).out(o1)`",
      });

      expect(warningsOf(result)).toEqual(
        Either.right(["glow: pulse('snare') names no Part", "glow: value('bass') names no Part"]),
      );
    });

    test("when level reads a Part with no .analyze of its name", async () => {
      await play(seed);

      const result = await dryRun(["glow"], {
        glow: "glow: hydra`osc(() => level('hats') * 10, () => level('kick')).out(o1)`",
      });

      expect(warningsOf(result)).toEqual(
        Either.right(["glow: level('hats') hears nothing: hats has no .analyze('hats')"]),
      );
    });
  });
});
