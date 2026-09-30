import { userEvent } from "@vitest/browser/context";
import { Clock, Effect, Either, Stream } from "effect";
import { expect, test } from "vitest";
import { type LateNote, Strudel } from "../../core/Strudel";
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

test("a failed evaluate is an EvalError, placed in the code, and leaves the transport as it was", async () => {
  const result = await withStrudel((strudel) =>
    Effect.gen(function* () {
      const error = yield* Effect.either(strudel.evaluate('s("bd"'));
      return { error, transport: yield* strudel.transport };
    }),
  );

  // The parser reaches the end of the code without the closing parenthesis.
  expect(Either.getLeft(result.error).pipe((e) => e._tag === "Some" && e.value.offset)).toBe(6);
  expect(result.transport.started).toBe(false);
});

test(
  "a main-thread stall while playing shows as late notes, the scheduler having dropped them",
  { timeout: 20_000 },
  async () => {
    await userEvent.click(document.body);
    const wait = (millis: number) =>
      Effect.promise(() => new Promise((resolve) => setTimeout(resolve, millis)));
    const late: Array<LateNote> = [];

    const { steady, stalledAt } = await withStrudel((strudel) =>
      Effect.gen(function* () {
        yield* Effect.fork(
          Stream.runForEach(strudel.lateNotes, (note) => Effect.sync(() => late.push(note))),
        );
        yield* strudel.evaluate('s("hh*16").gain(0)');
        yield* wait(1000);
        const steady = late.length;
        const stalledAt = yield* Clock.currentTimeMillis;
        // The stall: 500 ms is more than the scheduler looks ahead.
        const end = performance.now() + 500;
        while (performance.now() < end);
        yield* wait(500);
        yield* strudel.stop;
        return { steady, stalledAt };
      }),
    );

    expect(steady).toBe(0);
    expect(late.length).toBeGreaterThan(0);
    for (const note of late) {
      expect(note.where).toBe("scheduler");
      expect(note.lateBy).toBeGreaterThan(0);
      expect(note.at).toBeGreaterThanOrEqual(stalledAt);
    }
  },
);
