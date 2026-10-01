import {
  Clock,
  Context,
  Data,
  Effect,
  Either,
  Layer,
  PubSub,
  Stream,
  SubscriptionRef,
} from "effect";
import { Editor } from "./Editor";
import { ErrorSlotStore } from "./ErrorSlotStore";
import {
  type Composition,
  compose,
  composeWith,
  holds,
  type LiveCode,
  liveCodeAfter,
  noLiveCode,
  type Scope,
  unitAt,
} from "./liveCode";
import { type Part, parsePerformance } from "./Performance";
import { type EvalError, Strudel, type VisualErrorKind } from "./Strudel";
import type { VisualOutput } from "./viewModel";

/**
 * A dry-run refused the change (spec §6.3): the composition would not evaluate, or not query
 * cleanly. `part` is where the error is, by Part identity or `preambleId`, when it can be found;
 * `kind` is what kind of error it is, for a Visual Part.
 */
export class Invalid extends Data.TaggedError("Invalid")<{
  readonly message: string;
  readonly part?: string;
  readonly kind?: VisualErrorKind;
}> {}

/** A dry-run that passed: the composition it evaluated, and what it warned of. */
export interface DryRun {
  readonly code: string;
  readonly warnings: ReadonlyArray<string>;
}

/**
 * The outputs each Visual Part writes, by the Part's exact text, as dry-runs found them. A Visual
 * Part's body sees only Hydra's names, so its outputs follow from its text alone.
 */
export type VisualOutputs = ReadonlyMap<string, ReadonlyArray<VisualOutput>>;

/** A Part's outputs, when it is a Visual Part whose exact text a dry-run has passed. */
export const outputsOf = (part: Part, outputs: VisualOutputs) =>
  part.surface === "visual" ? outputs.get(part.text) : undefined;

/** An Apply that evaluated: when it began to (epoch ms), and the composition it evaluated. */
export interface Applied {
  readonly at: number;
  readonly code: string;
}

/** The Live code, and Apply: the one way it changes (spec §5). */
export class LiveCodeStore extends Context.Tag("LiveCodeStore")<
  LiveCodeStore,
  {
    readonly current: Effect.Effect<LiveCode>;
    /** The Live code now, then after every Apply that changed it. */
    readonly changes: Stream.Stream<LiveCode>;
    /**
     * Evaluates the Source composed for `scope` and, on success, makes the in-Scope Parts' current
     * text their Live code and clears the error that was in the slot before it. On failure the
     * previous Live code keeps playing and the error slot names the Part that failed, when it can
     * be found. Given the texts an agent `written`, keyed as in `dryRun`, it does nothing unless
     * every one is still its Part's text: once the human has edited, undone or deleted one, the
     * Part is theirs again. Succeeds with whether it evaluated.
     */
    readonly apply: (
      scope: Scope,
      written?: ReadonlyMap<string, string>,
    ) => Effect.Effect<boolean, EvalError>;
    /** Each Apply that evaluated, from now on. */
    readonly applied: Stream.Stream<Applied>;
    /**
     * Makes the in-Scope Parts' current text their Live code without evaluating anything, as an
     * agent Apply on a stopped transport does (spec §5); with `written`, as `apply` does.
     */
    readonly setLiveCode: (
      scope: Scope,
      written: ReadonlyMap<string, string>,
    ) => Effect.Effect<void>;
    /**
     * Dry-runs the composition an Apply of `scope` would evaluate once `texts` are written, each
     * keyed by a Part's identity or `preambleId` (a key the Source lacks is a new Part, at the
     * end). Every key is in Scope, whether `scope` names it or not. Changes no Live code; waits for
     * an Apply in progress. Succeeds with the code it evaluated and its warnings, each prefixed
     * with the Part it is in when it can be found, and remembers the outputs of each Visual Part
     * it ran.
     */
    readonly dryRun: (
      scope: Scope,
      texts: ReadonlyMap<string, string>,
    ) => Effect.Effect<DryRun, Invalid>;
    /** The outputs of every Visual Part text a dry-run has passed. */
    readonly outputs: Effect.Effect<VisualOutputs>;
    /** The outputs now, then after every dry-run that changed them. */
    readonly outputChanges: Stream.Stream<VisualOutputs>;
  }
