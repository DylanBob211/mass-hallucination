import {
  Data,
  Deferred,
  type Duration,
  Effect,
  Layer,
  PubSub,
  Stream,
  SubscriptionRef,
} from "effect";
import { applyChanges, Editor, SourceMoved, type TextChange } from "./Editor";
import { Model, ModelError, type ModelEvent, type ModelRequest, type Tokens } from "./Model";
import { type LongTask, Page } from "./Page";
import {
  EvalError,
  type LateNote,
  type PlaybackError,
  Strudel,
  type Sync,
  type VisualErrorKind,
} from "./Strudel";
import type { Transport, VisualOutput } from "./viewModel";

/** An `Editor` over an in-memory Source, for Node tests (ADR 0006). */
export const makeFakeEditor = (source: string) =>
  Effect.map(SubscriptionRef.make(source), (ref) => {
    /** Every agent write, as the changes it made. */
    const writes: Array<ReadonlyArray<TextChange>> = [];
    return {
      layer: Layer.succeed(Editor, {
        read: SubscriptionRef.get(ref),
        changes: ref.changes,
        write: (onto, changes) =>
          SubscriptionRef.modifyEffect(ref, (current) =>
            current === onto
              ? Effect.succeed([writes.push(changes), applyChanges(current, changes)] as const)
              : Effect.fail(new SourceMoved()),
          ).pipe(Effect.asVoid),
      }),
      read: SubscriptionRef.get(ref),
      /** Replaces the Source, as a human typing would. */
      type: (next: string) => SubscriptionRef.set(ref, next),
      writes,
    };
  });

/**
 * A `Strudel` that records what it was asked to evaluate and to dry-run. A successful evaluate
 * starts the transport, as the real repl does; the tempo and position are whatever the test sets.
 */
