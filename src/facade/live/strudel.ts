import type { Repl } from "@strudel/web";
import { Effect, Layer, Stream } from "effect";
import { EvalError, type LateNote, type PlaybackError, Strudel } from "../../core/Strudel";
import { initialViewModel } from "../../core/viewModel";
import { evaluateDry, sameControlIn, synonymsSetTwice } from "./dryRun";
import { audibleTimeOf, audioLinkedHelpers, followParts } from "./audioLinked";
import { checkHydraShape, createVisualDryRun, type VisualDryRun } from "./visualDryRun";
import { createVisuals, type Visuals, VisualError } from "./visuals";

/**
 * Strudel's audio output `output`, telling `onLate` how many milliseconds late each note is that
 * reaches it after its time on the audio clock, which superdough drops (spec §11).
 */
export const lateAtOutput =
  (
    output: (
      hap: unknown,
      deadline: number,
      duration: number,
      cps: number,
      time: number,
    ) => unknown,
    currentTime: () => number,
    onLate: (lateBy: number) => void,
  ) =>
  (hap: unknown, deadline: number, duration: number, cps: number, time: number) => {
    const now = currentTime();
    if (time < now) onLate((now - time) * 1000);
    return output(hap, deadline, duration, cps, time);
  };

/** What Strudel's scheduler logs, and all it does, when it drops a tick it reached too late. */
const skippedTick = "skip query: too late";

/**
 * Tells `onLate` of each note in a tick `repl`'s scheduler drops, and how many milliseconds late
 * it reached the tick, until the returned function is called. A stall of the main thread longer
 * than the scheduler looks ahead (about 200 ms) makes it drop whole ticks before they reach the
 * output, which `lateAtOutput` never sees (spike, ticket 12). Strudel only logs the drop, so this
 * listens to the console.
 */
const watchSkippedTicks = (
  repl: Repl,
  currentTime: () => number,
  onLate: (lateBy: number) => void,
) => {
  const log = console.log;
  console.log = (...args: Array<unknown>) => {
    if (args[0] === skippedTick) {
      // The scheduler has set the tick's time and cycles already.
      const { lastTick, lastBegin, lastEnd, pattern } = repl.scheduler;
      const lateBy = (currentTime() - lastTick) * 1000;
      for (const hap of pattern?.queryArc(lastBegin, lastEnd) ?? [])
        if (hap.hasOnset()) onLate(lateBy);
    }
    log(...args);
  };
  return () => {
    console.log = log;
  };
};

/**
 * Loads `@strudel/web` from the bundle and builds its repl. Browsers keep audio suspended until
 * the page has had a user gesture, so this runs only after one. Each late note goes to `onLate`
 * until `unwatch` is called, and each Visual Part's playback error to `onVisualError`.
 */
const boot = async (
  onEvalError: (error: unknown) => void,
  onLate: (note: LateNote) => void,
  onVisualError: (error: PlaybackError) => void,
): Promise<{ readonly repl: Repl; readonly visuals: Visuals; readonly unwatch: () => void }> => {
  const strudel = await import("@strudel/web");
  const currentTime = () => strudel.getAudioContext().currentTime;
  const late = (where: LateNote["where"]) => (lateBy: number) => {
    onLate({ at: Date.now(), lateBy, where });
  };
  const parts = followParts(strudel.Pattern.prototype);
  const repl = await strudel.initStrudel({
    onEvalError,
    // The repl takes this in place of its own output (`webaudioRepl`, research for ticket 12).
    defaultOutput: lateAtOutput(strudel.webaudioOutput, currentTime, late("output")),
    beforeEval: parts.beforeEval,
    afterEval: parts.afterEval,
  });
  const helpers = audioLinkedHelpers({
    scheduler: repl.scheduler,
    audibleTime: () => audibleTimeOf(strudel.getAudioContext(), performance.now()),
    heard: parts.heard,
    analyzerData: (id) => strudel.getAnalyzerData("time", id),
    noteToMidi: (name) => (strudel.isNote(name) ? strudel.noteToMidi(name) : undefined),
  });
  const visuals = await createVisuals(strudel.silence, onVisualError, helpers);
  await strudel.evalScope({ hydra: visuals.hydra });
  // initStrudel defers audio setup (worklets included) to the first mousedown. The performer's
  // first gesture is usually a key, so send it the one it waits for.
  document.dispatchEvent(new MouseEvent("mousedown"));
  await strudel.initAudioOnFirstClick();
  // superdough's initAudio means to resume the context, but its guard is always false.
  await strudel.getAudioContext().resume();
  return { repl, visuals, unwatch: watchSkippedTicks(repl, currentTime, late("scheduler")) };
};

