import { page, userEvent } from "@vitest/browser/context";
import { Effect, Layer, type Scope, Stream } from "effect";
import { beforeEach, expect, test } from "vitest";
import { ErrorSlotStore } from "../../core/ErrorSlotStore";
import { makeFakeEditor } from "../../core/fakes";
import { LiveCodeStore } from "../../core/LiveCodeStore";
import { type PlaybackError, Strudel } from "../../core/Strudel";
import { StrudelLive } from "./strudel";

const withStrudel = <A, E>(use: (strudel: Strudel["Type"]) => Effect.Effect<A, E, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(Effect.flatMap(Strudel, use).pipe(Effect.provide(StrudelLive))));

/** The colour on screen at the middle of the page, once the canvas has drawn a few frames. */
const seen = Effect.promise(async () => {
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
});

const white = [255, 255, 255];
const red = [255, 0, 0];
const blue = [0, 0, 255];

beforeEach(async () => {
  document.body.style.background = "white";
  // The gesture that lets the page start audio.
  await userEvent.click(document.body);
});

test("a Visual Part draws on the canvas behind the page", { timeout: 20_000 }, async () => {
  const colour = await withStrudel((strudel) =>
    Effect.andThen(strudel.evaluate("viz: hydra`solid(1, 0, 0).out()`"), seen),
  );

  expect(colour).toEqual(red);
});

test("every evaluate starts from a clear canvas", { timeout: 20_000 }, async () => {
  const colour = await withStrudel((strudel) =>
    Effect.gen(function* () {
      yield* strudel.evaluate("viz: hydra`solid(1, 0, 0).out(o1); render(o1)`");
      yield* strudel.evaluate('drums: s("bd")');
      return yield* seen;
    }),
  );

  expect(colour).toEqual(white);
});

test("a muted Visual Part is not drawn", { timeout: 20_000 }, async () => {
  const colour = await withStrudel((strudel) =>
    Effect.andThen(strudel.evaluate("_viz: hydra`solid(1, 0, 0).out()`"), seen),
  );

  expect(colour).toEqual(white);
});

test(
  "soloing a Visual Part hides the other Visual Parts and leaves the Audio Parts playing",
  { timeout: 20_000 },
  async () => {
    const { colour, heard } = await withStrudel((strudel) =>
      Effect.gen(function* () {
        yield* strudel.evaluate(
          'Sglow: hydra`solid(0, 0, 1).out()`\nviz: hydra`solid(1, 0, 0).out()`\ndrums: s("bd")',
        );
        const colour = yield* seen;
        const { getPattern } = yield* Effect.promise(() => import("@strudel/web"));
        return { colour, heard: getPattern()?.queryArc(0, 1).length };
      }),
    );

    expect(colour).toEqual(blue);
    expect(heard).toBe(1);
  },
);

test("a Visual Part sees Hydra's names and not Strudel's", { timeout: 20_000 }, async () => {
  const result = await withStrudel((strudel) =>
    Effect.either(strudel.evaluate("viz: hydra`osc(10).out(); sine.fast(2)`")),
  );

  expect(result).toMatchObject({ left: { message: "sine is not defined" } });
  expect("osc" in window).toBe(false);
});

test("a Visual Part's undeclared names stay in its body", { timeout: 20_000 }, async () => {
  await withStrudel((strudel) =>
    strudel.evaluate("viz: hydra`speed = 2; shade = 0.5; solid(shade).out()`"),
  );

  expect("shade" in window).toBe(false);
});

test("a later Part with a taken identity is not drawn", { timeout: 20_000 }, async () => {
  const colour = await withStrudel((strudel) =>
    Effect.andThen(
      strudel.evaluate("_viz: hydra`solid(0, 0, 1).out()`\nviz: hydra`solid(1, 0, 0).out()`"),
      seen,
    ),
  );

  expect(colour).toEqual(white);
});

test("an error in a Visual Part's body is placed in its body", { timeout: 20_000 }, async () => {
  const code = 'drums: s("bd")\nviz: hydra`osc(10).out(`';
  const result = await withStrudel((strudel) => Effect.either(strudel.evaluate(code)));

  // The body ends before its call does.
  expect(result).toMatchObject({ left: { offset: code.length - 1 } });
});

test.each([
  ["a syntax error", "osc(10).out("],
  ["an unknown method", "osc(10).kaleidoscope().out()"],
  ["an unknown output", "osc(10).out(o7)"],
])(
  "%s in a Visual Part reaches the error slot with its Part",
  { timeout: 20_000 },
  async (_, body) => {
    const source = `drums: s("bd")\n\nviz: hydra\`${body}\`\n\nhats: s("hh*8")`;
    const slot = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const editor = yield* makeFakeEditor(source);
          return yield* Effect.gen(function* () {
            const store = yield* LiveCodeStore;
            yield* Effect.either(store.apply("every"));
            return yield* Effect.flatMap(ErrorSlotStore, (errors) => errors.current);
          }).pipe(
            Effect.provide(
              LiveCodeStore.layer.pipe(
                Layer.provideMerge(ErrorSlotStore.layer),
                Layer.provideMerge(Layer.merge(editor.layer, StrudelLive)),
              ),
            ),
          );
        }),
      ),
    );

    expect(slot).toMatchObject({ phase: "eval", part: "viz" });
  },
);