export const makeFakeStrudel = () =>
  Effect.gen(function* () {
    const playbackErrors = yield* PubSub.unbounded<PlaybackError>();
    const lateNotes = yield* PubSub.unbounded<LateNote>();
    const syncs = yield* PubSub.unbounded<Sync>();
    const evaluated: string[] = [];
    const dryRuns: string[] = [];
    let transport: Transport = { started: false, cps: 0.5 };
    let position = 0;
    let failure: Failure | undefined;
    let dryRunFailure: Failure | undefined;
    let warning: { message: string; at: (code: string) => number } | undefined;
    let outputs: ReadonlyMap<string, ReadonlyArray<VisualOutput>> = new Map();
    let held: Deferred.Deferred<undefined> | undefined;
    let heldDryRuns: Deferred.Deferred<undefined> | undefined;
    const fail = ({ message, at, kind }: Failure, code: string) =>
      Effect.fail(
        new EvalError({
          message,
          ...(at !== undefined && { offset: at(code) }),
          ...(kind !== undefined && { kind }),
        }),
      );

    return {
      layer: Layer.succeed(Strudel, {
        evaluate: (code) =>
          Effect.suspend(() => {
            const gate = held === undefined ? Effect.void : Deferred.await(held);
            return Effect.andThen(
              gate,
              Effect.suspend(() => {
                if (failure !== undefined) return fail(failure, code);
                evaluated.push(code);
                transport = { ...transport, started: true };
                return Effect.void;
              }),
            );
          }),
        dryRun: (code) =>
          Effect.andThen(
            Effect.suspend(() =>
              heldDryRuns === undefined ? Effect.void : Deferred.await(heldDryRuns),
            ),
            Effect.suspend(() => {
              if (dryRunFailure !== undefined && (dryRunFailure.when?.(code) ?? true))
                return fail(dryRunFailure, code);
              dryRuns.push(code);
              return Effect.succeed({
                warnings:
                  warning === undefined
                    ? []
                    : [{ message: warning.message, offset: warning.at(code) }],
                outputs,
              });
            }),
          ),
        stop: Effect.sync(() => {
          transport = { ...transport, started: false };
          position = 0;
        }),
        transport: Effect.sync(() => transport),
        position: Effect.sync(() => position),
        playbackErrors: Stream.fromPubSub(playbackErrors),
        lateNotes: Stream.fromPubSub(lateNotes),
        syncs: Stream.fromPubSub(syncs),
      }),
      evaluated,
      dryRuns,
      /**
       * Makes every later evaluate fail with `message`, at the offset `at` finds in the code when
       * given.
       */
      failWith: (message: string, at?: (code: string) => number) =>
        Effect.sync(() => (failure = at === undefined ? { message } : { message, at })),
      /**
       * Has the playing pattern throw `message`, as Strudel's scheduler reports it, or the Visual
       * Part `part` throw it while drawing.
       */
      failWhilePlaying: (message: string, part?: string) =>
        PubSub.publish(playbackErrors, part === undefined ? { message } : { message, part }),
      /**
       * Makes later dry-runs of code `when` accepts (all, by default) fail with `message`, at the
       * offset `at` finds when given, as a Visual Part's error of `kind` when given.
       */
      failDryRunWith: (
        message: string,
        {
          at,
          when,
          kind,
        }: {
          at?: (code: string) => number;
          when?: (code: string) => boolean;
          kind?: VisualErrorKind;
        } = {},
      ) =>
        Effect.sync(() => {
          dryRunFailure = {
            message,
            ...(at && { at }),
            ...(when && { when }),
            ...(kind && { kind }),
          };
        }),
      /** Makes every later dry-run warn `message`, at the offset `at` finds in the code. */
      warnDryRun: (message: string, at: (code: string) => number) =>
        Effect.sync(() => (warning = { message, at })),
      /** Makes every later dry-run report these outputs, by Visual Part identity. */
      reportOutputs: (byPart: Readonly<Record<string, ReadonlyArray<VisualOutput>>>) =>
        Effect.sync(() => (outputs = new Map(Object.entries(byPart)))),
      /** Has a note come `lateBy` milliseconds too late, at `at`. */
      noteLate: (at: number, lateBy: number, where: LateNote["where"] = "scheduler") =>
        PubSub.publish(lateNotes, { at, lateBy, where }),
      /** Has an onset-to-flash estimate be taken. */
      synced: (sync: Sync) => PubSub.publish(syncs, sync),
      /** Makes later evaluates wait until `releaseEvaluates`. */
      holdEvaluates: Effect.map(Deferred.make<undefined>(), (gate) => {
        held = gate;
      }),
      releaseEvaluates: Effect.suspend(() =>
        held === undefined ? Effect.void : Effect.asVoid(Deferred.succeed(held, undefined)),
      ),
      /** Makes later dry-runs wait until `releaseDryRuns`. */
      holdDryRuns: Effect.map(Deferred.make<undefined>(), (gate) => {
        heldDryRuns = gate;
      }),
      releaseDryRuns: Effect.suspend(() => {
        const gate = heldDryRuns;
        heldDryRuns = undefined;
        return gate === undefined ? Effect.void : Effect.asVoid(Deferred.succeed(gate, undefined));
      }),
      /** Makes every later evaluate succeed again. */
      succeed: Effect.sync(() => (failure = undefined)),
      setCps: (cps: number) => Effect.sync(() => (transport = { ...transport, cps })),
      setPosition: (cycles: number) => Effect.sync(() => (position = cycles)),
    };
  });

interface Failure {
  readonly message: string;
  readonly at?: (code: string) => number;
  readonly when?: (code: string) => boolean;
  readonly kind?: VisualErrorKind;
}

/** A reply the fake `Model` gives in place of a `change_parts` call. */
export class Scripted extends Data.TaggedClass("Scripted")<{
  readonly reply:
    | { readonly answer: string }
    | { readonly fail: string }
    /** Writes a note, then the tool input as far as `hang`, then nothing until interrupted. */
    | { readonly hang: string }
    /** Writes a note, then takes `after` to make a `change_parts` call with `input`. */
    | { readonly slowly: unknown; readonly after: Duration.DurationInput };
}> {}