const gestures = ["keydown", "pointerdown"] as const;

/** `Strudel` over the real repl, built on the first user gesture or the first evaluate. */
export const StrudelLive = Layer.scoped(
  Strudel,
  Effect.gen(function* () {
    let booting: Promise<Repl> | undefined;
    let repl: Repl | undefined;
    let visuals: Visuals | undefined;
    // The visual dry-run's own Hydra, made on the first dry-run.
    let visualDryRun: Promise<VisualDryRun> | undefined;
    let unwatch: (() => void) | undefined;
    const lateListeners = new Set<(note: LateNote) => void>();
    const visualErrorListeners = new Set<(error: PlaybackError) => void>();
    // The error Strudel reported during the evaluate in flight; evaluates run one at a time.
    let reported: { error: unknown } | undefined;
    const takeReported = () => {
      const taken = reported;
      reported = undefined;
      return taken;
    };
    const start = () =>
      (booting ??= boot(
        (error) => (reported = { error }),
        (note) => {
          for (const listener of lateListeners) listener(note);
        },
        (error) => {
          for (const listener of visualErrorListeners) listener(error);
        },
      ).then((booted) => {
        ({ repl, visuals, unwatch } = booted);
        return booted.repl;
      }));

    // Capture, so a Ctrl-Enter that CodeMirror handles still counts.
    const onGesture = () => {
      removeGestureListeners();
      void start();
    };
    const removeGestureListeners = () => {
      for (const type of gestures) window.removeEventListener(type, onGesture, { capture: true });
    };
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        for (const type of gestures) window.addEventListener(type, onGesture, { capture: true });
      }),
      () => Effect.sync(removeGestureListeners),
    );
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        repl?.stop();
        unwatch?.();
        visuals?.dispose();
        void visualDryRun?.then((dryRun) => {
          dryRun.dispose();
        });
      }),
    );

    const booted = Effect.tryPromise({
      try: start,
      catch: (cause) => new EvalError({ message: `Strudel failed to load: ${String(cause)}` }),
    });

    const lock = yield* Effect.makeSemaphore(1);

    return {
      evaluate: (code) =>
        lock.withPermits(1)(
          Effect.gen(function* () {
            const r = yield* booted;
            takeReported();
            // Resolving says nothing: a failed evaluate resolves too. Its error is only reported,
            // through `onEvalError` and `state.evalError`, before the promise settles.
            yield* Effect.tryPromise({
              try: () => {
                visuals?.prepare(code);
                // Empty code is the one input evaluate rejects; blank code evaluates to silence.
                return r.evaluate(code === "" ? " " : code);
              },
              catch: (cause) => new EvalError({ message: String(cause) }),
            });
            const error: unknown = takeReported()?.error ?? r.state.evalError;
            if (error !== undefined) return yield* evalErrorOf(error, code);
          }),
        ),
      dryRun: (code) =>
        lock.withPermits(1)(
          Effect.gen(function* () {
            yield* booted;
            const strudel = yield* Effect.promise(() => import("@strudel/web"));
            yield* Effect.try({
              try: () => {
                checkHydraShape(code);
              },
              catch: (cause) => evalErrorOf(cause, code),
            });
            yield* Effect.tryPromise({
              try: () => evaluateDry(strudel, code),
              catch: (cause) => evalErrorOf(cause, code),
            });
            const visual = yield* Effect.tryPromise({
              try: () =>
                (visualDryRun ??= createVisualDryRun().catch((cause: unknown) => {
                  // The next dry-run tries again.
                  visualDryRun = undefined;
                  throw cause;
                })),
              catch: (cause) =>
                new EvalError({
                  message: `Hydra failed to load for the dry-run: ${String(cause)}`,
                }),
            });
            const { warnings, outputs } = yield* Effect.try({
              try: () => visual.check(code),
              catch: (cause) => evalErrorOf(cause, code),
            });
            return {
              warnings: [...synonymsSetTwice(code, sameControlIn(strudel)), ...warnings],
              outputs,
            };
          }),
        ),
      stop: Effect.sync(() => repl?.stop()),
      transport: Effect.sync(() =>
        repl
          ? { started: repl.scheduler.started, cps: repl.scheduler.cps }
          : initialViewModel.transport,
      ),
      position: Effect.sync(() => repl?.scheduler.now() ?? 0),
      playbackErrors: Stream.merge(audioPlaybackErrors, streamFrom(visualErrorListeners)),
      lateNotes: streamFrom(lateListeners),
    };
  }),
);

