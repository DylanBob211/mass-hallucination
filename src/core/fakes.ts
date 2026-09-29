import { Effect, Layer, PubSub, Stream, SubscriptionRef } from "effect";
import { Editor } from "./Editor";
import { EvalError, Strudel } from "./Strudel";
import type { Transport } from "./viewModel";

/** An `Editor` over an in-memory Source, for Node tests (ADR 0006). */
export const makeFakeEditor = (source: string) =>
  Effect.map(SubscriptionRef.make(source), (ref) => ({
    layer: Layer.succeed(Editor, { read: SubscriptionRef.get(ref), changes: ref.changes }),
    /** Replaces the Source, as a human typing would. */
    type: (next: string) => SubscriptionRef.set(ref, next),
  }));

/**
 * A `Strudel` that records what it was asked to evaluate. A successful evaluate starts the
 * transport, as the real repl does; the tempo and position are whatever the test sets.
 */
export const makeFakeStrudel = () =>
  Effect.gen(function* () {
    const playbackErrors = yield* PubSub.unbounded<string>();
    const evaluated: string[] = [];
    let transport: Transport = { started: false, cps: 0.5 };
    let position = 0;
    let failure: { message: string; at?: (code: string) => number } | undefined;

    return {
      layer: Layer.succeed(Strudel, {
        evaluate: (code) =>
          Effect.suspend(() => {
            if (failure !== undefined) {
              const { message, at } = failure;
              return Effect.fail(
                new EvalError(at === undefined ? { message } : { message, offset: at(code) }),
              );
            }
            evaluated.push(code);
            transport = { ...transport, started: true };
            return Effect.void;
          }),
        stop: Effect.sync(() => {
          transport = { ...transport, started: false };
          position = 0;
        }),
        transport: Effect.sync(() => transport),
        position: Effect.sync(() => position),
        playbackErrors: Stream.fromPubSub(playbackErrors),
      }),
      evaluated,
      /**
       * Makes every later evaluate fail with `message`, at the offset `at` finds in the code when
       * given.
       */
      failWith: (message: string, at?: (code: string) => number) =>
        Effect.sync(() => (failure = at === undefined ? { message } : { message, at })),
      /** Has the playing pattern throw `message`, as Strudel's scheduler reports it. */
      failWhilePlaying: (message: string) => PubSub.publish(playbackErrors, message),
      /** Makes every later evaluate succeed again. */
      succeed: Effect.sync(() => (failure = undefined)),
      setCps: (cps: number) => Effect.sync(() => (transport = { ...transport, cps })),
      setPosition: (cycles: number) => Effect.sync(() => (position = cycles)),
    };
  });
