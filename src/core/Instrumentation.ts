import { Clock, Context, DateTime, Effect, Layer, Ref, Stream } from "effect";
import { LiveCodeStore } from "./LiveCodeStore";
import type { Tokens } from "./Model";
import { type LongTask, Page } from "./Page";
import { parsePerformance } from "./Performance";
import { type LateNote, Strudel, type Sync } from "./Strudel";
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

/**
 * How the page drew in the second after an Apply began to evaluate (spec §11 item 3), at `at`
 * (epoch ms), with `visualParts` Visual Parts drawing once it had. `frames` are the gaps between
 * frames in ms, the first spanning the evaluate; `dropped` is how many frames those gaps left out,
 * counting the typical (median) gap of the second before as one frame.
 */
export interface FrameTimes {
  readonly at: number;
  readonly visualParts: number;
  readonly frames: ReadonlyArray<number>;
  readonly longest: number;
  readonly dropped: number;
}

/** Everything the log holds, as downloaded. */
export interface Log {
  readonly turns: ReadonlyArray<TurnRecord>;
  readonly longTasks: ReadonlyArray<Marked<LongTask>>;
  readonly lateNotes: ReadonlyArray<Marked<LateNote>>;
  readonly frameTimes: ReadonlyArray<FrameTimes>;
  readonly syncs: ReadonlyArray<Sync>;
}

/**
 * How long after an Apply begins to evaluate its frame times are kept, in ms; as long before it
 * tells how long a frame is.
 */
const frameWindowMillis = 1000;

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

/** The Visual Parts `code` draws: none muted, and only the soloed ones while one is. */
const visualPartsIn = (code: string) => {
  const visual = parsePerformance(code).parts.filter(({ surface }) => surface === "visual");
  const soloing = visual.some(({ soloed }) => soloed);
  return visual.filter(({ muted, soloed }) => !muted && (!soloing || soloed)).length;
};

/** The gaps between `times`, to the tenth of a millisecond, as finer is noise. */
const gapsBetween = (times: ReadonlyArray<number>) =>
  times.slice(1).map((time, i) => Math.round((time - (times[i] ?? time)) * 10) / 10);

const median = (values: ReadonlyArray<number>) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

/**
 * The frame times of an Apply at `at` of `code`, from the times of the frames `drawn` in the
 * windows before and after it. One frame is the typical (median) gap before the Apply, as the
 * display drew then; with none, the typical gap after it.
 */
const frameTimesOf = (at: number, code: string, drawn: ReadonlyArray<number>): FrameTimes => {
  const last = drawn.findIndex((time, i) => time <= at && (drawn[i + 1] ?? Infinity) > at);
  const before = gapsBetween(drawn.slice(0, Math.max(0, last) + 1));
  const frames = gapsBetween(drawn.slice(Math.max(0, last)));
  const frame = before.length > 0 ? median(before) : median(frames);
  return {
    at,
    visualParts: visualPartsIn(code),
    frames,
    longest: Math.max(0, ...frames),
    dropped:
      frame > 0
        ? frames.reduce((sum, gap) => sum + Math.max(0, Math.round(gap / frame) - 1), 0)
        : 0,
  };
};

/** Whether any of `turns` was running at some time from `from` to `to`. */
const duringTurn = (turns: ReadonlyArray<TurnRecord>, from: number, to: number) =>
  turns.some(({ enter, ended }) => enter <= to && (ended === null || ended >= from));

/**
 * What the budget (spec §12.5) is judged by, kept in memory for this session only (spec §11):
 * each Turn's timings, calls and tokens, the no-freeze monitor's long tasks and late notes, the
 * frame times after each Apply, and the onset-to-flash estimates.
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
      const frameTimes = yield* Ref.make<ReadonlyArray<FrameTimes>>([]);
      const syncs = yield* Ref.make<ReadonlyArray<Sync>>([]);
      const page = yield* Page;
      const strudel = yield* Strudel;

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
      yield* monitor(page.longTasks, longTasks, ({ duration }) => duration);
      yield* monitor(strudel.lateNotes, lateNotes, () => 0);
      yield* Effect.forkScoped(
        Stream.runForEach(strudel.syncs, (sync) => Ref.update(syncs, (kept) => [...kept, sync])),
      );
      // Each Apply's second is watched on its own, so the next Apply is watched too.
      yield* Effect.forkScoped(
        Stream.runForEach((yield* LiveCodeStore).applied, ({ at, code }) =>
          Effect.forkScoped(
            Effect.flatMap(page.frames(at - frameWindowMillis, at + frameWindowMillis), (drawn) =>
              Ref.update(frameTimes, (kept) => [...kept, frameTimesOf(at, code, drawn)]),
            ),
          ),
        ),
      );

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
          frameTimes: Ref.get(frameTimes),
          syncs: Ref.get(syncs),
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
