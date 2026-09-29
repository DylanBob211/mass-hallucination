import { Context, Effect, Layer, Stream, SubscriptionRef } from "effect";
import { Strudel } from "./Strudel";
import type { ErrorSlot } from "./viewModel";

/**
 * The Performance's one error slot (spec §4): a newer error replaces it, a successful Apply clears
 * it. Apply reports evaluate errors; playback errors arrive from Strudel on their own.
 */
export class ErrorSlotStore extends Context.Tag("ErrorSlotStore")<
  ErrorSlotStore,
  {
    /** The error now, or `undefined` while the slot is empty. */
    readonly current: Effect.Effect<ErrorSlot | undefined>;
    /** The slot now, then after every change. */
    readonly changes: Stream.Stream<ErrorSlot | undefined>;
    readonly report: (error: ErrorSlot) => Effect.Effect<void>;
    readonly clear: Effect.Effect<void>;
  }
>() {
  static readonly layer = Layer.scoped(
    ErrorSlotStore,
    Effect.gen(function* () {
      const strudel = yield* Strudel;
      const ref = yield* SubscriptionRef.make<ErrorSlot | undefined>(undefined);
      const report = (error: ErrorSlot) => SubscriptionRef.set(ref, Object.freeze({ ...error }));

      yield* Effect.forkScoped(
        Stream.runForEach(strudel.playbackErrors, (message) =>
          report({ message, phase: "playback" }),
        ),
      );

      return {
        current: SubscriptionRef.get(ref),
        changes: ref.changes,
        report,
        clear: SubscriptionRef.set(ref, undefined),
      };
    }),
  );
}
