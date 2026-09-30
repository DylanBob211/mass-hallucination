import { Context, Effect, FiberSet, Layer, Stream, SubscriptionRef } from "effect";
import type { Scope } from "./liveCode";
import { LiveCodeStore } from "./LiveCodeStore";
import { Strudel } from "./Strudel";

/**
 * How long, in milliseconds, one wait for a cycle boundary lasts at least and at most. The wait
 * is computed from the tempo, then checked against the scheduler, which may lag it; a tempo
 * change or a stop is seen within the longest step.
 */
const shortestStepMillis = 5;
const longestStepMillis = 50;

/**
 * Agent Applies (spec §5): each waits for the next cycle boundary, as the agent lands whenever its
 * latency runs out, while the human times their own. They belong to the Performance, not to the
 * Turn that scheduled them, so the Turn ending never cancels one.
 */
export class AgentApplies extends Context.Tag("AgentApplies")<
  AgentApplies,
  {
    /**
     * Applies `scope` at the next cycle boundary, if its Parts still hold the texts the agent
     * `written` (see `LiveCodeStore.apply`). On a stopped transport, now or by then, it makes them
     * Live code and starts nothing.
     */
    readonly schedule: (scope: Scope, written: ReadonlyMap<string, string>) => Effect.Effect<void>;
    /** The cycle the next waiting Apply plays at, or `undefined`: now, then on every change. */
    readonly waiting: Stream.Stream<number | undefined>;
  }
>() {
  static readonly layer = Layer.scoped(
    AgentApplies,
    Effect.gen(function* () {
      const strudel = yield* Strudel;
      const liveCode = yield* LiveCodeStore;
      const fibers = yield* FiberSet.make();
      const cycles = yield* SubscriptionRef.make<ReadonlyArray<number>>([]);

      /**
       * Waits until the scheduler reaches `cycle`, and says whether it did, or whether the
       * transport stopped first. A position going back is a stop and a restart.
       */
      const boundary = (cycle: number) =>
        Effect.gen(function* () {
          let last = 0;
          for (;;) {
            const { started, cps } = yield* strudel.transport;
            const position = yield* strudel.position;
            if (!started || position < last) return false;
            if (position >= cycle) return true;
            last = position;
            const wait = ((cycle - position) / cps) * 1000;
            yield* Effect.sleep(Math.min(longestStepMillis, Math.max(shortestStepMillis, wait)));
          }
        });

      const schedule = (scope: Scope, written: ReadonlyMap<string, string>) =>
        Effect.gen(function* () {
          if (!(yield* strudel.transport).started)
            return yield* liveCode.setLiveCode(scope, written);
          const cycle = Math.floor(yield* strudel.position) + 1;
          yield* SubscriptionRef.update(cycles, (waiting) => [...waiting, cycle]);
          yield* FiberSet.run(
            fibers,
            boundary(cycle).pipe(
              Effect.flatMap((reached) =>
                // A failed Apply leaves what played playing, and the error slot says why.
                reached
                  ? Effect.ignore(liveCode.apply(scope, written))
                  : liveCode.setLiveCode(scope, written),
              ),
              Effect.ensuring(
                SubscriptionRef.update(cycles, (waiting) => {
                  const index = waiting.indexOf(cycle);
                  return waiting.filter((_, i) => i !== index);
                }),
              ),
            ),
          );
        });

      return {
        schedule,
        waiting: cycles.changes.pipe(
          Stream.map((waiting) => (waiting.length === 0 ? undefined : Math.min(...waiting))),
          Stream.changes,
        ),
      };
    }),
  );
}
