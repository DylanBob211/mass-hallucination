import { Context, Effect, Layer, Stream, SubscriptionRef } from "effect";
import { emptyViewModel, type ViewModel } from "./viewModel";

/** The current view model and every change to it, starting from the current one. */
export class ViewModelStore extends Context.Tag("ViewModelStore")<
  ViewModelStore,
  { readonly changes: Stream.Stream<ViewModel> }
>() {
  static readonly layer = Layer.effect(
    ViewModelStore,
    Effect.map(SubscriptionRef.make(emptyViewModel), (ref) => ({ changes: ref.changes })),
  );
}
