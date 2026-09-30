import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Stream, SubscriptionRef, TestClock } from "effect";
import { Agent } from "./Agent";
import { AgentApplies } from "./AgentApplies";
import { apply } from "./apply";
import { AutonomyStore } from "./AutonomyStore";
import { ErrorSlotStore } from "./ErrorSlotStore";
import { answers, makeFakeEditor, makeFakeModel, makeFakeStrudel } from "./fakes";
import type { Scope } from "./liveCode";
import { LiveCodeStore } from "./LiveCodeStore";
import { revOf } from "./Performance";
import { ProposalStore } from "./ProposalStore";
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
    const model = makeFakeModel([answers("The hats are fine as they are.")]);
    const context = yield* Layer.build(
      ViewModelStore.layer.pipe(
        Layer.provideMerge(Agent.layer),
        Layer.provideMerge(ProposalStore.layer),
        Layer.provideMerge(AgentApplies.layer),
        Layer.provideMerge(AutonomyStore.layer),
        Layer.provideMerge(LiveCodeStore.layer),
        Layer.provideMerge(ErrorSlotStore.layer),
        Layer.provideMerge(Layer.mergeAll(editor.layer, strudel.layer, model.layer)),
      ),
    );
    yield* Effect.forkScoped(Effect.provide(collect, context));
    yield* TestClock.adjust(0);
    const last = Effect.map(SubscriptionRef.get(seen), (all) => all.at(-1));
    const tick = TestClock.adjust(transportPollInterval);
    /** Replaces the Source, as a human typing would, and lets the store see it. */
    const edit = (next: string) => Effect.andThen(editor.type(next), TestClock.adjust(0));
    /** Applies `scope` and lets the store see what it leaves, whether it succeeds or fails. */
    const applyScope = (scope?: Scope) =>
      Effect.ensuring(Effect.provide(apply(scope), context), TestClock.adjust(0));
    /** Runs `effect` against the store's services, and lets the store see what it leaves. */
    const run = <A, E>(
      effect: Effect.Effect<A, E, AutonomyStore | AgentApplies | ProposalStore | Agent>,
    ) => Effect.ensuring(Effect.provide(effect, context), TestClock.adjust(0));
    return { edit, applyScope, run, strudel, seen, last, tick, source: editor.read };
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
        error: undefined,
        autonomy: "propose",
        waitingApply: undefined,
        proposal: undefined,
        turns: [],
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
        error: undefined,
        autonomy: "propose",
        waitingApply: undefined,
        proposal: undefined,
        turns: [],
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
          {
            id: "kick",
            muted: false,
            soloed: false,
            surface: "audio",
            unapplied: true,
            deleted: false,
          },
          {
            id: "hats",
            muted: true,
            soloed: false,
            surface: "audio",
            unapplied: true,
            deleted: false,
          },
          {
            id: "viz",
            muted: false,
            soloed: true,
            surface: "visual",
            unapplied: true,
            deleted: false,
          },
        ]);
      }),
    );

    it.scoped("re-derives them on every edit", () =>
      Effect.gen(function* () {
        const { edit, last } = yield* withSource(seed);

        yield* edit('kick: s("bd*4")\nSchords: note("c3")');

        expect((yield* last)?.parts).toEqual([
          {
            id: "kick",
            muted: false,
            soloed: false,
            surface: "audio",
            unapplied: true,
            deleted: false,
          },
          {
            id: "chords",
            muted: false,
            soloed: true,
            surface: "audio",
            unapplied: true,
            deleted: false,
          },
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
          unapplied: true,
          deleted: false,
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

  describe("Unapplied edits", () => {
    const seed = `kick: s("bd*4")
hats: s("hh*8")`;

    it.scoped("shows a Part unapplied until an Apply with it in Scope", () =>
      Effect.gen(function* () {
        const { edit, applyScope, last } = yield* withSource(seed);
        yield* applyScope();
        expect((yield* last)?.parts.map((p) => p.unapplied)).toEqual([false, false]);

        yield* edit(seed.replace("hh*8", "hh*16"));
        expect((yield* last)?.parts.map((p) => p.unapplied)).toEqual([false, true]);

        yield* applyScope(["hats"]);
        expect((yield* last)?.parts.map((p) => p.unapplied)).toEqual([false, false]);
      }),
    );

    it.scoped("shows a deleted Part still sounding after the Source's Parts, as it plays", () =>
      Effect.gen(function* () {
        const { edit, applyScope, last } = yield* withSource(seed.replace("kick", "_kick"));
        yield* applyScope();

        yield* edit('hats: s("hh*8")');
        yield* applyScope(["hats"]);

        expect((yield* last)?.parts).toEqual([
          {
            id: "hats",
            muted: false,
            soloed: false,
            surface: "audio",
            unapplied: false,
            deleted: false,
          },
          {
            id: "kick",
            muted: true,
            soloed: false,
            surface: "audio",
            unapplied: true,
            deleted: true,
          },
        ]);

        yield* applyScope();
        expect((yield* last)?.parts.map((p) => p.id)).toEqual(["hats"]);
      }),
    );

    it.scoped("keeps a Part unapplied when its Apply fails", () =>
      Effect.gen(function* () {
        const { edit, applyScope, strudel, last } = yield* withSource(seed);
        yield* applyScope();
        yield* edit(seed.replace("hh*8", "hh*16"));
        yield* strudel.failWith("Unexpected token");

        yield* Effect.ignore(applyScope());

        expect((yield* last)?.parts.map((p) => p.unapplied)).toEqual([false, true]);
      }),
    );
  });

  describe("the error slot", () => {
    const seed = `kick: s("bd*4")
hats: s("hh*8")`;

    it.scoped("shows a failed Apply's error with the Part it failed in", () =>
      Effect.gen(function* () {
        const { applyScope, strudel, last } = yield* withSource(seed);
        yield* strudel.failWith("Unexpected token", (code) => code.indexOf("hh*8"));

        yield* Effect.ignore(applyScope());

        expect((yield* last)?.error).toEqual({
          message: "Unexpected token",
          phase: "eval",
          part: "hats",
        });
      }),
    );

    it.scoped("is cleared by a successful Apply", () =>
      Effect.gen(function* () {
        const { applyScope, strudel, last } = yield* withSource(seed);
        yield* strudel.failWith("Unexpected token");
        yield* Effect.ignore(applyScope());

        yield* strudel.succeed;
        yield* applyScope(["kick"]);

        expect((yield* last)?.error).toBeUndefined();
      }),
    );

    it.scoped("shows an error while playing, with no Part", () =>
      Effect.gen(function* () {
        const { applyScope, strudel, last } = yield* withSource(seed);
        yield* applyScope();

        yield* strudel.failWhilePlaying("sound nosuchsound not found");
        yield* TestClock.adjust(0);

        expect((yield* last)?.error).toEqual({
          message: "sound nosuchsound not found",
          phase: "playback",
        });
      }),
    );

    it.scoped("shows only the newest error", () =>
      Effect.gen(function* () {
        const { applyScope, strudel, last } = yield* withSource(seed);
        yield* strudel.failWhilePlaying("no time set!");
        yield* TestClock.adjust(0);
        yield* strudel.failWith("Unexpected token", (code) => code.indexOf("bd*4"));

        yield* Effect.ignore(applyScope());
        expect((yield* last)?.error).toEqual({
          message: "Unexpected token",
          phase: "eval",
          part: "kick",
        });

        yield* strudel.failWhilePlaying("no time set!");
        yield* TestClock.adjust(0);
        expect((yield* last)?.error).toEqual({ message: "no time set!", phase: "playback" });
      }),
    );
  });

  it.scoped("shows the Autonomy the human set", () =>
    Effect.gen(function* () {
      const { run, last } = yield* withStore;

      yield* run(Effect.flatMap(AutonomyStore, (store) => store.set("apply")));

      expect((yield* last)?.autonomy).toBe("apply");
    }),
  );

  it.scoped("shows an agent Apply waiting, with the cycle it plays at, until it plays", () =>
    Effect.gen(function* () {
      const { applyScope, run, strudel, last } = yield* withSource('hats: s("hh*8")');
      yield* applyScope();
      yield* strudel.setPosition(12.4);

      yield* run(
        Effect.flatMap(AgentApplies, (applies) =>
          applies.schedule(["hats"], new Map([["hats", 'hats: s("hh*16")']])),
        ),
      );
      const waiting = (yield* last)?.waitingApply;
      yield* strudel.setPosition(13);
      yield* TestClock.adjust("2 seconds");

      expect(waiting).toEqual({ cycle: 13 });
      expect((yield* last)?.waitingApply).toBeUndefined();
    }),
  );

  it.scoped("shows the open Proposal, then Stale once the human edits its Part, until closed", () =>
    Effect.gen(function* () {
      const hats = 'hats: s("hh*8")';
      const { applyScope, edit, run, last, source } = yield* withSource(hats);
      yield* applyScope();
      const propose = Effect.flatMap(ProposalStore, (store) =>
        Effect.flatMap(source, (onto) =>
          store.propose(onto, [
            { part: "hats", rev: revOf(hats), text: 'hats: s("hh*16")' },
            { part: "bass", rev: null, text: 'bass: note("c2")' },
          ]),
        ),
      );

      yield* run(propose);
      const open = (yield* last)?.proposal;
      yield* edit('hats: s("hh*4")');
      const stale = (yield* last)?.proposal;
      yield* run(Effect.flatMap(ProposalStore, (store) => store.reject));

      expect(open).toEqual({
        changes: [
          { part: "hats", text: 'hats: s("hh*16")', added: false },
          { part: "bass", text: 'bass: note("c2")', added: true },
        ],
        stale: false,
      });
      expect(Object.isFrozen(open)).toBe(true);
      expect(stale).toEqual({ ...open, stale: true });
      expect((yield* last)?.proposal).toBeUndefined();
    }),
  );

  it.scoped("shows the agent's Turns, the latest last", () =>
    Effect.gen(function* () {
      const { run, last } = yield* withSource('hats: s("hh*8")');

      yield* run(Effect.flatMap(Agent, (agent) => agent.instruct("are the hats ok?", "hats")));

      expect((yield* last)?.turns).toEqual([
        {
          instruction: "are the hats ok?",
          aim: "hats",
          state: "answered",
          note: "The hats are fine as they are.",
          retries: 0,
        },
      ]);
    }),
  );
});
