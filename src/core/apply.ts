import { Effect } from "effect";
import { Editor } from "./Editor";
import { Strudel } from "./Strudel";

/**
 * Applies the whole Source and starts the transport if it is stopped. Until Parts exist (ticket 03)
 * the Source is evaluated as it stands rather than composed from Live code (spec §5).
 */
export const apply = Effect.gen(function* () {
  const editor = yield* Editor;
  const strudel = yield* Strudel;
  yield* strudel.evaluate(yield* editor.read);
});

export const stopTransport = Effect.flatMap(Strudel, (strudel) => strudel.stop);
