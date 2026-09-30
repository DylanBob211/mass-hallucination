import { Context, Data, Effect, Fiber, Layer, Stream, SubscriptionRef } from "effect";
import type { AgentApplies } from "./AgentApplies";
import type { AutonomyStore } from "./AutonomyStore";
import { changeParts } from "./changeParts";
import { type DraftChange, draftOf } from "./draft";
import type { Editor } from "./Editor";
import type { ErrorSlotStore } from "./ErrorSlotStore";
import { Instrumentation, type TurnEvent } from "./Instrumentation";
import type { LiveCodeStore } from "./LiveCodeStore";
import { Model, type Retry, type ToolCall } from "./Model";
import type { ProposalStore } from "./ProposalStore";
import { takeSnapshot } from "./snapshot";
import type { Strudel } from "./Strudel";
import { initialViewModel, type TurnState, type TurnView, turnEndings } from "./viewModel";

/** How long a Turn may run before it gives up (spec §7, §12.5). */
export const turnTimeout = "60 seconds";

/** The Turn ran longer than `turnTimeout`. */
class TurnTimedOut extends Data.TaggedError("TurnTimedOut") {}

/** How many refused changes a Turn retries; the next refusal ends it (spec §12.5). */
export const maxRetries = 3;

/**
 * The AI pair-programmer (spec §7, ADR 0005): one Turn at a time, each a fresh request with the
 * Performance as it is when the Instruction is asked. A Turn keeps no memory past its end.
 */
export class Agent extends Context.Tag("Agent")<
  Agent,
  {
    /**
     * Starts a Turn on `instruction`, aimed at the Part `aim` or at all of them (`null`),
     * superseding the running one. Completes when the Turn ends; interrupting the caller leaves
     * the Turn running.
     */
    readonly instruct: (instruction: string, aim: string | null) => Effect.Effect<void>;
    /** Stops the running Turn, if any. Never undoes a change that has landed. */
    readonly stop: Effect.Effect<void>;
    /** This session's Turns, oldest first. */
    readonly turns: Effect.Effect<ReadonlyArray<TurnView>>;
    /** The Turns now, then after every change. */
    readonly changes: Stream.Stream<ReadonlyArray<TurnView>>;
    /**
     * The running Turn's tool input as far as it has streamed (ADR 0007), now and after every
     * change: `undefined` unless the model is writing a change or its change is being checked.
     */
    readonly drafts: Stream.Stream<ReadonlyArray<DraftChange> | undefined>;
  }
>() {
  static readonly layer = Layer.scoped(
    Agent,
    Effect.gen(function* () {
      const context = yield* Effect.context<
        | Model
        | Editor
        | Strudel
        | LiveCodeStore
        | ErrorSlotStore
        | AutonomyStore
        | ProposalStore
        | AgentApplies
        | Instrumentation
      >();
      const instrumentation = yield* Instrumentation;
      const scope = yield* Effect.scope;
      const ref = yield* SubscriptionRef.make(initialViewModel.turns);
      const draft = yield* SubscriptionRef.make(initialViewModel.draft);
      // Starting and stopping Turns one at a time, so two Instructions never both run.
      const control = yield* Effect.makeSemaphore(1);
      let running:
        | {
            readonly index: number;
            readonly logId: number;
            readonly fiber: Fiber.RuntimeFiber<void>;
          }
        | undefined;

      /**
       * Changes the Turn at `index` by `change`, unless it has ended. An ending goes in the log
       * as the Turn `logId` there.
       */
      const update = (index: number, logId: number, change: (turn: TurnView) => TurnView) =>
        SubscriptionRef.modify(ref, (turns): [TurnView | undefined, ReadonlyArray<TurnView>] => {
          const turn = turns[index];
          if (turn === undefined || turnEndings.has(turn.state)) return [undefined, turns];
          const next = change(turn);
          if (next === turn) return [undefined, turns];
          return [
            turnEndings.has(next.state) ? next : undefined,
            Object.freeze(turns.map((t, i) => (i === index ? Object.freeze(next) : t))),
          ];
        }).pipe(
          Effect.flatMap((ended) =>
            ended === undefined
              ? Effect.void
              : instrumentation.record(logId, {
                  _tag: "Ended",
                  ending: ended.state,
                  retries: ended.retries,
                }),
          ),
        );

      /** Ends the running Turn as `ending`, unless it has ended already. */
      const interrupt = (ending: TurnState) =>
        Effect.gen(function* () {
          if (running === undefined) return;
          const { index, logId, fiber } = running;
          running = undefined;
          yield* Fiber.interrupt(fiber);
          yield* update(index, logId, (turn) => ({ ...turn, state: ending }));
        });

      const instruct = (instruction: string, aim: string | null) =>
        // Enter is when it was asked, however long the running Turn takes to stop.
        Effect.flatMap(instrumentation.began(instruction, aim), (logId) =>
          control.withPermits(1)(
            Effect.gen(function* () {
              yield* interrupt("superseded");
              const index = yield* SubscriptionRef.modify(ref, (turns) => [
                turns.length,
                Object.freeze([
                  ...turns,
                  Object.freeze<TurnView>({
                    instruction,
                    aim,
                    state: "thinking",
                    note: "",
                    retries: 0,
                  }),
                ]),
              ]);
              const turn = (change: (turn: TurnView) => TurnView) => update(index, logId, change);
              const fiber = yield* Effect.forkIn(
                Effect.provide(
                  // A half-streamed draft just disappears (ADR 0007).
                  Effect.ensuring(
                    runTurn(
                      instruction,
                      aim,
                      turn,
                      (next) => SubscriptionRef.set(draft, next),
                      (event) => instrumentation.record(logId, event),
                    ),
                    SubscriptionRef.set(draft, undefined),
                  ),
                  context,
                ),
                scope,
              );
              running = { index, logId, fiber };
              return fiber;
            }),
          ),
        ).pipe(Effect.flatMap(Fiber.await), Effect.asVoid);

      return {
        instruct,
        stop: control.withPermits(1)(interrupt("stopped")),
        turns: SubscriptionRef.get(ref),
        changes: ref.changes,
        drafts: Stream.changes(draft.changes),
      };
    }),
  );
}