/** What is sent to `listeners`, from when the stream runs. */
const streamFrom = <A>(listeners: Set<(a: A) => void>) =>
  Stream.asyncPush<A>((emit) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const listener = (a: A) => void emit.single(a);
        listeners.add(listener);
        return listener;
      }),
      (listener) => Effect.sync(() => listeners.delete(listener)),
    ),
  );

/** Strudel's logger announces each line as this DOM event, a playback error included (spec §8). */
const logEvent = "strudel.log";

const audioPlaybackErrors = Stream.asyncPush<PlaybackError>((emit) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const listener = (event: Event) => {
        const detail: unknown = event instanceof CustomEvent ? event.detail : undefined;
        const message =
          typeof detail === "object" && detail !== null && "message" in detail
            ? playbackErrorOf(String(detail.message))
            : undefined;
        if (message !== undefined) emit.single({ message });
      };
      document.addEventListener(logEvent, listener);
      return listener;
    }),
    (listener) =>
      Effect.sync(() => {
        document.removeEventListener(logEvent, listener);
      }),
  ),
);

/**
 * The error in a `strudel.log` line, if the line is a playback error. Strudel's `errorLogger` logs
 * the scheduler's, a query's and a trigger's errors untyped, so only their prefix tells them apart
 * (research 01).
 */
export const playbackErrorOf = (line: string): string | undefined =>
  /^\[(cyclist|query|getTrigger)\] error: (.*)$/s.exec(line)?.[2];

/**
 * An error Strudel reported while evaluating `code`, with where in `code` it failed when that can
 * be told: acorn's syntax errors carry an offset, mini-notation errors a line, and a Visual Part's
 * errors their place in its body. Their own positions in the text are dropped, as the performer
 * never sees the composition. Other errors are thrown by the code Strudel generates, whose
 * positions are not the composition's.
 */
export const evalErrorOf = (error: unknown, code: string): EvalError => {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof VisualError)
    return new EvalError({ message, offset: error.offset, kind: error.kind });
  if (error instanceof SyntaxError && "pos" in error && typeof error.pos === "number")
    return new EvalError({ message: message.replace(/ \(\d+:\d+\)$/, ""), offset: error.pos });
  const mini = /^\[mini\] parse error at line (\d+): (.*)$/s.exec(message);
  if (mini) {
    const linesBefore = code.split("\n").slice(0, Number(mini[1]) - 1);
    return new EvalError({
      message: `[mini] parse error: ${mini[2] ?? ""}`,
      offset: linesBefore.reduce((start, line) => start + line.length + 1, 0),
    });
  }
  return new EvalError({ message });
};
