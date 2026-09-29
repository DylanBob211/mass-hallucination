import { Context, Effect, Layer, Schedule, Stream, SubscriptionRef } from "effect";
import { Strudel } from "./Strudel";
import { initialViewModel, type Transport, type ViewModel } from "./viewModel";

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
      const strudel = yield* Strudel;
      const ref = yield* SubscriptionRef.make(initialViewModel);

      const readTransport = Effect.gen(function* () {
        const current = yield* SubscriptionRef.get(ref);
        const next = withTransport(current, yield* strudel.transport, yield* strudel.position);
        if (next !== current) yield* SubscriptionRef.set(ref, next);
      });
      yield* Effect.forkScoped(
        Effect.repeat(readTransport, Schedule.spaced(transportPollInterval)),
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
