import type { Repl } from "@strudel/web";
import { Effect, Layer } from "effect";
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
            if (error !== undefined) return yield* new EvalError({ message: messageOf(error) });
          }),
        ),
      stop: Effect.sync(() => repl?.stop()),
      transport: Effect.sync(() =>
        repl
          ? { started: repl.scheduler.started, cps: repl.scheduler.cps }
          : initialViewModel.transport,
      ),
      position: Effect.sync(() => repl?.scheduler.now() ?? 0),
    };
  }),
);

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