const called: TurnEvent = { _tag: "Called" };
const streamed: TurnEvent = { _tag: "Streamed" };
const heard: TurnEvent = { _tag: "Heard" };

/**
 * One Turn: asks the model, passes its call to `change_parts`, and on a refusal asks again with
 * the refused call and its result, until a change lands, the model answers in words, or it gives
 * up. `turn` shows where it is, `draft` the change as the model writes it, and `log` what the
 * instrumentation records of it.
 */
const runTurn = (
  instruction: string,
  aim: string | null,
  turn: (change: (turn: TurnView) => TurnView) => Effect.Effect<void>,
  draft: (changes: ReadonlyArray<DraftChange> | undefined) => Effect.Effect<void>,
  log: (event: TurnEvent) => Effect.Effect<void>,
) =>
  Effect.gen(function* () {
    const model = yield* Model;
    const snapshot = yield* takeSnapshot(aim);
    // This Turn's transcript: dropped when it ends (ADR 0005).
    const retries: Array<Retry> = [];
    for (;;) {
      let note = "";
      let call: ToolCall | undefined;
      yield* turn((t) => ({ ...t, state: "thinking", note }));
      yield* log(called);
      yield* Stream.runForEach(
        model.stream({ snapshot, instruction, retries: [...retries] }),
        (event) => {
          switch (event._tag) {
            case "Text":
              note += event.delta;
              return Effect.andThen(
                event.delta === "" ? Effect.void : log(streamed),
                turn((t) => ({ ...t, note })),
              );
            case "ToolInput":
              return Effect.andThen(
                // The first delta of tool input may be empty.
                event.partial === "" ? Effect.void : log(streamed),
                Effect.andThen(
                  turn((t) => (t.state === "writing" ? t : { ...t, state: "writing" })),
                  draft(draftOf(event.partial)),
                ),
              );
            case "ToolCall":
              call = event;
              return Effect.void;
            case "Usage":
              return log({ _tag: "Used", tokens: event.tokens });
          }
        },
      );
      if (call === undefined) return yield* turn((t) => ({ ...t, state: "answered" }));
      yield* turn((t) => ({ ...t, state: "dry-running" }));
      // The draft goes in the same uninterruptible step as the landing, so a landed change never
      // leaves its draft behind.
      const result = yield* changeParts(
        call.input,
        (landed, warnings) =>
          Effect.andThen(
            draft(undefined),
            turn((t) => ({
              ...t,
              state: "landed",
              landed,
              ...(warnings.length > 0 && { warnings }),
            })),
          ),
        log(heard),
      );
      if (result.ok) return;
      yield* draft(undefined);
      retries.push({ call, result });
      if (retries.length > maxRetries)
        return yield* turn((t) => ({ ...t, state: "out of retries" }));
      const retried = retries.length;
      yield* turn((t) => ({ ...t, retries: retried }));
    }
  }).pipe(
    Effect.timeoutFail({ duration: turnTimeout, onTimeout: () => new TurnTimedOut() }),
    Effect.catchTags({
      TurnTimedOut: () => turn((t) => ({ ...t, state: "timed out" })),
      ModelError: ({ message }) => turn((t) => ({ ...t, state: "failed", error: message })),
    }),
    // A bug in the loop ends the Turn too, rather than leaving it running forever.
    Effect.catchAllDefect((defect) =>
      turn((t) => ({ ...t, state: "failed", error: String(defect) })),
    ),
  );
