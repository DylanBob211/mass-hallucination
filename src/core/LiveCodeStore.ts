import { Context, Effect, Layer, type Stream, SubscriptionRef } from "effect";
import { Editor } from "./Editor";
import { ErrorSlotStore } from "./ErrorSlotStore";
import { compose, type LiveCode, liveCodeAfter, noLiveCode, type Scope, unitAt } from "./liveCode";
import { parsePerformance } from "./Performance";
import { type EvalError, Strudel } from "./Strudel";

/** The Live code, and Apply: the one way it changes (spec §5). */
export class LiveCodeStore extends Context.Tag("LiveCodeStore")<
  LiveCodeStore,
  {
    readonly current: Effect.Effect<LiveCode>;
    /** The Live code now, then after every Apply that changed it. */
    readonly changes: Stream.Stream<LiveCode>;
    /**
     * Evaluates the Source composed for `scope` and, on success, makes the in-Scope Parts' current
     * text their Live code and clears the error slot. On failure the previous Live code keeps
     * playing and the error slot names the Part that failed, when it can be found.
     */
    readonly apply: (scope: Scope) => Effect.Effect<void, EvalError>;
  }
>() {
  static readonly layer = Layer.effect(
    LiveCodeStore,
    Effect.gen(function* () {
      const editor = yield* Editor;
      const strudel = yield* Strudel;
      const errorSlot = yield* ErrorSlotStore;
      const ref = yield* SubscriptionRef.make(noLiveCode);
      // One Apply at a time, so each updates the Live code it composed from.
      const lock = yield* Effect.makeSemaphore(1);

      const apply = (scope: Scope) =>
        lock.withPermits(1)(
          Effect.gen(function* () {
            const performance = parsePerformance(yield* editor.read);
            const live = yield* SubscriptionRef.get(ref);
            const composition = compose(performance, live, scope);
            yield* strudel.evaluate(composition.code).pipe(
              Effect.tapError(({ message, offset }) => {
                const part = offset === undefined ? undefined : unitAt(composition, offset);
                return errorSlot.report(
                  part === undefined
                    ? { message, phase: "eval" }
                    : { message, phase: "eval", part },
                );
              }),
            );
            yield* SubscriptionRef.set(ref, liveCodeAfter(performance, live, scope));
            yield* errorSlot.clear;
          }),
        );

      return { current: SubscriptionRef.get(ref), changes: ref.changes, apply };
    }),
  );
}
