import { Context, Data, type Stream } from "effect";
import type { ChangePartsResult } from "./changeParts";

/**
 * One request to the model (spec §7): the Instruction, and this Turn's refused calls so far, each
 * with the result that refused it. Ticket 10 adds the snapshot.
 */
export interface ModelRequest {
  readonly instruction: string;
  readonly retries: ReadonlyArray<{ readonly input: unknown; readonly result: ChangePartsResult }>;
}

/** What the model streams for a request: its text, the tool input as it grows, then the call. */
export type ModelEvent =
  | { readonly _tag: "Text"; readonly delta: string }
  | { readonly _tag: "ToolInput"; readonly partial: string }
  | { readonly _tag: "ToolCall"; readonly input: unknown };

export class ModelError extends Data.TaggedError("ModelError")<{ readonly message: string }> {}

/** The model behind the agent (ADR 0005). Its tool call's input is unchecked JSON. */
export class Model extends Context.Tag("Model")<
  Model,
  { readonly stream: (request: ModelRequest) => Stream.Stream<ModelEvent, ModelError> }
>() {}
