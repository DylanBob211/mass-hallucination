import { describe, expect, it } from "@effect/vitest";
import { Effect, Either, Fiber, Layer, TestClock } from "effect";
import { apply } from "./apply";
import { ErrorSlotStore } from "./ErrorSlotStore";
import { makeFakeEditor, makeFakeStrudel } from "./fakes";
import { preambleId, type Scope } from "./liveCode";
import { LiveCodeStore } from "./LiveCodeStore";

const setup = (source: string) =>
  Effect.gen(function* () {
    const editor = yield* makeFakeEditor(source);
    const strudel = yield* makeFakeStrudel();
    const context = yield* Layer.build(
      LiveCodeStore.layer.pipe(
        Layer.provideMerge(ErrorSlotStore.layer),
        Layer.provideMerge(Layer.merge(editor.layer, strudel.layer)),
      ),
    );
    const dryRun = (scope: Scope, texts: Record<string, string>) =>
      Effect.provide(
        Effect.flatMap(LiveCodeStore, (store) =>
          store.dryRun(scope, new Map(Object.entries(texts))),
        ),
        context,
      );
    const liveCode = Effect.provide(
      Effect.flatMap(LiveCodeStore, (store) => store.current),
      context,
    );
    const error = Effect.provide(
      Effect.flatMap(ErrorSlotStore, (store) => store.current),
      context,
    );
    return { editor, strudel, context, dryRun, liveCode, error };
  });

const seed = `samples('github:tidalcycles/dirt-samples')
kick: s("bd*4")
hats: s("hh*8")`;

