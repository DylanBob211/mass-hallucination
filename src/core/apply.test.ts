import { describe, expect, it } from "@effect/vitest";
import { Effect, Either, Layer } from "effect";
import { apply, stopTransport } from "./apply";
import { ErrorSlotStore } from "./ErrorSlotStore";
import { makeFakeEditor, makeFakeStrudel } from "./fakes";
import type { Scope } from "./liveCode";
import { LiveCodeStore } from "./LiveCodeStore";
import { Strudel } from "./Strudel";

const setup = (source: string) =>
  Effect.gen(function* () {
    const editor = yield* makeFakeEditor(source);
    const strudel = yield* makeFakeStrudel();
    // Built once, so every Apply in a test shares one Live code.
    const context = yield* Layer.build(
      LiveCodeStore.layer.pipe(
        Layer.provideMerge(ErrorSlotStore.layer),
        Layer.provideMerge(Layer.merge(editor.layer, strudel.layer)),
      ),
    );
    return { editor, strudel, context };
  });

const currentLiveCode = Effect.flatMap(LiveCodeStore, (store) => store.current);
const currentError = Effect.flatMap(ErrorSlotStore, (store) => store.current);

const seed = `samples('github:tidalcycles/dirt-samples')
kick: s("bd*4")
hats: s("hh*8")`;

describe("apply", () => {
  it.scoped("of every Part evaluates the Source's units in Source order", () =>
    Effect.gen(function* () {
      const { strudel, context } = yield* setup(seed);

      yield* Effect.provide(apply(), context);

      expect(strudel.evaluated).toEqual([seed]);
    }),
  );

  it.scoped("starts the transport", () =>
    Effect.gen(function* () {
      const { context } = yield* setup(seed);

      const started = yield* Effect.provide(
        Effect.andThen(
          apply(),
          Effect.flatMap(Strudel, (s) => s.transport),
        ),
        context,
      );

      expect(started.started).toBe(true);
    }),
  );

  it.scoped("of one Part keeps the rest as they are playing, and an Unapplied Part silent", () =>
    Effect.gen(function* () {
      const { editor, strudel, context } = yield* setup(seed);
      yield* Effect.provide(apply(), context);
      yield* editor.type(`samples('github:tidalcycles/dirt-samples')
kick: s("bd*2")
hats: s("hh*16")
bass: note("c2")`);

      yield* Effect.provide(apply(["hats"]), context);

      expect(strudel.evaluated[1]).toBe(`samples('github:tidalcycles/dirt-samples')
kick: s("bd*4")
hats: s("hh*16")`);
    }),
  );

  it.scoped("makes the in-Scope Parts' text their Live code, and only theirs", () =>
    Effect.gen(function* () {
      const { editor, strudel, context } = yield* setup(seed);
      yield* Effect.provide(apply(), context);
      yield* editor.type(seed.replace("bd*4", "bd*2").replace("hh*8", "hh*16"));
      yield* Effect.provide(apply(["hats"]), context);

      yield* editor.type(seed.replace("bd*4", "bd*2").replace("hh*8", "hh*3"));
      yield* Effect.provide(apply(["(preamble)"]), context);

      expect(strudel.evaluated[2]).toBe(`samples('github:tidalcycles/dirt-samples')
kick: s("bd*4")
hats: s("hh*16")`);
    }),
  );

  it.scoped("fails with the evaluation error and keeps the previous Live code", () =>
    Effect.gen(function* () {
      const { editor, strudel, context } = yield* setup(seed);
      yield* Effect.provide(apply(), context);
      yield* editor.type(seed.replace("hh*8", "hh*16"));
      yield* strudel.failWith("Unexpected token");

      const result = yield* Effect.either(Effect.provide(apply(), context));

      expect(Either.getLeft(result).pipe((e) => e._tag === "Some" && e.value.message)).toBe(
        "Unexpected token",
      );
      const live = yield* Effect.provide(currentLiveCode, context);
      expect(live.parts.get("hats")).toBe('hats: s("hh*8")');
    }),
  );

  describe("a deleted Part", () => {
    const withoutKick = `samples('github:tidalcycles/dirt-samples')
hats: s("hh*16")`;

    it.scoped("keeps sounding through a narrower Apply, after the Parts in the Source", () =>
      Effect.gen(function* () {
        const { editor, strudel, context } = yield* setup(seed);
        yield* Effect.provide(apply(), context);
        yield* editor.type(withoutKick);

        yield* Effect.provide(apply(["hats"]), context);
        yield* Effect.provide(apply(["hats"]), context);

        const expected = `${withoutKick}\nkick: s("bd*4")`;
        expect(strudel.evaluated.slice(1)).toEqual([expected, expected]);
      }),
    );

    it.scoped("goes silent, and its Live code is dropped, on an Apply of every Part", () =>
      Effect.gen(function* () {
        const { editor, strudel, context } = yield* setup(seed);
        yield* Effect.provide(apply(), context);
        yield* editor.type(withoutKick);

        yield* Effect.provide(apply(), context);
        yield* Effect.provide(apply(["hats"]), context);

        expect(strudel.evaluated.slice(1)).toEqual([withoutKick, withoutKick]);
        expect((yield* Effect.provide(currentLiveCode, context)).parts.has("kick")).toBe(false);
      }),
    );
  });

  describe("the Preamble", () => {
    it.scoped("contributes nothing before it is first applied", () =>
      Effect.gen(function* () {
        const { strudel, context } = yield* setup(seed);

        yield* Effect.provide(apply(["kick"]), context);

        expect(strudel.evaluated).toEqual(['kick: s("bd*4")']);
      }),
    );

    it.scoped("keeps its place between Parts while it has no Unapplied edits", () =>
      Effect.gen(function* () {
        const source = `kick: s("bd*4")\nsetcps(0.6)\nhats: s("hh*8")`;
        const { editor, strudel, context } = yield* setup(source);
        yield* Effect.provide(apply(), context);
        yield* editor.type(source.replace("hh*8", "hh*16"));

        yield* Effect.provide(apply(["hats"]), context);

        expect(strudel.evaluated[1]).toBe(`kick: s("bd*4")\nsetcps(0.6)\nhats: s("hh*16")`);
      }),
    );

    it.scoped("plays its Live code first while it has Unapplied edits out of Scope", () =>
      Effect.gen(function* () {
        const source = `kick: s("bd*4")\nsetcps(0.6)\nhats: s("hh*8")`;
        const { editor, strudel, context } = yield* setup(source);
        yield* Effect.provide(apply(), context);
        yield* editor.type(`kick: s("bd*4")\nsetcps(0.9)\nhats: s("hh*16")`);

        yield* Effect.provide(apply(["hats"]), context);

        expect(strudel.evaluated[1]).toBe(`setcps(0.6)\nkick: s("bd*4")\nhats: s("hh*16")`);
      }),
    );
  });
});

