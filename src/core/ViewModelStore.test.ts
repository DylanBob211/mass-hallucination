import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Stream, SubscriptionRef, TestClock } from "effect";
import { makeFakeEditor, makeFakeStrudel } from "./fakes";
import { transportPollInterval, ViewModelStore } from "./ViewModelStore";
import { initialViewModel, type ViewModel } from "./viewModel";

/** Collects every view model the store publishes over `source` into a ref the test can read. */
const withSource = (source: string) =>
  Effect.gen(function* () {
    const editor = yield* makeFakeEditor(source);
    const strudel = yield* makeFakeStrudel();
    const seen = yield* SubscriptionRef.make<ReadonlyArray<ViewModel>>([]);
    const collect = Effect.flatMap(ViewModelStore, (store) =>
      Stream.runForEach(store.changes, (vm) => SubscriptionRef.update(seen, (all) => [...all, vm])),
    );
    const layer = ViewModelStore.layer.pipe(
      Layer.provide(Layer.merge(editor.layer, strudel.layer)),
    );
    yield* Effect.forkScoped(Effect.provide(collect, layer));
    yield* TestClock.adjust(0);
    const last = Effect.map(SubscriptionRef.get(seen), (all) => all.at(-1));
    const tick = TestClock.adjust(transportPollInterval);
    /** Replaces the Source, as a human typing would, and lets the store see it. */
    const edit = (next: string) => Effect.andThen(editor.type(next), TestClock.adjust(0));
    return { edit, strudel, seen, last, tick };
  });

const withStore = withSource("");

describe("ViewModelStore", () => {
  it.scoped("starts stopped at Strudel's default tempo", () =>
    Effect.gen(function* () {
      const { last } = yield* withStore;
      expect(yield* last).toEqual({
        transport: { started: false, cps: 0.5 },
        cycle: 0,
        parts: [],
      });
      expect(yield* last).toBe(initialViewModel);
    }),
  );

  it.scoped("follows the tempo and the cycle as the scheduler moves", () =>
    Effect.gen(function* () {
      const { strudel, last, tick } = yield* withStore;

      yield* strudel.setCps(0.75);
      yield* strudel.setPosition(12.6);
      yield* tick;

      expect(yield* last).toEqual({
        transport: { started: false, cps: 0.75 },
        cycle: 12,
        parts: [],
      });
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

  describe("Parts", () => {
    const seed = `setcps(0.5)
kick: s("bd*4")
_hats: s("hh*8")
Sviz: hydra\`osc().out()\``;

    it.scoped("lists the Source's Parts with muted, soloed and Surface", () =>
      Effect.gen(function* () {
        const { last } = yield* withSource(seed);

        expect((yield* last)?.parts).toEqual([
          { id: "kick", muted: false, soloed: false, surface: "audio" },
          { id: "hats", muted: true, soloed: false, surface: "audio" },
          { id: "viz", muted: false, soloed: true, surface: "visual" },
        ]);
      }),
    );

    it.scoped("re-derives them on every edit", () =>
      Effect.gen(function* () {
        const { edit, last } = yield* withSource(seed);

        yield* edit('kick: s("bd*4")\nSchords: note("c3")');

        expect((yield* last)?.parts).toEqual([
          { id: "kick", muted: false, soloed: false, surface: "audio" },
          { id: "chords", muted: false, soloed: true, surface: "audio" },
        ]);
      }),
    );

    it.scoped("reuses unchanged Parts, and the list while no Part changes", () =>
      Effect.gen(function* () {
        const { edit, strudel, last, tick } = yield* withSource(seed);
        const before = yield* last;

        yield* strudel.setPosition(3);
        yield* tick;
        expect((yield* last)?.parts).toBe(before?.parts);

        yield* edit(seed.replace("_hats", "hats"));
        const after = yield* last;

        expect(after?.parts[1]).toEqual({
          id: "hats",
          muted: false,
          soloed: false,
          surface: "audio",
        });
        expect(after?.parts[0]).toBe(before?.parts[0]);
        expect(after?.parts[2]).toBe(before?.parts[2]);
      }),
    );

    it.scoped("publishes nothing for an edit that changes no Part's view", () =>
      Effect.gen(function* () {
        const { edit, seen } = yield* withSource(seed);

        yield* edit(seed.replace('"bd*4"', '"bd*2"'));

        expect(yield* SubscriptionRef.get(seen)).toHaveLength(1);
      }),
    );
  });
});
