import Anthropic from "@anthropic-ai/sdk";
import { Effect, Layer, Option, Stream } from "effect";
import {
  Model,
  ModelError,
  type ModelEvent,
  type ModelRequest,
  type Tokens,
} from "../../core/Model";
import { reference, systemPrompt } from "./prompt";

/**
 * Which model the agent runs on, and where (spec §7). Fixed for the session: a fallback is a
 * different configuration, never a switch made on the fly.
 */
export interface ModelConfig {
  readonly apiKey: string;
  readonly model: string;
  /** Another Messages-compatible endpoint, such as Bedrock Mantle's. */
  readonly baseURL?: string;
  /** For tests. */
  readonly fetch?: (url: string | URL | Request, init?: RequestInit) => Promise<Response>;
}

/**
 * The configuration from `.env.local` (ADR 0005): `VITE_ANTHROPIC_API_KEY`, and optionally
 * `VITE_ANTHROPIC_MODEL` and `VITE_ANTHROPIC_BASE_URL` for a fallback.
 */
export const modelConfigFromEnv = (): ModelConfig => {
  const { VITE_ANTHROPIC_API_KEY, VITE_ANTHROPIC_MODEL, VITE_ANTHROPIC_BASE_URL } = import.meta.env;
  return {
    apiKey: VITE_ANTHROPIC_API_KEY ?? "",
    model: VITE_ANTHROPIC_MODEL || "claude-opus-5-5",
    ...(VITE_ANTHROPIC_BASE_URL && { baseURL: VITE_ANTHROPIC_BASE_URL }),
  };
};

/** The agent's one tool (spec §6.2, ADR 0004). */
const changePartsTool: Anthropic.Tool = {
  name: "change_parts",
  description:
    "Change whole Parts of the Performance, or add new ones. Each change is a Part's complete new text and the rev you read it at (null for a new Part). All the changes land together or none does; the result says how they landed, or why they were refused.",
  strict: true,
  // The input streams into the editor as the model writes it (ADR 0007).
  eager_input_streaming: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["changes"],
    properties: {
      changes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["part", "rev", "text"],
          properties: {
            part: {
              type: "string",
              description: 'The Part\'s label without mute or solo marks, or "(preamble)".',
            },
            rev: {
              type: ["string", "null"],
              description: "The rev from the snapshot, or null for a new Part.",
            },
            text: { type: "string", description: "The Part's whole new text, label included." },
          },
        },
      },
    },
  },
};

/**
 * The request for `request` (spec §7): the cached prefix (the tool, the system prompt and the
 * reference, cached for an hour), one user message with the snapshot and the Instruction, then
 * this Turn's refused calls, each with its refusal.
 */
const paramsOf = (
  model: string,
  { snapshot, instruction, retries }: ModelRequest,
): Anthropic.MessageCreateParamsStreaming => ({
  model,
  max_tokens: 16000,
  stream: true,
  output_config: { effort: "medium" },
  tools: [changePartsTool],
  tool_choice: { type: "auto", disable_parallel_tool_use: true },
  system: [
    { type: "text", text: systemPrompt },
    { type: "text", text: reference, cache_control: { type: "ephemeral", ttl: "1h" } },
  ],
  messages: [
    {
      role: "user",
      content: `<snapshot>\n${JSON.stringify(snapshot)}\n</snapshot>\n\n<instruction>\n${instruction}\n</instruction>`,
    },
    ...retries.flatMap(({ call, result }): Array<Anthropic.MessageParam> => {
      // The API refuses an empty text block, though a reply may stream one.
      const reply = (call.reply as Array<Anthropic.ContentBlockParam>).filter(
        (block) => block.type !== "text" || block.text !== "",
      );
      const toolUse = reply.find((block) => block.type === "tool_use");
      return [
        { role: "assistant", content: reply },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: toolUse?.id ?? "",
              content: JSON.stringify(result),
              is_error: true,
            },
          ],
        },
      ];
    }),
  ],
});

const modelError = (error: unknown) =>
  new ModelError({ message: error instanceof Error ? error.message : String(error) });

/**
 * Turns the API's stream into the model's events, keeping the whole reply to send back with a
 * retry. The tool input is parsed only once complete; input that is not JSON is passed on as the
 * raw text, which `change_parts` refuses as a bad request.
 */
