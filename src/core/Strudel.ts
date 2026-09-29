import { Context, Data, type Effect, type Stream } from "effect";
import type { Transport } from "./viewModel";

/**
 * Evaluating code failed; whatever was playing keeps playing. `offset` is where in that code it
 * failed, when Strudel tells.
 */
export class EvalError extends Data.TaggedError("EvalError")<{
  readonly message: string;
  readonly offset?: number;
}> {}

/** Something a dry-run found that is not an error, and where in the code it is. */
export interface DryRunWarning {
  readonly message: string;
  readonly offset?: number;
}

/** The embedded `@strudel/web` repl (ADR 0002). */
export class Strudel extends Context.Tag("Strudel")<
  Strudel,
  {
    /** Evaluates `code` as the new pattern, starting the transport if it is stopped. */
    readonly evaluate: (code: string) => Effect.Effect<void, EvalError>;
    /**
     * Evaluates `code` as `evaluate` would, and queries what it makes, without touching what plays
     * (spec §6.3). Fails as `evaluate` would fail, and also when the query fails or runs too long
     * or the code calls `hush()`. Runs one at a time with `evaluate`.
     */
    readonly dryRun: (code: string) => Effect.Effect<ReadonlyArray<DryRunWarning>, EvalError>;
    /** Stops the transport; the cycle count returns to 0. */
    readonly stop: Effect.Effect<void>;
    readonly transport: Effect.Effect<Transport>;
    /** The scheduler's position in fractional cycles; 0 while stopped. */
    readonly position: Effect.Effect<number>;
    /** The message of each error the playing pattern throws after evaluate, from now on. */
    readonly playbackErrors: Stream.Stream<string>;
  }
>() {}
