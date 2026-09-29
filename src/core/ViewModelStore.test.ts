import { describe, expect, it } from "@effect/vitest";
import { Chunk, Effect, Stream } from "effect";
import { ViewModelStore } from "./ViewModelStore";

describe("ViewModelStore", () => {
  it.effect("starts from the empty view model", () =>
    Effect.gen(function* () {
      const store = yield* ViewModelStore;
      const first = yield* Stream.runCollect(Stream.take(store.changes, 1));
      expect(Chunk.toReadonlyArray(first)).toEqual([{}]);
    }).pipe(Effect.provide(ViewModelStore.layer)),
  );
});
