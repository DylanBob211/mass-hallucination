import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Stream, SubscriptionRef, TestClock } from "effect";
import { makeFakeStrudel } from "./fakes";
import { transportPollInterval, ViewModelStore } from "./ViewModelStore";
import { initialViewModel, type ViewModel } from "./viewModel";

/** Collects every view model the store publishes into a ref the test can read. */
const withStore = Effect.gen(function* () {
  const strudel = yield* makeFakeStrudel();
  const seen = yield* SubscriptionRef.make<ReadonlyArray<ViewModel>>([]);
  const collect = Effect.flatMap(ViewModelStore, (store) =>
    Stream.runForEach(store.changes, (vm) => SubscriptionRef.update(seen, (all) => [...all, vm])),
  );
  const layer = ViewModelStore.layer.pipe(Layer.provide(strudel.layer));
  yield* Effect.forkScoped(Effect.provide(collect, layer));
  yield* TestClock.adjust(0);
  const last = Effect.map(SubscriptionRef.get(seen), (all) => all.at(-1));
  const tick = TestClock.adjust(transportPollInterval);
  return { strudel, seen, last, tick };
});

describe("ViewModelStore", () => {
  it.scoped("starts stopped at Strudel's default tempo", () =>
    Effect.gen(function* () {
      const { last } = yield* withStore;
      expect(yield* last).toEqual({ transport: { started: false, cps: 0.5 }, cycle: 0 });
      expect(yield* last).toBe(initialViewModel);
    }),
  );

  it.scoped("follows the tempo and the cycle as the scheduler moves", () =>
    Effect.gen(function* () {
      const { strudel, last, tick } = yield* withStore;

      yield* strudel.setCps(0.75);
      yield* strudel.setPosition(12.6);
      yield* tick;

      expect(yield* last).toEqual({ transport: { started: false, cps: 0.75 }, cycle: 12 });
    }),
  );

  it.scoped("reuses the transport object while only the cycle changes", () =>
    Effect.gen(function* () {
      const { strudel, last, tick } = yield* withStore;
      yield* strudel.setPosition(1);
      yield* tick;
      const before = yield* last;

      yield* strudel.setPosition(2);
      yield* tick;
      const after = yield* last;

      expect(after?.cycle).toBe(2);
      expect(after?.transport).toBe(before?.transport);
      expect(Object.isFrozen(after)).toBe(true);
    }),
  );

  it.scoped("publishes nothing while nothing it shows changes", () =>
    Effect.gen(function* () {
      const { strudel, seen, tick } = yield* withStore;
      yield* strudel.setPosition(0.4);
      yield* tick;
      yield* tick;

      expect(yield* SubscriptionRef.get(seen)).toHaveLength(1);
    }),
  );

  it.scoped("never shows a cycle below 0", () =>
    Effect.gen(function* () {
      const { strudel, last, tick } = yield* withStore;
      yield* strudel.setPosition(-0.05);
      yield* tick;
      expect((yield* last)?.cycle).toBe(0);
    }),
  );
});
