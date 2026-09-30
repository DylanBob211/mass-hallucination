import { Context, Data, type Effect, type Stream } from "effect";

/** Replace the Source's text from `from` to `to` with `insert`, positions as the Source is now. */
export interface TextChange {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
}

/** The Source is no longer the text a write was computed against; nothing was written. */
export class SourceMoved extends Data.TaggedError("SourceMoved") {}

/**
 * The editor whose document is the Source (ADR 0001, ADR 0006). The core never holds the text; it
 * reaches it only through this service.
 */
export class Editor extends Context.Tag("Editor")<
  Editor,
  {
    /** The Source as of now. */
    readonly read: Effect.Effect<string>;
    /** The Source now, then after every change. */
    readonly changes: Stream.Stream<string>;
    /**
     * Makes `changes` to the Source as one agent write (ADR 0006): one undo step, the cursor carried
     * along. Writes only if the Source is still `onto`, the text the changes were computed against.
     */
    readonly write: (
      onto: string,
      changes: ReadonlyArray<TextChange>,
    ) => Effect.Effect<void, SourceMoved>;
  }
>() {}

/**
 * `source` with `changes` made, each positioned as `source` is. Insertions at one position land in
 * the order given, as in CodeMirror.
 */
export const applyChanges = (source: string, changes: ReadonlyArray<TextChange>): string =>
  changes
    .map((change, index) => ({ change, index }))
    .sort((a, b) => b.change.from - a.change.from || b.index - a.index)
    .reduce(
      (text, { change: { from, to, insert } }) => text.slice(0, from) + insert + text.slice(to),
      source,
    );
