import type { Repl } from "@strudel/web";
import { Effect, Layer, Stream } from "effect";
import { EvalError, Strudel } from "../../core/Strudel";
import { initialViewModel } from "../../core/viewModel";

/**
 * Loads `@strudel/web` from the bundle and builds its repl. Browsers keep audio suspended until
 * the page has had a user gesture, so this runs only after one.
 */
const boot = async (onEvalError: (error: unknown) => void): Promise<Repl> => {
  const strudel = await import("@strudel/web");
  const repl = await strudel.initStrudel({ onEvalError });
  // initStrudel defers audio setup (worklets included) to the first mousedown. The performer's
  // first gesture is usually a key, so send it the one it waits for.
  document.dispatchEvent(new MouseEvent("mousedown"));
  await strudel.initAudioOnFirstClick();
  // superdough's initAudio means to resume the context, but its guard is always false.
  await strudel.getAudioContext().resume();
  return repl;
};

const gestures = ["keydown", "pointerdown"] as const;

/**
 * Where Hydra's four outputs, `render(o0)` and `update`/`afterUpdate` are reset, synchronously
 * before every evaluate (spec §5 step 2). Nothing to reset until the canvas exists (ticket 13).
 */
const resetVisuals = () => {};

/** `Strudel` over the real repl, built on the first user gesture or the first evaluate. */
export const StrudelLive = Layer.scoped(
  Strudel,
  Effect.gen(function* () {
    let booting: Promise<Repl> | undefined;
    let repl: Repl | undefined;
    // The error Strudel reported during the evaluate in flight; evaluates run one at a time.
    let reported: { error: unknown } | undefined;
    const takeReported = () => {
      const taken = reported;
      reported = undefined;
      return taken;
    };
    const start = () =>
      (booting ??= boot((error) => (reported = { error })).then((booted) => {
        repl = booted;
        return booted;
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
    yield* Effect.addFinalizer(() => Effect.sync(() => repl?.stop()));

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
                resetVisuals();
                // Empty code is the one input evaluate rejects; blank code evaluates to silence.
                return r.evaluate(code === "" ? " " : code);
              },
              catch: (cause) => new EvalError({ message: String(cause) }),
            });
            const error: unknown = takeReported()?.error ?? r.state.evalError;
            if (error !== undefined) return yield* evalErrorOf(error, code);
          }),
        ),
      stop: Effect.sync(() => repl?.stop()),
      transport: Effect.sync(() =>
        repl
          ? { started: repl.scheduler.started, cps: repl.scheduler.cps }
          : initialViewModel.transport,
      ),
      position: Effect.sync(() => repl?.scheduler.now() ?? 0),
      playbackErrors,
    };
  }),
);

/** Strudel's logger announces each line as this DOM event, a playback error included (spec §8). */
const logEvent = "strudel.log";

const playbackErrors = Stream.asyncPush<string>((emit) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const listener = (event: Event) => {
        const detail: unknown = event instanceof CustomEvent ? event.detail : undefined;
        const message =
          typeof detail === "object" && detail !== null && "message" in detail
            ? playbackErrorOf(String(detail.message))
            : undefined;
        if (message !== undefined) emit.single(message);
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
 * be told: acorn's syntax errors carry an offset, and mini-notation errors a line. Their own
 * positions in the text are dropped, as the performer never sees the composition. Other errors
 * are thrown by the code Strudel generates, whose positions are not the composition's.
 */
export const evalErrorOf = (error: unknown, code: string): EvalError => {
  const message = error instanceof Error ? error.message : String(error);
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
