import { Deferred, Effect, Layer, PubSub, Stream, SubscriptionRef } from "effect";
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
 * A `Strudel` that records what it was asked to evaluate and to dry-run. A successful evaluate
 * starts the transport, as the real repl does; the tempo and position are whatever the test sets.
 */
export const makeFakeStrudel = () =>
  Effect.gen(function* () {
    const playbackErrors = yield* PubSub.unbounded<string>();
    const evaluated: string[] = [];
    const dryRuns: string[] = [];
    let transport: Transport = { started: false, cps: 0.5 };
    let position = 0;
    let failure: Failure | undefined;
    let dryRunFailure: Failure | undefined;
    let warning: { message: string; at: (code: string) => number } | undefined;
    let held: Deferred.Deferred<undefined> | undefined;
    const fail = ({ message, at }: Failure, code: string) =>
      Effect.fail(new EvalError(at === undefined ? { message } : { message, offset: at(code) }));

    return {
      layer: Layer.succeed(Strudel, {
        evaluate: (code) =>
          Effect.suspend(() => {
            const gate = held === undefined ? Effect.void : Deferred.await(held);
            return Effect.andThen(
              gate,
              Effect.suspend(() => {
                if (failure !== undefined) return fail(failure, code);
                evaluated.push(code);
                transport = { ...transport, started: true };
                return Effect.void;
              }),
            );
          }),
        dryRun: (code) =>
          Effect.suspend(() => {
            if (dryRunFailure !== undefined && (dryRunFailure.when?.(code) ?? true))
              return fail(dryRunFailure, code);
            dryRuns.push(code);
            return Effect.succeed(
              warning === undefined ? [] : [{ message: warning.message, offset: warning.at(code) }],
            );
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
      dryRuns,
      /**
       * Makes every later evaluate fail with `message`, at the offset `at` finds in the code when
       * given.
       */
      failWith: (message: string, at?: (code: string) => number) =>
        Effect.sync(() => (failure = at === undefined ? { message } : { message, at })),
      /** Has the playing pattern throw `message`, as Strudel's scheduler reports it. */
      failWhilePlaying: (message: string) => PubSub.publish(playbackErrors, message),
      /**
       * Makes later dry-runs of code `when` accepts (all, by default) fail with `message`, at the
       * offset `at` finds when given.
       */
      failDryRunWith: (
        message: string,
        { at, when }: { at?: (code: string) => number; when?: (code: string) => boolean } = {},
      ) =>
        Effect.sync(() => {
          dryRunFailure = { message, ...(at && { at }), ...(when && { when }) };
        }),
      /** Makes every later dry-run warn `message`, at the offset `at` finds in the code. */
      warnDryRun: (message: string, at: (code: string) => number) =>
        Effect.sync(() => (warning = { message, at })),
      /** Makes later evaluates wait until `releaseEvaluates`. */
      holdEvaluates: Effect.map(Deferred.make<undefined>(), (gate) => {
        held = gate;
      }),
      releaseEvaluates: Effect.suspend(() =>
        held === undefined ? Effect.void : Effect.asVoid(Deferred.succeed(held, undefined)),
      ),
      /** Makes every later evaluate succeed again. */
      succeed: Effect.sync(() => (failure = undefined)),
      setCps: (cps: number) => Effect.sync(() => (transport = { ...transport, cps })),
      setPosition: (cycles: number) => Effect.sync(() => (position = cycles)),
    };
  });

interface Failure {
  readonly message: string;
  readonly at?: (code: string) => number;
  readonly when?: (code: string) => boolean;
}
