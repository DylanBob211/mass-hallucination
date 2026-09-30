import { Effect } from "effect";
import type { Scope } from "./liveCode";
import { LiveCodeStore } from "./LiveCodeStore";
import { Strudel } from "./Strudel";

/**
 * Applies `scope` (spec §5) and starts the transport if it is stopped. The human's Ctrl-Enter is
 * the widest Scope, every Part.
 */
export const apply = (scope: Scope = "every") =>
  Effect.asVoid(Effect.flatMap(LiveCodeStore, (store) => store.apply(scope)));

export const stopTransport = Effect.flatMap(Strudel, (strudel) => strudel.stop);
