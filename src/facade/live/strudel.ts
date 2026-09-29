import type { Repl } from "@strudel/web";
import { Effect, Layer } from "effect";
import { EvalError, Strudel } from "../../core/Strudel";
import { initialViewModel } from "../../core/viewModel";

/**
 * Loads `@strudel/web` from the bundle and builds its repl. Browsers keep audio suspended until
 * the page has had a user gesture, so this runs only after one.
 */
const boot = async (): Promise<Repl> => {
  const strudel = await import("@strudel/web");
  const repl = await strudel.initStrudel();
  // initStrudel defers audio setup (worklets included) to the first mousedown. The performer's
  // first gesture is usually a key, so send it the one it waits for.
  document.dispatchEvent(new MouseEvent("mousedown"));
  await strudel.initAudioOnFirstClick();
  // superdough's initAudio means to resume the context, but its guard is always false.
  await strudel.getAudioContext().resume();
  return repl;
};

const gestures = ["keydown", "pointerdown"] as const;

/** `Strudel` over the real repl, built on the first user gesture or the first evaluate. */
export const StrudelLive = Layer.scoped(
  Strudel,
  Effect.gen(function* () {
    let booting: Promise<Repl> | undefined;
    let repl: Repl | undefined;
    const start = () =>
      (booting ??= boot().then((booted) => {
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

    return {
      evaluate: (code) =>
        Effect.gen(function* () {
          const r = yield* booted;
          yield* Effect.tryPromise({
            // Empty code is the one input evaluate rejects; blank code evaluates to silence.
            try: () => r.evaluate(code === "" ? " " : code),
            catch: (cause) => new EvalError({ message: String(cause) }),
          });
          const error = r.state.evalError;
          if (error !== undefined) return yield* new EvalError({ message: error.message });
        }),
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
