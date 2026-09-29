import { describe, expect, it } from "@effect/vitest";
import { Effect, Either, Layer } from "effect";
import { apply, stopTransport } from "./apply";
import { makeFakeEditor, makeFakeStrudel } from "./fakes";
import { Strudel } from "./Strudel";

const setup = (source: string) =>
  Effect.gen(function* () {
    const editor = yield* makeFakeEditor(source);
    const strudel = yield* makeFakeStrudel();
    return { editor, strudel, layer: Layer.merge(editor.layer, strudel.layer) };
  });

describe("apply", () => {
  it.effect("evaluates the Source as it is now and starts the transport", () =>
    Effect.gen(function* () {
      const { editor, strudel, layer } = yield* setup('s("bd")');
      yield* editor.type('s("bd*4")');

      yield* Effect.provide(apply, layer);

      expect(strudel.evaluated).toEqual(['s("bd*4")']);
      const transport = yield* Effect.provide(
        Effect.flatMap(Strudel, (s) => s.transport),
        layer,
      );
      expect(transport.started).toBe(true);
    }),
  );

  it.effect("fails with the evaluation error", () =>
    Effect.gen(function* () {
      const { strudel, layer } = yield* setup("s(");
      yield* strudel.failWith("Unexpected token");

      const result = yield* Effect.either(Effect.provide(apply, layer));

      expect(Either.getLeft(result).pipe((e) => e._tag === "Some" && e.value.message)).toBe(
        "Unexpected token",
      );
    }),
  );
});

describe("stopTransport", () => {
  it.effect("stops a running transport", () =>
    Effect.gen(function* () {
      const { layer } = yield* setup('s("bd")');

      const started = yield* Effect.provide(
        Effect.gen(function* () {
          yield* apply;
          yield* stopTransport;
          return (yield* Effect.flatMap(Strudel, (s) => s.transport)).started;
        }),
        layer,
      );

      expect(started).toBe(false);
    }),
  );
});
