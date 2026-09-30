import { Context, Effect, Either, Layer, Stream, SubscriptionRef } from "effect";
import { type PartChange, refusalOf } from "./checks";
import { Editor, SourceMoved } from "./Editor";
import { type LiveCode, writeTexts } from "./liveCode";
import { LiveCodeStore } from "./LiveCodeStore";
import { parsePerformance } from "./Performance";

/**
 * An agent's change offered for the human to review (CONTEXT.md): it changes neither the Source
 * nor what is heard until accepted.
 */
export interface Proposal {
  /** As `change_parts` asked for them, each with the rev its Part had when proposed. */
  readonly changes: ReadonlyArray<PartChange>;
  /**
   * The human has edited its Parts since it was made; it can only be dismissed. Once Stale, it
   * stays so, even if the edit is undone.
   */
  readonly stale: boolean;
}

/** What accepting came to: written, found Stale (and left open), or nothing open to accept. */
export type AcceptOutcome = "accepted" | "stale" | "none";

/** The Performance's one open Proposal, if any (ADR 0003). */
export class ProposalStore extends Context.Tag("ProposalStore")<
  ProposalStore,
  {
    readonly current: Effect.Effect<Proposal | undefined>;
    /** The open Proposal now, then after every change. */
    readonly changes: Stream.Stream<Proposal | undefined>;
    /**
     * Opens a Proposal of `changes`, replacing the open one, if the Source is still `onto`, the
     * text they were checked against.
     */
    readonly propose: (
      onto: string,
      changes: ReadonlyArray<PartChange>,
    ) => Effect.Effect<void, SourceMoved>;
    /**
     * Writes the open Proposal into the Source as Unapplied edits, in one agent write, and closes
     * it; unless it is Stale, or proves so now: its Parts changed since it was made, or hold the
     * human's Unapplied edits (ADR 0003). Says what came of it.
     */
    readonly accept: Effect.Effect<AcceptOutcome>;
    /**
     * Accepts the open Proposal as `accept` does, then Applies the Parts it touched at once: the
     * human times this, so it waits for no cycle boundary (ADR 0003). An evaluation error leaves
     * what played playing, and the error slot says why.
     */
    readonly acceptAndPlay: Effect.Effect<AcceptOutcome>;
    /** Closes the open Proposal, Stale or not, changing nothing else. */
    readonly reject: Effect.Effect<void>;
  }
>() {
  static readonly layer = Layer.scoped(
    ProposalStore,
    Effect.gen(function* () {
      const editor = yield* Editor;
      const liveCode = yield* LiveCodeStore;
      const ref = yield* SubscriptionRef.make<Proposal | undefined>(undefined);

      /** Whether `open` can no longer land on `source`, with `live` playing (ADR 0003). */
      const isStale = (open: Proposal, source: string, live: LiveCode) =>
        refusalOf(parsePerformance(source), live, open.changes) !== undefined;
      const markedStale = (open: Proposal) => Object.freeze({ ...open, stale: true });

      // Marked Stale as the human edits, so it greys out before they try to accept it. Checked
      // against the Source as it is now, never an older one still on its way through the stream.
      yield* Effect.forkScoped(
        Stream.runForEach(Stream.zipLatest(editor.changes, liveCode.changes), () =>
          SubscriptionRef.updateEffect(ref, (open) =>
            Effect.gen(function* () {
              if (open === undefined || open.stale) return open;
              const stale = isStale(open, yield* editor.read, yield* liveCode.current);
              return stale ? markedStale(open) : open;
            }),
          ),
        ),
      );

      const propose = (onto: string, changes: ReadonlyArray<PartChange>) =>
        SubscriptionRef.modifyEffect(ref, () =>
          Effect.flatMap(editor.read, (source) =>
            source === onto
              ? Effect.succeed([undefined, Object.freeze({ changes, stale: false })] as const)
              : Effect.fail(new SourceMoved()),
          ),
        );

      /** Accepts the open Proposal, and gives the texts it wrote, keyed as in `writeTexts`. */
      const accepting = SubscriptionRef.modifyEffect(ref, (open) =>
        Effect.gen(function* (): Effect.fn.Return<
          readonly [readonly [AcceptOutcome, ReadonlyMap<string, string>?], Proposal | undefined]
        > {
          if (open === undefined) return [["none"], open];
          if (open.stale) return [["stale"], open];
          const texts = new Map(open.changes.map(({ part, text }) => [part, text]));
          for (;;) {
            const source = yield* editor.read;
            if (isStale(open, source, yield* liveCode.current))
              return [["stale"], markedStale(open)];
            const written = yield* Effect.either(editor.write(source, writeTexts(source, texts)));
            if (Either.isRight(written)) return [["accepted", texts], undefined];
          }
        }),
      );

      const accept = Effect.map(accepting, ([accepted]) => accepted);

      const acceptAndPlay = Effect.gen(function* () {
        const [accepted, written] = yield* accepting;
        if (written !== undefined)
          yield* Effect.ignore(liveCode.apply([...written.keys()], written));
        return accepted;
      });

      return {
        current: SubscriptionRef.get(ref),
        changes: ref.changes,
        propose,
        accept,
        acceptAndPlay,
        reject: SubscriptionRef.set(ref, undefined),
      };
    }),
  );
}