>() {
  static readonly layer = Layer.effect(
    LiveCodeStore,
    Effect.gen(function* () {
      const editor = yield* Editor;
      const strudel = yield* Strudel;
      const errorSlot = yield* ErrorSlotStore;
      const ref = yield* SubscriptionRef.make(noLiveCode);
      const outputs = yield* SubscriptionRef.make<VisualOutputs>(new Map());
      const applied = yield* PubSub.unbounded<Applied>();
      // One Apply or dry-run at a time, so each composes from the Live code the last Apply left.
      const lock = yield* Effect.makeSemaphore(1);

      const apply = (scope: Scope, written: ReadonlyMap<string, string> = new Map()) =>
        lock.withPermits(1)(
          Effect.gen(function* () {
            const performance = parsePerformance(yield* editor.read);
            if (!holds(performance, written)) return false;
            const live = yield* SubscriptionRef.get(ref);
            const composition = compose(performance, live, scope);
            const before = yield* errorSlot.current;
            const at = yield* Clock.currentTimeMillis;
            yield* strudel.evaluate(composition.code).pipe(
              Effect.tapError(({ message, offset }) => {
                const part = offset === undefined ? undefined : unitAt(composition, offset);
                return errorSlot.report(
                  part === undefined
                    ? { message, phase: "eval" }
                    : { message, phase: "eval", part },
                );
              }),
            );
            yield* SubscriptionRef.set(ref, liveCodeAfter(performance, live, scope));
            yield* errorSlot.clearIfStill(before);
            yield* PubSub.publish(applied, { at, code: composition.code });
            return true;
          }),
        );

      const setLiveCode = (scope: Scope, written: ReadonlyMap<string, string>) =>
        lock.withPermits(1)(
          Effect.gen(function* () {
            const performance = parsePerformance(yield* editor.read);
            if (!holds(performance, written)) return;
            yield* SubscriptionRef.update(ref, (live) => liveCodeAfter(performance, live, scope));
          }),
        );

      const dryRun = (scope: Scope, texts: ReadonlyMap<string, string>) =>
        lock.withPermits(1)(
          Effect.gen(function* () {
            const composition = composeWith(
              parsePerformance(yield* editor.read),
              yield* SubscriptionRef.get(ref),
              scope,
              texts,
            );
            const partAt = (offset: number | undefined) =>
              offset === undefined ? undefined : unitAt(composition, offset);
            const report = yield* strudel.dryRun(composition.code).pipe(
              Effect.catchAll(({ message, offset, kind }) =>
                Effect.flatMap(
                  offset === undefined
                    ? firstUnitFailing(composition, message)
                    : Effect.succeed(partAt(offset)),
                  (part) =>
                    Effect.fail(
                      new Invalid({
                        message,
                        ...(part !== undefined && { part }),
                        ...(kind !== undefined && { kind }),
                      }),
                    ),
                ),
              ),
            );
            if (report.outputs.size > 0)
              yield* SubscriptionRef.update(outputs, (known) => {
                const next = new Map(known);
                for (const [id, written] of report.outputs) {
                  const unit = composition.units.find((u) => u.id === id);
                  if (unit !== undefined)
                    next.set(composition.code.slice(unit.from, unit.to), written);
                }
                return next;
              });
            return {
              code: composition.code,
              warnings: report.warnings.map(({ message, offset }) => {
                const part = partAt(offset);
                return part === undefined ? message : `${part}: ${message}`;
              }),
            };
          }),
        );

      /**
       * Where an error Strudel could not place first appears: the first unit whose code up to its
       * end dry-runs to the same message, or else the last unit, as only the whole composition
       * fails so. Runtime and query errors come from code Strudel generated, so this is how they
       * find their Part.
       */
      const firstUnitFailing = ({ code, units }: Composition, message: string) =>
        Effect.gen(function* () {
          for (const unit of units.slice(0, -1)) {
            const result = yield* Effect.either(strudel.dryRun(code.slice(0, unit.to)));
            if (Either.isLeft(result) && result.left.message === message) return unit.id;
          }
          return units.at(-1)?.id;
        });

      return {
        current: SubscriptionRef.get(ref),
        changes: ref.changes,
        apply,
        applied: Stream.fromPubSub(applied),
        setLiveCode,
        dryRun,
        outputs: SubscriptionRef.get(outputs),
        outputChanges: outputs.changes,
      };
    }),
  );
}
