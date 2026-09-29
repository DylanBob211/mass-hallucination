import { Effect, Layer, SubscriptionRef } from "effect";
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
  Effect.sync(() => {
    const evaluated: string[] = [];
    let transport: Transport = { started: false, cps: 0.5 };
    let position = 0;
    let failure: string | undefined;

    return {
      layer: Layer.succeed(Strudel, {
        evaluate: (code) =>
          Effect.suspend(() => {
            if (failure !== undefined) return Effect.fail(new EvalError({ message: failure }));
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
      }),
      evaluated,
      /** Makes every later evaluate fail with `message`. */
      failWith: (message: string) => Effect.sync(() => (failure = message)),
      setCps: (cps: number) => Effect.sync(() => (transport = { ...transport, cps })),
      setPosition: (cycles: number) => Effect.sync(() => (position = cycles)),
    };
  });