describe("a failed Apply's Part", () => {
  /** The Part the error slot names after an Apply of `scope` over `source` fails `at`. */
  const failAt = (source: string, at?: (composition: string) => number, scope?: Scope) =>
    Effect.gen(function* () {
      const { strudel, context } = yield* setup(source);
      yield* strudel.failWith("Unexpected token", at);
      yield* Effect.ignore(Effect.provide(apply(scope), context));
      return (yield* Effect.provide(currentError, context))?.part;
    });

  it.scoped("is the in-Scope Part whose text holds the offset", () =>
    Effect.gen(function* () {
      const part = yield* failAt(seed, (code) => code.indexOf("hh*8"));
      expect(part).toBe("hats");
    }),
  );

  it.scoped("is the Part at the end of the composition for an error at its very end", () =>
    Effect.gen(function* () {
      const part = yield* failAt(`${seed}.gain(`, (code) => code.length);
      expect(part).toBe("hats");
    }),
  );

  it.scoped("names the Preamble as a Scope does", () =>
    Effect.gen(function* () {
      const part = yield* failAt(seed, (code) => code.indexOf("samples"));
      expect(part).toBe("(preamble)");
    }),
  );

  it.scoped("is an out-of-Scope Part, or a deleted one, by the Live code it contributes", () =>
    Effect.gen(function* () {
      const { editor, strudel, context } = yield* setup(seed);
      yield* Effect.provide(apply(), context);
      yield* editor.type(`samples('github:tidalcycles/dirt-samples')\nhats: s("hh*16")`);
      const partAt = (text: string) =>
        Effect.gen(function* () {
          yield* strudel.failWith("boom", (code) => code.indexOf(text));
          yield* Effect.ignore(Effect.provide(apply(["hats"]), context));
          return (yield* Effect.provide(currentError, context))?.part;
        });

      expect(yield* partAt("bd*4")).toBe("kick");
      expect(yield* partAt("hh*16")).toBe("hats");
    }),
  );

  it.scoped("is none when the error has no offset", () =>
    Effect.gen(function* () {
      const part = yield* failAt(seed);
      expect(part).toBeUndefined();
    }),
  );
});

describe("stopTransport", () => {
  it.scoped("stops a running transport", () =>
    Effect.gen(function* () {
      const { context } = yield* setup(seed);

      const started = yield* Effect.provide(
        Effect.gen(function* () {
          yield* apply();
          yield* stopTransport;
          return (yield* Effect.flatMap(Strudel, (s) => s.transport)).started;
        }),
        context,
      );

      expect(started).toBe(false);
    }),
  );
});