describe("dryRun", () => {
  it.scoped("evaluates the composition the Apply of its Scope would, with the texts in place", () =>
    Effect.gen(function* () {
      const { editor, strudel, context, dryRun } = yield* setup(seed);
      yield* Effect.provide(apply(), context);
      // The human is mid-edit in kick; the change is to hats.
      yield* editor.type(seed.replace("bd*4", "bd*2"));

      yield* dryRun(["hats"], { hats: 'hats: s("hh*16")' });

      expect(strudel.dryRuns).toEqual([
        `samples('github:tidalcycles/dirt-samples')
kick: s("bd*4")
hats: s("hh*16")`,
      ]);
    }),
  );

  it.scoped("appends a new Part at the end, and replaces the Preamble as one unit", () =>
    Effect.gen(function* () {
      const { strudel, context, dryRun } = yield* setup(`setcps(.5)
kick: s("bd*4")
$: s("cp")
hats: s("hh*8")`);
      yield* Effect.provide(apply(), context);

      yield* dryRun([preambleId, "bass"], {
        [preambleId]: "setcps(.6)",
        bass: 'bass: note("c2")',
      });

      expect(strudel.dryRuns).toEqual([
        `setcps(.6)
kick: s("bd*4")
hats: s("hh*8")
bass: note("c2")`,
      ]);
    }),
  );

  it.scoped("puts every text in Scope, so none goes unevaluated", () =>
    Effect.gen(function* () {
      const { strudel, context, dryRun } = yield* setup(seed);
      yield* Effect.provide(apply(), context);

      yield* dryRun(["kick"], { hats: 'hats: s("hh*16")', bass: 'bass: note("c2")' });

      expect(strudel.dryRuns).toEqual([seed.replace("hh*8", "hh*16") + '\nbass: note("c2")']);
    }),
  );

  it.scoped("evaluates exactly what the Apply does once the texts are written", () =>
    Effect.gen(function* () {
      const { editor, strudel, context, dryRun } = yield* setup(seed);
      yield* Effect.provide(apply(), context);
      yield* editor.type(seed.replace("bd*4", "bd*2"));

      yield* dryRun("every", { hats: 'hats: s("hh*16")', lead: 'lead: note("e4")' });
      yield* editor.type(
        seed.replace("bd*4", "bd*2").replace("hh*8", "hh*16") + '\nlead: note("e4")',
      );
      yield* Effect.provide(apply(), context);

      expect(strudel.dryRuns).toEqual([strudel.evaluated[1]]);
    }),
  );

  it.scoped("changes no Live code, evaluates nothing and leaves the error slot alone", () =>
    Effect.gen(function* () {
      const { strudel, context, dryRun, liveCode, error } = yield* setup(seed);
      yield* Effect.provide(apply(), context);
      yield* strudel.failWhilePlaying("sound nope not found");
      yield* TestClock.adjust(0);
      const before = { live: yield* liveCode, error: yield* error };

      yield* dryRun(["hats"], { hats: 'hats: s("hh*16")' });
      yield* strudel.failDryRunWith("nope is not defined");
      yield* Effect.either(dryRun(["hats"], { hats: "hats: nope" }));

      expect(strudel.evaluated).toHaveLength(1);
      expect(yield* liveCode).toBe(before.live);
      expect(yield* error).toEqual(before.error);
    }),
  );

  it.scoped("is invalid with the message, and the Part where the error is placed", () =>
    Effect.gen(function* () {
      const { strudel, context, dryRun } = yield* setup(seed);
      yield* Effect.provide(apply(), context);
      yield* strudel.failDryRunWith("Unexpected token", { at: (code) => code.indexOf("gain(") });

      const result = yield* Effect.either(dryRun(["hats"], { hats: 'hats: s("hh").gain(' }));

      expect(Either.getLeft(result)).toMatchObject({
        _tag: "Some",
        value: { _tag: "Invalid", message: "Unexpected token", part: "hats" },
      });
    }),
  );

  it.scoped(
    "finds the Part of an error with no place as the first unit whose code up to it fails so",
    () =>
      Effect.gen(function* () {
        const source = `${seed}
chords: note("c3")`;
        const { strudel, context, dryRun } = yield* setup(source);
        yield* Effect.provide(apply(), context);
        yield* strudel.failDryRunWith("nope is not defined", {
          when: (code) => code.includes("nope"),
        });

        const result = yield* Effect.either(dryRun(["hats"], { hats: "hats: nope" }));

        expect(Either.getLeft(result)).toMatchObject({
          _tag: "Some",
          value: { _tag: "Invalid", message: "nope is not defined", part: "hats" },
        });
      }),
  );

  it.scoped("blames the last unit for an error only the whole composition makes", () =>
    Effect.gen(function* () {
      const { strudel, context, dryRun } = yield* setup(seed);
      yield* Effect.provide(apply(), context);
      yield* strudel.failDryRunWith("too slow", {
        when: (code) => code.includes("kick") && code.includes("hats"),
      });

      const result = yield* Effect.either(dryRun(["kick"], { kick: 'kick: s("bd*64")' }));

      expect(Either.getLeft(result)).toMatchObject({
        _tag: "Some",
        value: { _tag: "Invalid", message: "too slow", part: "hats" },
      });
    }),
  );

  it.scoped("returns warnings, each with the Part it is in", () =>
    Effect.gen(function* () {
      const { strudel, context, dryRun } = yield* setup(seed);
      yield* Effect.provide(apply(), context);
      yield* strudel.warnDryRun("size and roomsize set the same control", (code) =>
        code.indexOf("hats"),
      );

      const warnings = yield* dryRun(["hats"], { hats: 'hats: s("hh").size(1).roomsize(2)' });

      expect(warnings).toEqual(["hats: size and roomsize set the same control"]);
    }),
  );

  it.scoped("waits for an Apply in progress, as one mutex serialises them", () =>
    Effect.gen(function* () {
      const { strudel, context, dryRun } = yield* setup(seed);
      yield* strudel.holdEvaluates;
      const applying = yield* Effect.fork(Effect.provide(apply(), context));
      yield* TestClock.adjust(0);

      const dryRunning = yield* Effect.fork(dryRun(["hats"], { hats: 'hats: s("hh*16")' }));
      yield* TestClock.adjust(0);
      const whileApplying = [...strudel.dryRuns];
      yield* strudel.releaseEvaluates;
      yield* Fiber.join(applying);
      yield* Fiber.join(dryRunning);

      expect(whileApplying).toEqual([]);
      // Composed after the Apply, from the Live code it left.
      expect(strudel.dryRuns).toEqual([seed.replace("hh*8", "hh*16")]);
    }),
  );
});
