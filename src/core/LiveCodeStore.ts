import { Context, Effect, Layer, type Stream, SubscriptionRef } from "effect";
import { Editor } from "./Editor";
import { compose, type LiveCode, liveCodeAfter, noLiveCode, type Scope } from "./liveCode";
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
     * text their Live code. On failure the previous Live code keeps playing.
     */
    readonly apply: (scope: Scope) => Effect.Effect<void, EvalError>;
  }
>() {
  static readonly layer = Layer.effect(
    LiveCodeStore,
    Effect.gen(function* () {
      const editor = yield* Editor;
      const strudel = yield* Strudel;
      const ref = yield* SubscriptionRef.make(noLiveCode);
      // One Apply at a time, so each updates the Live code it composed from.
      const lock = yield* Effect.makeSemaphore(1);

      const apply = (scope: Scope) =>
        lock.withPermits(1)(
          Effect.gen(function* () {
            const performance = parsePerformance(yield* editor.read);
            const live = yield* SubscriptionRef.get(ref);
            yield* strudel.evaluate(compose(performance, live, scope));
            yield* SubscriptionRef.set(ref, liveCodeAfter(performance, live, scope));
          }),
        );

      return { current: SubscriptionRef.get(ref), changes: ref.changes, apply };
    }),
  );
}
