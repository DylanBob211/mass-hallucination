import { Context, Effect, Layer, Schedule, Stream, SubscriptionRef } from "effect";
import { Editor } from "./Editor";
import { deleted, isUnapplied, type LiveCode } from "./liveCode";
import { LiveCodeStore } from "./LiveCodeStore";
import { type Part, type Performance, parsePerformance } from "./Performance";
import { Strudel } from "./Strudel";
import { initialViewModel, type PartView, type Transport, type ViewModel } from "./viewModel";

/**
 * How often transport is read. Strudel announces neither `setcps` nor the passing of cycles, so the
 * store polls; a view model is published only when what it shows has changed.
 */
export const transportPollInterval = "50 millis";

/** The current view model and every change to it, starting from the current one. */
export class ViewModelStore extends Context.Tag("ViewModelStore")<
  ViewModelStore,
  { readonly changes: Stream.Stream<ViewModel> }
>() {
  static readonly layer = Layer.scoped(
    ViewModelStore,
    Effect.gen(function* () {
      const editor = yield* Editor;
      const strudel = yield* Strudel;
      const liveCode = yield* LiveCodeStore;
      const initial = withParts(
        initialViewModel,
        parsePerformance(yield* editor.read),
        yield* liveCode.current,
      );
      const ref = yield* SubscriptionRef.make(initial);
      // Transport and the Source change the view model from separate fibers.
      const lock = yield* Effect.makeSemaphore(1);

      /** Publishes `derive`'s result unless it is the current view model itself. */
      const publish = (derive: (current: ViewModel) => Effect.Effect<ViewModel>) =>
        lock.withPermits(1)(
          Effect.gen(function* () {
            const current = yield* SubscriptionRef.get(ref);
            const next = yield* derive(current);
            if (next !== current) yield* SubscriptionRef.set(ref, next);
          }),
        );

      const readTransport = publish((current) =>
        Effect.gen(function* () {
          return withTransport(current, yield* strudel.transport, yield* strudel.position);
        }),
      );
      yield* Effect.forkScoped(
        Effect.repeat(readTransport, Schedule.spaced(transportPollInterval)),
      );

      // Whether a Part is Unapplied changes with the Source and with the Live code.
      yield* Effect.forkScoped(
        Stream.runForEach(Stream.zipLatest(editor.changes, liveCode.changes), ([source, live]) =>
          publish((current) =>
            Effect.sync(() => withParts(current, parsePerformance(source), live)),
          ),
        ),
      );

      return { changes: ref.changes };
    }),
  );
}

const withTransport = (current: ViewModel, transport: Transport, position: number): ViewModel => {
  const cycle = Math.max(0, Math.floor(position));
  const sameTransport =
    transport.started === current.transport.started && transport.cps === current.transport.cps;
  if (sameTransport && cycle === current.cycle) return current;
  return Object.freeze({
    ...current,
    transport: sameTransport ? current.transport : Object.freeze({ ...transport }),
    cycle,
  });
};

/** The Parts' views, reusing each one whose view is unchanged, and the list if every one is. */
const withParts = (current: ViewModel, performance: Performance, live: LiveCode): ViewModel => {
  const views = partViews(performance, live).map((view) => {
    const previous = current.parts.find(({ id }) => id === view.id);
    return previous !== undefined && sameView(previous, view) ? previous : Object.freeze(view);
  });
  const sameList =
    views.length === current.parts.length &&
    views.every((view, index) => view === current.parts[index]);
  if (sameList) return current;
  return Object.freeze({ ...current, parts: Object.freeze(views) });
};

/** The Source's Parts, then each deleted Part as its Live code reads. */
const partViews = (performance: Performance, live: LiveCode): Array<PartView> => [
  ...performance.parts.map((part) => viewOf(part, isUnapplied(part, live), false)),
  ...deleted(performance, live).flatMap(([id, text]) =>
    parsePerformance(text).parts.map((part) => viewOf({ ...part, id }, true, true)),
  ),
];

const viewOf = (
  { id, muted, soloed, surface }: Part,
  unapplied: boolean,
  deleted: boolean,
): PartView => ({ id, muted, soloed, surface, unapplied, deleted });

const sameView = (a: PartView, b: PartView) =>
  a.muted === b.muted &&
  a.soloed === b.soloed &&
  a.surface === b.surface &&
  a.unapplied === b.unapplied &&
  a.deleted === b.deleted;
