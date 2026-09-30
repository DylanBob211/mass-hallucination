import { getPattern, Pattern } from "@strudel/web";
import { userEvent } from "@vitest/browser/context";
import { Effect, Either, Layer, ManagedRuntime } from "effect";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { apply } from "../../core/apply";
import { ErrorSlotStore } from "../../core/ErrorSlotStore";
import { makeFakeEditor } from "../../core/fakes";
import { preambleId, type Scope } from "../../core/liveCode";
import { LiveCodeStore } from "../../core/LiveCodeStore";
import { Strudel } from "../../core/Strudel";
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

const seed = `setcps(.7)
kick: s("bd*4")
hats: s("hh*8")`;

/** Applies `source` whole, as a human Ctrl-Enter would, so it is what plays. */
const play = (source: string) => runtime.runPromise(Effect.andThen(editor.type(source), apply()));

const dryRun = (scope: Scope, texts: Record<string, string>) =>
  runtime.runPromise(
    Effect.either(
      Effect.flatMap(LiveCodeStore, (store) => store.dryRun(scope, new Map(Object.entries(texts)))),
    ),
  );

const outcome = (result: Awaited<ReturnType<typeof dryRun>>) =>
  Either.isLeft(result) ? { message: result.left.message, part: result.left.part } : "passed";

describe("the audio dry-run over the real bundle", () => {
  test("passes valid code, with no warnings", { timeout: 20_000 }, async () => {
    await play(seed);

    const result = await dryRun(["hats"], { hats: 'hats: s("hh*16").gain(.5)' });

    expect(Either.map(result, ({ warnings }) => warnings)).toEqual(Either.right([]));
  });

  test("refuses a syntax error, with its Part", async () => {
    await play(seed);

    expect(outcome(await dryRun(["hats"], { hats: 'hats: s("hh*16").gain(' }))).toEqual({
      message: "Unexpected token",
      part: "hats",
    });
  });

  test("refuses a mini-notation error, with its Part", async () => {
    await play(seed);

    expect(outcome(await dryRun(["kick"], { kick: 'kick: s("bd*[4")' }))).toMatchObject({
      message: expect.stringMatching(/^\[mini\] parse error: /) as unknown,
      part: "kick",
    });
  });

  test("refuses a runtime error, with its Part", async () => {
    await play(seed);

    expect(outcome(await dryRun(["kick"], { kick: 'kick: nope("bd*4")' }))).toEqual({
      message: "nope is not defined",
      part: "kick",
    });
  });

  test("refuses an error only a query finds, with its Part", async () => {
    await play(seed);

    const result = await dryRun(["kick"], {
      kick: 'kick: s("bd*4").withValue((v) => v.missing.field)',
    });

    expect(outcome(result)).toEqual({
      message: "Cannot read properties of undefined (reading 'field')",
      part: "kick",
    });
  });

  test("refuses an error first reached after cycle 1", async () => {
    await play(seed);

    const result = await dryRun(["kick"], {
      kick: `kick: s("<bd bd bd bd bd oops>").withValue((v) => (v.s === 'oops' ? v.no.such : v))`,
    });

    expect(outcome(result)).toMatchObject({ part: "kick" });
  });

  test("refuses a query that takes longer than the cap", async () => {
    await play(seed);

    // Each event takes 50 ms to make, so eight cycles take 400 ms.
    const result = await dryRun(["kick"], {
      kick: `kick: s("bd").withValue((v) => {
  const until = performance.now() + 50;
  while (performance.now() < until);
  return v;
})`,
    });

    expect(outcome(result)).toEqual({
      message: "querying cycles 0–8 took over 250 ms",
      part: "kick",
    });
  });

  test("refuses what a real Apply refuses, as the numbered d1", async () => {
    await play(seed);

    const real = await play(`${seed}\ns("cp").d1`).then(
      () => "applied",
      () => "refused",
    );
    const dry = outcome(await dryRun([preambleId], { [preambleId]: 's("cp").d1' }));

    expect(real).toBe("refused");
    expect(dry).toMatchObject({ part: preambleId });
  });

  test("refuses hush(), with the unit that calls it", async () => {
    await play(seed);

    expect(outcome(await dryRun([preambleId], { [preambleId]: "setcps(.7)\nhush()" }))).toEqual({
      message: "hush() is not allowed: it would silence every Part",
      part: preambleId,
    });
  });

  test("warns when one chain sets size and roomsize, or legato and clip", async () => {
    await play(seed);

    const result = await dryRun(["hats", "bass"], {
      hats: 'hats: s("hh*8").size(.5).roomsize(.9)',
      bass: 'bass: note("c2").legato(.5).clip(1).s("sawtooth")',
    });

    expect(Either.map(result, ({ warnings }) => warnings)).toEqual(
      Either.right([
        "hats: size and roomsize set the same control; only the last one counts",
        "bass: legato and clip set the same control; only the last one counts",
      ]),
    );
  });

  test("leaves what plays untouched, even when the code acts on the repl", async () => {
    await play(seed);
    const before = {
      pattern: getPattern(),
      transport: await runtime.runPromise(Effect.flatMap(Strudel, (s) => s.transport)),
      p: Pattern.prototype.p,
      play: Pattern.prototype.play,
    };

    const acting = await dryRun([preambleId, "hats", "bass"], {
      [preambleId]: `setcps(2)\nsamples('github:nobody/nothing')\nall((x) => x.fast(4))`,
      hats: 'hats: s("hh*8").play()',
      bass: 'bass: note("c2").s("sawtooth")',
    });
    await dryRun(["hats"], { hats: 'hats: s("hh").gain(' });
    await dryRun(["hats"], { hats: "hats: nope()" });
    await dryRun([preambleId], { [preambleId]: "hush()" });

    expect(outcome(acting)).toEqual("passed");
    expect(before.transport).toEqual({ started: true, cps: 0.7 });
    expect(await runtime.runPromise(Effect.flatMap(Strudel, (s) => s.transport))).toEqual(
      before.transport,
    );
    expect(getPattern()).toBe(before.pattern);
    expect(Pattern.prototype.p).toBe(before.p);
    expect(Pattern.prototype.play).toBe(before.play);
  });
});
