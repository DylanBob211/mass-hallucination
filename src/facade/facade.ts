import { Effect, Fiber, Layer, ManagedRuntime, Stream } from "effect";
import { AgentApplies } from "../core/AgentApplies";
import { apply, stopTransport } from "../core/apply";
import { AutonomyStore } from "../core/AutonomyStore";
import type { Editor } from "../core/Editor";
import { ErrorSlotStore } from "../core/ErrorSlotStore";
import type { Scope } from "../core/liveCode";
import { LiveCodeStore } from "../core/LiveCodeStore";
import type { Strudel } from "../core/Strudel";
import { type Autonomy, initialViewModel, type ViewModel } from "../core/viewModel";
import { ViewModelStore } from "../core/ViewModelStore";

export type { Autonomy, ErrorSlot, PartView, Transport, ViewModel } from "../core/viewModel";
export type { Surface } from "../core/Performance";
export { preambleId, type Scope } from "../core/liveCode";

/** The only place Effect meets the UI (ADR 0006): plain calls in, one view model out. */
export interface Facade {
  /** The view model as of now. */
  readonly viewModel: ViewModel;
  /** Calls `listener` now with the current view model, then on every change. */
  subscribe(listener: (viewModel: ViewModel) => void): () => void;
  /**
   * Applies `scope`, every Part unless given, and starts the transport if it is stopped (spec §5).
   * A Part is named by its identity, the Preamble as `preambleId`.
   */
  apply(scope?: Scope): Promise<void>;
  stopTransport(): Promise<void>;
  /** Sets where the agent's changes land (ADR 0003). Propose writes until ticket 08. */
  setAutonomy(autonomy: Autonomy): Promise<void>;
  dispose(): Promise<void>;
}

/** The façade over the given editor and repl: live ones in the page, fakes in Node tests. */
export const createFacade = (host: Layer.Layer<Editor | Strudel>): Facade => {
  const runtime = ManagedRuntime.make(
    ViewModelStore.layer.pipe(
      Layer.provideMerge(AgentApplies.layer),
      Layer.provideMerge(AutonomyStore.layer),
      Layer.provideMerge(LiveCodeStore.layer),
      Layer.provideMerge(ErrorSlotStore.layer),
      Layer.provideMerge(host),
    ),
  );
  const listeners = new Set<(viewModel: ViewModel) => void>();
  let current = initialViewModel;

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
    // An evaluation error leaves the previous code playing; the view model's error slot shows it.
    apply: (scope) => runtime.runPromise(Effect.ignore(apply(scope))),
    stopTransport: () => runtime.runPromise(stopTransport),
    setAutonomy: (autonomy) =>
      runtime.runPromise(Effect.flatMap(AutonomyStore, (store) => store.set(autonomy))),
    async dispose() {
      listeners.clear();
      await runtime.runPromise(Fiber.interrupt(publishing));
      await runtime.dispose();
    },
  };
};
