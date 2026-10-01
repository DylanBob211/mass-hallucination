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

/**
 * A note never heard because it came too late (spec §11), at `at` (epoch ms): dropped by the
 * `scheduler` with the rest of a tick it reached `lateBy` ms after the tick's time, or by the
 * audio `output` it reached `lateBy` ms after the note's time.
 */
export interface LateNote {
  readonly at: number;
  readonly lateBy: number;
  readonly where: "scheduler" | "output";
}

/** An error the playing code threw, and the Visual Part that threw it when it was one. */
export interface PlaybackError {
  readonly message: string;
  readonly part?: string;
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
    /**
     * Each error the playing code throws after evaluate, from now on: the pattern's, each time, and
     * each Visual Part's first since the evaluate that ran it (spec §8).
     */
    readonly playbackErrors: Stream.Stream<PlaybackError>;
    /** Each late note from now on (spec §11). */
    readonly lateNotes: Stream.Stream<LateNote>;
  }
>() {}