const eventsOf = (events: Stream.Stream<Anthropic.RawMessageStreamEvent, ModelError>) =>
  Stream.suspend(() => {
    const reply: Array<Anthropic.ContentBlockParam> = [];
    let json = "";
    let input: unknown;
    let stopReason: Anthropic.StopReason | null = null;
    // The API's counts are running totals; a count it leaves out has not changed.
    let used: Tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    const usage = (
      counts: Anthropic.Usage | Anthropic.MessageDeltaUsage,
    ): Option.Option<ModelEvent> => {
      const total: Tokens = {
        input: counts.input_tokens ?? used.input,
        output: counts.output_tokens,
        cacheRead: counts.cache_read_input_tokens ?? used.cacheRead,
        cacheWrite: counts.cache_creation_input_tokens ?? used.cacheWrite,
      };
      const tokens: Tokens = {
        input: total.input - used.input,
        output: total.output - used.output,
        cacheRead: total.cacheRead - used.cacheRead,
        cacheWrite: total.cacheWrite - used.cacheWrite,
      };
      used = total;
      return Option.some({ _tag: "Usage", tokens });
    };
    const translate = (
      event: Anthropic.RawMessageStreamEvent,
    ): Effect.Effect<Option.Option<ModelEvent>, ModelError> => {
      switch (event.type) {
        case "message_start":
          return Effect.succeed(usage(event.message.usage));
        case "content_block_start": {
          const block = event.content_block;
          if (block.type === "text") reply.push({ type: "text", text: "" });
          else if (block.type === "thinking")
            reply.push({ type: "thinking", thinking: "", signature: "" });
          else if (block.type === "redacted_thinking")
            reply.push({ type: "redacted_thinking", data: block.data });
          else if (block.type === "tool_use") {
            json = "";
            reply.push({ type: "tool_use", id: block.id, name: block.name, input: {} });
          }
          return Effect.succeedNone;
        }
        case "content_block_delta": {
          const block = reply.at(-1);
          const { delta } = event;
          if (delta.type === "text_delta" && block?.type === "text") {
            block.text += delta.text;
            return Effect.succeedSome({ _tag: "Text", delta: delta.text });
          }
          if (delta.type === "thinking_delta" && block?.type === "thinking")
            block.thinking += delta.thinking;
          if (delta.type === "signature_delta" && block?.type === "thinking")
            block.signature = delta.signature;
          if (delta.type === "input_json_delta") {
            json += delta.partial_json;
            return Effect.succeedSome({ _tag: "ToolInput", partial: json });
          }
          return Effect.succeedNone;
        }
        case "content_block_stop": {
          const block = reply.at(-1);
          if (block?.type === "tool_use") {
            try {
              input = JSON.parse(json);
              block.input = input;
            } catch {
              input = json;
            }
          }
          return Effect.succeedNone;
        }
        case "message_delta":
          stopReason = event.delta.stop_reason;
          return Effect.succeed(usage(event.usage));
        case "message_stop":
          if (stopReason === "tool_use" && input !== undefined)
            return Effect.succeedSome({ _tag: "ToolCall", input, reply });
          if (stopReason === "refusal")
            return Effect.fail(new ModelError({ message: "the model declined the Instruction" }));
          if (stopReason === "max_tokens")
            return Effect.fail(new ModelError({ message: "the reply ran out of tokens" }));
          return Effect.succeedNone;
        default:
          return Effect.succeedNone;
      }
    };
    return events.pipe(
      Stream.mapEffect(translate),
      Stream.filterMap((event) => event),
    );
  });

/**
 * The events of the SDK's stream. Each read is interruptible, where the stream's own iterator
 * would wait for the pending read before the scope could abort it.
 */
const pull = (events: AsyncIterable<Anthropic.RawMessageStreamEvent>) => {
  const iterator = events[Symbol.asyncIterator]();
  return Stream.repeatEffectOption(
    Effect.tryPromise({
      try: () => iterator.next(),
      catch: (error) => Option.some(modelError(error)),
    }).pipe(
      Effect.flatMap((next) =>
        next.done === true ? Effect.fail(Option.none()) : Effect.succeed(next.value),
      ),
    ),
  );
};

/** `Model` over the Anthropic SDK, from the page (ADR 0005). */
export const anthropicModel = (config: ModelConfig) =>
  Layer.sync(Model, () => {
    const client = new Anthropic({
      apiKey: config.apiKey,
      // The key is capped and never leaves localhost (ADR 0005).
      dangerouslyAllowBrowser: true,
      ...(config.baseURL !== undefined && { baseURL: config.baseURL }),
      ...(config.fetch !== undefined && { fetch: config.fetch }),
    });
    return {
      stream: (request) =>
        eventsOf(
          Stream.unwrapScoped(
            Effect.uninterruptibleMask((restore) =>
              restore(
                // Interrupted while connecting, the SDK aborts through `signal`.
                Effect.tryPromise({
                  try: (signal) =>
                    client.messages.create(paramsOf(config.model, request), { signal }),
                  catch: modelError,
                }),
              ).pipe(
                // Interrupted once streaming, the scope's finalizer aborts the request.
                Effect.tap((events) =>
                  Effect.addFinalizer(() =>
                    Effect.sync(() => {
                      events.controller.abort();
                    }),
                  ),
                ),
                Effect.map(pull),
              ),
            ),
          ),
        ),
    };
  });

/** `Model` from `.env.local`. */
export const ModelLive = Layer.suspend(() => anthropicModel(modelConfigFromEnv()));
