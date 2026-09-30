import { Clock, Context, DateTime, Effect, Layer, Ref, Stream } from "effect";
import type { Tokens } from "./Model";
import { type LongTask, Page } from "./Page";
import { type LateNote, Strudel } from "./Strudel";
import type { TurnState } from "./viewModel";

/**
 * A Turn as the log records it (spec §11 item 1). Times are epoch milliseconds, `null` until
 * they happen. `landed` is when the change landed (Proposal shown, written, or scheduled);
 * `heard` is when an agent Apply played it, at its cycle boundary, which may be after the Turn
 * ended.
 */
export interface TurnRecord {
  readonly instruction: string;
  readonly aim: string | null;
  readonly enter: number;
  readonly firstCharacter: number | null;
  readonly landed: number | null;
  readonly heard: number | null;
  readonly ended: number | null;
  readonly ending: TurnState | null;
  /** Requests sent to the model. */
  readonly calls: number;
  readonly retries: number;
  readonly tokens: Tokens;
}

/** What a Turn tells the log as it runs. */
export type TurnEvent =
  /** The model streamed some text or tool input; only the first counts. */
  | { readonly _tag: "Streamed" }
  /** A request went to the model. */
  | { readonly _tag: "Called" }
  | { readonly _tag: "Used"; readonly tokens: Tokens }
  /** The Turn ended as `ending`, having retried `retries` times. */
  | { readonly _tag: "Ended"; readonly ending: TurnState; readonly retries: number }
  /** The agent Apply of the Turn's change played. */
  | { readonly _tag: "Heard" };

/** Something that could disturb the Performance, marked with whether a Turn was running. */
export type Marked<A> = A & { readonly duringTurn: boolean };

/** Everything the log holds, as downloaded. */
export interface Log {
  readonly turns: ReadonlyArray<TurnRecord>;
  readonly longTasks: ReadonlyArray<Marked<LongTask>>;
  readonly lateNotes: ReadonlyArray<Marked<LateNote>>;
}

const noTokens: Tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/** Adds up `a` and `b`. */
const plus = (a: Tokens, b: Tokens): Tokens => ({
  input: a.input + b.input,
  output: a.output + b.output,
  cacheRead: a.cacheRead + b.cacheRead,
  cacheWrite: a.cacheWrite + b.cacheWrite,
});

/** `record` after `event`, at `now`. */
const recorded = (record: TurnRecord, event: TurnEvent, now: number): TurnRecord => {
  switch (event._tag) {
    case "Streamed":
      return record.firstCharacter === null ? { ...record, firstCharacter: now } : record;
    case "Called":
      return { ...record, calls: record.calls + 1 };
    case "Used":
      return { ...record, tokens: plus(record.tokens, event.tokens) };
    case "Ended":
      return {
        ...record,
        ended: now,
        ending: event.ending,
        retries: event.retries,
        ...(event.ending === "landed" && { landed: now }),
      };
    case "Heard":
      return { ...record, heard: now };
  }
};

/** Whether any of `turns` was running at some time from `from` to `to`. */
const duringTurn = (turns: ReadonlyArray<TurnRecord>, from: number, to: number) =>
  turns.some(({ enter, ended }) => enter <= to && (ended === null || ended >= from));

/**
 * What the budget (spec §12.5) is judged by, kept in memory for this session only (spec §11):
 * each Turn's timings, calls and tokens, and the no-freeze monitor's long tasks and late notes.
 */
export class Instrumentation extends Context.Tag("Instrumentation")<
  Instrumentation,
  {
    /** Starts recording a Turn, its Enter now. Returns the Turn's id for `record`. */
    readonly began: (instruction: string, aim: string | null) => Effect.Effect<number>;
    /** Records `event` of the Turn `turn`, now. */
    readonly record: (turn: number, event: TurnEvent) => Effect.Effect<void>;
    /** The log so far. */
    readonly log: Effect.Effect<Log>;
  }
>() {
  static readonly layer = Layer.scoped(
    Instrumentation,
    Effect.gen(function* () {
      const turns = yield* Ref.make<ReadonlyArray<TurnRecord>>([]);
      const longTasks = yield* Ref.make<ReadonlyArray<Marked<LongTask>>>([]);
      const lateNotes = yield* Ref.make<ReadonlyArray<Marked<LateNote>>>([]);

      /** Keeps each of `stalls` in `into`, marked, each lasting from its `at` for `duration`. */
      const monitor = <A extends { readonly at: number }>(
        stalls: Stream.Stream<A>,
        into: Ref.Ref<ReadonlyArray<Marked<A>>>,
        duration: (stall: A) => number,
      ) =>
        Effect.forkScoped(
          Stream.runForEach(stalls, (stall) =>
            Effect.flatMap(Ref.get(turns), (all) =>
              Ref.update(into, (kept) => [
                ...kept,
                { ...stall, duringTurn: duringTurn(all, stall.at, stall.at + duration(stall)) },
              ]),
            ),
          ),
        );
      yield* monitor((yield* Page).longTasks, longTasks, ({ duration }) => duration);
      yield* monitor((yield* Strudel).lateNotes, lateNotes, () => 0);

      return {
        began: (instruction, aim) =>
          Effect.flatMap(Clock.currentTimeMillis, (enter) =>
            Ref.modify(turns, (all) => [
              all.length,
              [
                ...all,
                {
                  instruction,
                  aim,
                  enter,
                  firstCharacter: null,
                  landed: null,
                  heard: null,
                  ended: null,
                  ending: null,
                  calls: 0,
                  retries: 0,
                  tokens: noTokens,
                },
              ],
            ]),
          ),
        record: (turn, event) =>
          Effect.flatMap(Clock.currentTimeMillis, (now) =>
            Ref.update(turns, (all) =>
              all.map((record, i) => (i === turn ? recorded(record, event, now) : record)),
            ),
          ),
        log: Effect.all({
          turns: Ref.get(turns),
          longTasks: Ref.get(longTasks),
          lateNotes: Ref.get(lateNotes),
        }),
      };
    }),
  );
}

/** Hands the performer the log as a JSON file to save (spec §11). */
export const downloadLog = Effect.gen(function* () {
  const log = yield* (yield* Instrumentation).log;
  const now = yield* DateTime.now;
  // A name that sorts by time and is safe on every filesystem.
  const stamp = DateTime.formatIso(now).replace(/[:.]/g, "-");
  yield* (yield* Page).download(`pair-formance-log-${stamp}.json`, JSON.stringify(log, null, 2));
});