/** The model answers `text` in words. */
export const answers = (text: string) => new Scripted({ reply: { answer: text } });
/** The model fails, as a network or API error. */
export const fails = (message: string) => new Scripted({ reply: { fail: message } });
/** The model starts writing its tool input as `partial`, and never finishes. */
export const hangsWriting = (partial: string) => new Scripted({ reply: { hang: partial } });
/** The model never finishes. */
export const hangs = hangsWriting('{"changes":[');
/** The model writes its note at once, then takes `after` to call `change_parts` with `input`. */
export const slowly = (after: Duration.DurationInput, input: unknown) =>
  new Scripted({ reply: { slowly: input, after } });

/** The tokens each of the fake `Model`'s replies uses. */
export const tokensPerReply: Tokens = { input: 900, output: 60, cacheRead: 12000, cacheWrite: 300 };

/**
 * A `Model` that answers each request with the next of `replies`: a note and then a
 * `change_parts` call with that input, or what a `Scripted` reply says. Once they run out, it
 * answers in words.
 */
export const makeFakeModel = (replies: ReadonlyArray<unknown>) => {
  const requests: ModelRequest[] = [];
  /** How many streams were interrupted before they ended, as a Turn stopped mid-request is. */
  let aborted = 0;
  const note: ModelEvent = { _tag: "Text", delta: "Changing it." };
  const usage: ModelEvent = { _tag: "Usage", tokens: tokensPerReply };
  const writing = (input: unknown) =>
    Stream.make<ModelEvent[]>(
      { _tag: "ToolInput", partial: JSON.stringify(input) },
      { _tag: "ToolCall", input, reply: { input } },
      usage,
    );
  const call = (input: unknown) => Stream.concat(Stream.make(note), writing(input));
  const scripted = ({ reply }: Scripted): Stream.Stream<ModelEvent, ModelError> => {
    if ("answer" in reply)
      return Stream.make<ModelEvent[]>({ _tag: "Text", delta: reply.answer }, usage);
    if ("fail" in reply) return Stream.fail(new ModelError({ message: reply.fail }));
    if ("slowly" in reply)
      return Stream.concat(
        Stream.make(note),
        Stream.unwrap(Effect.as(Effect.sleep(reply.after), writing(reply.slowly))),
      );
    return Stream.concat(
      Stream.make<ModelEvent[]>(
        { _tag: "Text", delta: "Working on it." },
        { _tag: "ToolInput", partial: reply.hang },
      ),
      Stream.never,
    ).pipe(
      // It ends only when interrupted.
      Stream.ensuring(Effect.sync(() => aborted++)),
    );
  };
  return {
    layer: Layer.succeed(Model, {
      stream: (request) =>
        Stream.suspend(() => {
          const reply = replies[requests.length];
          requests.push(request);
          if (reply === undefined) return scripted(answers("Nothing to change."));
          return reply instanceof Scripted ? scripted(reply) : call(reply);
        }),
    }),
    requests,
    get aborted() {
      return aborted;
    },
  };
};

/**
 * A `Page` whose long tasks and frames the test reports, keeping every file it was asked to
 * download. It draws no frames until told to.
 */
export const makeFakePage = () =>
  Effect.gen(function* () {
    const longTasks = yield* PubSub.unbounded<LongTask>();
    const downloads: Array<{ readonly name: string; readonly text: string }> = [];
    let drawing = { steady: 0, gaps: [] as ReadonlyArray<number> };
    return {
      layer: Layer.succeed(Page, {
        longTasks: Stream.fromPubSub(longTasks),
        frames: (from, to) =>
          Effect.sync(() => {
            const { steady, gaps } = drawing;
            const drawn = [from];
            let at = from;
            while (steady > 0 && at + steady <= (from + to) / 2) drawn.push((at += steady));
            for (const gap of gaps) drawn.push((at += gap));
            return drawn;
          }),
        download: (name, text) => Effect.sync(() => downloads.push({ name, text })),
      }),
      /** Has the main thread run one task for `duration` milliseconds from `at`. */
      longTask: (at: number, duration: number) => PubSub.publish(longTasks, { at, duration }),
      /**
       * Has the page draw frames `steady` ms apart in the first half of every later wait (none, by
       * default), then `gaps` ms apart.
       */
      drawFrames: (gaps: ReadonlyArray<number>, steady = 0) =>
        Effect.sync(() => {
          drawing = { steady, gaps };
        }),
      downloads,
    };
  });
