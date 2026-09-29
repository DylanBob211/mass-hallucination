import { userEvent } from "@vitest/browser/context";
import { Effect, Either } from "effect";
import { expect, test } from "vitest";
import { Strudel } from "../../core/Strudel";
import { StrudelLive } from "./strudel";

const withStrudel = <A, E>(use: (strudel: Strudel["Type"]) => Effect.Effect<A, E>) =>
  Effect.runPromise(Effect.scoped(Effect.flatMap(Strudel, use).pipe(Effect.provide(StrudelLive))));

test(
  "the real repl starts on evaluate, reports setcps from the code, and stops",
  { timeout: 20_000 },
  async () => {
    // The gesture that lets the page start audio.
    await userEvent.click(document.body);

    const seen = await withStrudel((strudel) =>
      Effect.gen(function* () {
        const before = yield* strudel.transport;
        yield* strudel.evaluate('setcps(0.7)\nnote("c3 e3").s("sawtooth")');
        const playing = yield* strudel.transport;
        yield* strudel.stop;
        const stopped = yield* strudel.transport;
        return { before, playing, stopped, position: yield* strudel.position };
      }),
    );

    expect(seen.before).toEqual({ started: false, cps: 0.5 });
    expect(seen.playing).toEqual({ started: true, cps: 0.7 });
    expect(seen.stopped.started).toBe(false);
    expect(seen.position).toBe(0);
  },
);

test("a failed evaluate is an EvalError and leaves the transport as it was", async () => {
  const result = await withStrudel((strudel) =>
    Effect.gen(function* () {
      const error = yield* Effect.either(strudel.evaluate('s("bd"'));
      return { error, transport: yield* strudel.transport };
    }),
  );

  expect(Either.isLeft(result.error)).toBe(true);
  expect(result.transport.started).toBe(false);
});
