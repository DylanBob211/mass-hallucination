import { Context, Data, type Stream } from "effect";
import type { ChangePartsResult } from "./changeParts";
import type { Snapshot } from "./snapshot";

/**
 * One request to the model (spec §7): the Performance as it was when the Instruction was asked,
 * the Instruction, and this Turn's refused calls so far, each with the result that refused it.
 */
export interface ModelRequest {
  readonly snapshot: Snapshot;
  readonly instruction: string;
  readonly retries: ReadonlyArray<Retry>;
}

/** A refused `change_parts` call, sent back to the model within its Turn only. */
export interface Retry {
  readonly call: ToolCall;
  readonly result: ChangePartsResult;
}

/**
 * The model's `change_parts` call. `reply` is the whole reply that made it, as the `Model` needs
 * it back to send a retry; only the `Model` reads it.
 */
export interface ToolCall {
  readonly _tag: "ToolCall";
  readonly input: unknown;
  readonly reply: unknown;
}

/** What the model streams for a request: its text, the tool input as it grows, then the call. */
export type ModelEvent =
  | { readonly _tag: "Text"; readonly delta: string }
  /** The raw JSON of the tool input so far. */
  | { readonly _tag: "ToolInput"; readonly partial: string }
  | ToolCall;

export class ModelError extends Data.TaggedError("ModelError")<{ readonly message: string }> {}

/** The model behind the agent (ADR 0005). Its tool call's input is unchecked JSON. */
export class Model extends Context.Tag("Model")<
  Model,
  { readonly stream: (request: ModelRequest) => Stream.Stream<ModelEvent, ModelError> }
>() {}
