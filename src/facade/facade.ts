import { Effect, Fiber, ManagedRuntime, Stream } from "effect";
import { emptyViewModel, type ViewModel } from "../core/viewModel";
import { ViewModelStore } from "../core/ViewModelStore";

export type { ViewModel } from "../core/viewModel";

/** The only place Effect meets the UI (ADR 0006): plain calls in, one view model out. */
export interface Facade {
  /** The view model as of now. */
  readonly viewModel: ViewModel;
  /** Calls `listener` now with the current view model, then on every change. */
  subscribe(listener: (viewModel: ViewModel) => void): () => void;
  dispose(): Promise<void>;
}

export const createFacade = (): Facade => {
  const runtime = ManagedRuntime.make(ViewModelStore.layer);
  const listeners = new Set<(viewModel: ViewModel) => void>();
  let current = emptyViewModel;

  const publishing = runtime.runFork(
    Effect.flatMap(ViewModelStore, (store) =>
      Stream.runForEach(store.changes, (next) =>
        Effect.sync(() => {
          if (next === current) return;
          current = next;
          for (const listener of listeners) listener(next);
        }),
      ),
    ),
  );

  return {
    get viewModel() {
      return current;
    },
    subscribe(listener) {
      listener(current);
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async dispose() {
      listeners.clear();
      await runtime.runPromise(Fiber.interrupt(publishing));
      await runtime.dispose();
    },
  };
};