/** Evaluates `code`, and gives the playback errors and the colour seen over the frames after. */
const playing = (code: string, during: (gl: WebGLRenderingContext) => void = () => {}) =>
  withStrudel((strudel) =>
    Effect.gen(function* () {
      const errors: Array<PlaybackError> = [];
      yield* Effect.forkScoped(
        Stream.runForEach(strudel.playbackErrors, (error) => Effect.sync(() => errors.push(error))),
      );
      yield* strudel.evaluate(code);
      const gl = document.querySelector("canvas")?.getContext("webgl");
      if (!gl) throw new Error("no WebGL context on the canvas");
      during(gl);
      // A few frames: each would throw again.
      yield* seen;
      const colour = yield* seen;
      return { errors, colour };
    }),
  );

test(
  "a throwing parameter function is reported once, with its Part, and its Part keeps drawing",
  { timeout: 20_000 },
  async () => {
    const { errors, colour } = await playing("viz: hydra`solid(1, () => nope, 0).out()`");

    expect(errors).toEqual([{ message: "nope is not defined", part: "viz" }]);
    // Hydra draws the throwing parameter at its default.
    expect(colour).toEqual(red);
  },
);

test(
  "a parameter function nested in a source is blamed on its Part",
  { timeout: 20_000 },
  async () => {
    const { errors } = await playing(
      "glow: hydra`solid(0, 0, 1).out(o1)`\nviz: hydra`src(o1).blend(solid(() => nope), 0.5).out()`",
    );

    expect(errors).toEqual([{ message: "nope is not defined", part: "viz" }]);
  },
);

test("a throwing update is blamed on its Part", { timeout: 20_000 }, async () => {
  const { errors } = await playing("viz: hydra`solid(1, 0, 0).out(); update = () => nope`");

  expect(errors).toEqual([{ message: "nope is not defined", part: "viz" }]);
});

test(
  "a WebGL error is blamed on the Part that last wrote the output it froze",
  { timeout: 20_000 },
  async () => {
    const { errors } = await playing(
      "glow: hydra`solid(0, 0, 1).out(o0)`\nviz: hydra`solid(1, 0, 0).out(o1); render(o1)`",
      (gl) => {
        gl.enable(0xbeef);
      },
    );

    expect(errors).toEqual([{ message: "WebGL INVALID_ENUM while drawing o0", part: "glow" }]);
  },
);

test("an evaluate reports its Parts' failures afresh", { timeout: 20_000 }, async () => {
  const errors = await withStrudel((strudel) =>
    Effect.gen(function* () {
      const errors: Array<PlaybackError> = [];
      yield* Effect.forkScoped(
        Stream.runForEach(strudel.playbackErrors, (error) => Effect.sync(() => errors.push(error))),
      );
      yield* strudel.evaluate("viz: hydra`solid(() => nope).out()`");
      yield* seen;
      yield* strudel.evaluate("viz: hydra`solid(() => nope).out()`");
      yield* seen;
      return errors;
    }),
  );

  expect(errors).toHaveLength(2);
});

test(
  "a throwing parameter function reaches the error slot with its Part",
  { timeout: 20_000 },
  async () => {
    const source = "viz: hydra`solid(1, () => nope, 0).out()`";
    const slot = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const editor = yield* makeFakeEditor(source);
          return yield* Effect.gen(function* () {
            const store = yield* LiveCodeStore;
            yield* store.apply("every");
            yield* seen;
            return yield* Effect.flatMap(ErrorSlotStore, (errors) => errors.current);
          }).pipe(
            Effect.provide(
              LiveCodeStore.layer.pipe(
                Layer.provideMerge(ErrorSlotStore.layer),
                Layer.provideMerge(Layer.merge(editor.layer, StrudelLive)),
              ),
            ),
          );
        }),
      ),
    );

    expect(slot).toEqual({ message: "nope is not defined", phase: "playback", part: "viz" });
  },
);

/** Long enough for the notes queued at an evaluate to reach the speaker. */
const untilHeard = Effect.promise(() => new Promise((resolve) => setTimeout(resolve, 600)));

test("a Visual Part's helpers follow a heard Part", { timeout: 20_000 }, async () => {
  // Onsets every 125 ms, so a pulse never decays to 0; c2 is MIDI 36.
  const colour = await withStrudel((strudel) =>
    Effect.gen(function* () {
      yield* strudel.evaluate(
        'kick: note("c2*16").s("sine").analyze(\'kick\')\n' +
          "viz: hydra`solid(() => level('kick') > 0 ? 1 : 0, () => pulse('kick') > 0 && cycle() > 0 ? 1 : 0, () => value('kick', 'note') === 36 ? 0 : 1).out()`",
      );
      yield* untilHeard;
      return yield* seen;
    }),
  );

  expect(colour).toEqual([255, 255, 0]);
});

test.each([
  ["muted", "_kick"],
  ["soloed out", 'Shats: s("hh*8")\nkick'],
])("a Visual Part's helpers give 0 for a Part %s", { timeout: 20_000 }, async (_, label) => {
  const colour = await withStrudel((strudel) =>
    Effect.gen(function* () {
      yield* strudel.evaluate(
        `${label}: note("c2*16").s("sine").analyze('kick')\n` +
          "viz: hydra`solid(() => level('kick') + pulse('kick') + value('kick', 'note'), 0, 0).out()`",
      );
      yield* untilHeard;
      return yield* seen;
    }),
  );

  expect(colour).toEqual([0, 0, 0]);
});
