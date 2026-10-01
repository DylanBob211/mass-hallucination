import { Context, type Effect, type Stream } from "effect";

/** One main-thread task that ran longer than 50 ms: from `at` (epoch ms), for `duration` ms. */
export interface LongTask {
  readonly at: number;
  readonly duration: number;
}

/** The page the Performance runs in, beyond the editor and the repl. */
export class Page extends Context.Tag("Page")<
  Page,
  {
    /** Each long task on the main thread from now on (spec §11). */
    readonly longTasks: Stream.Stream<LongTask>;
    /**
     * The time (epoch ms) of each frame the page drew from `from` until `to`, starting with the
     * last one before `from`, so the first gap spans whatever was running at `from`. Waits until
     * `to` has passed.
     */
    readonly frames: (from: number, to: number) => Effect.Effect<ReadonlyArray<number>>;
    /** Hands the performer a file named `name` holding `text` to save. */
    readonly download: (name: string, text: string) => Effect.Effect<void>;
  }
>() {}
