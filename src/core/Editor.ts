import { Context, type Effect, type Stream } from "effect";

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
  }
>() {}
