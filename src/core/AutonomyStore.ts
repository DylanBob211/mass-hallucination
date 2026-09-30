import { Context, Effect, Layer, type Stream, SubscriptionRef } from "effect";
import { initialViewModel, type Autonomy } from "./viewModel";

/** The human's Autonomy setting (ADR 0003). The agent can neither read nor change it. */
export class AutonomyStore extends Context.Tag("AutonomyStore")<
  AutonomyStore,
  {
    readonly current: Effect.Effect<Autonomy>;
    /** The Autonomy now, then after every change. */
    readonly changes: Stream.Stream<Autonomy>;
    readonly set: (autonomy: Autonomy) => Effect.Effect<void>;
  }
>() {
  static readonly layer = Layer.effect(
    AutonomyStore,
    Effect.map(SubscriptionRef.make(initialViewModel.autonomy), (ref) => ({
      current: SubscriptionRef.get(ref),
      changes: ref.changes,
      set: (autonomy: Autonomy) => SubscriptionRef.set(ref, autonomy),
    })),
  );
}
