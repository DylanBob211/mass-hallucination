import { describe, expect, it } from "@effect/vitest";
import { Chunk, Effect, Exit, Fiber, Stream } from "effect";
import { Model, type ModelEvent, type ModelRequest, type ToolCall } from "../../core/Model";
import type { Snapshot } from "../../core/snapshot";
import { anthropicModel } from "./model";
import { reference, systemPrompt } from "./prompt";

const snapshot: Snapshot = {
  source: 'hats: s("hh*8")',
  parts: [
    {
      part: "hats",
      rev: "0a1b2c3d",
      unapplied: false,
      muted: false,
      soloed: false,
      surface: "audio",
    },
  ],
  live: {},
  transport: { started: true, cps: 0.5 },
  error: null,
  aim: "hats",
};

const input = { changes: [{ part: "hats", rev: "0a1b2c3d", text: 'hats: s("hh*16")' }] };

/** A server-sent event as the Messages API streams it. */
const event = (data: Record<string, unknown>) =>
  `event: ${String(data["type"])}\ndata: ${JSON.stringify(data)}\n\n`;

/** A streamed reply: some thinking, a note, then a `change_parts` call streamed in pieces. */
const toolReply = [
  event({
    type: "message_start",
    message: {
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude-opus-5-5",
      content: [],
      stop_reason: null,
      usage: { input_tokens: 10, output_tokens: 0 },
    },
  }),
  event({
    type: "content_block_start",
    index: 0,
    content_block: { type: "thinking", thinking: "", signature: "" },
  }),
  event({
    type: "content_block_delta",
    index: 0,
    delta: { type: "signature_delta", signature: "sig" },
  }),
  event({ type: "content_block_stop", index: 0 }),
  event({ type: "content_block_start", index: 1, content_block: { type: "text", text: "" } }),
  event({
    type: "content_block_delta",
    index: 1,
    delta: { type: "text_delta", text: "Doubling " },
  }),
  event({
    type: "content_block_delta",
    index: 1,
    delta: { type: "text_delta", text: "the hats." },
  }),
  event({ type: "content_block_stop", index: 1 }),
  event({
    type: "content_block_start",
    index: 2,
    content_block: { type: "tool_use", id: "toolu_1", name: "change_parts", input: {} },
  }),
  event({
    type: "content_block_delta",
    index: 2,
    delta: { type: "input_json_delta", partial_json: '{"changes":[' },
  }),
  event({
    type: "content_block_delta",
    index: 2,
    delta: { type: "input_json_delta", partial_json: JSON.stringify(input).slice(12) },
  }),
  event({ type: "content_block_stop", index: 2 }),
  event({
    type: "message_delta",
    delta: { stop_reason: "tool_use", stop_sequence: null },
    usage: { output_tokens: 40 },
  }),
  event({ type: "message_stop" }),
];

const textReply = (text: string, stopReason = "end_turn") => [
  toolReply[0] ?? "",
  event({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
  event({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }),
  event({ type: "content_block_stop", index: 0 }),
  event({
    type: "message_delta",
    delta: { stop_reason: stopReason, stop_sequence: null },
    usage: { output_tokens: 5 },
  }),
  event({ type: "message_stop" }),
];

/**
 * A `fetch` that answers each request with the next of `replies`, as an SSE stream; `"hang"` sends
 * the first event and then nothing. Records each request's body and whether it was aborted.
 */
const fakeFetch = (replies: ReadonlyArray<ReadonlyArray<string> | "hang" | Response>) => {
  const bodies: Array<Record<string, unknown>> = [];
  let aborted = 0;
  const fetch = (_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(init?.body as string) as Record<string, unknown>);
    init?.signal?.addEventListener("abort", () => aborted++);
    const reply = replies[bodies.length - 1] ?? textReply("Nothing to change.");
    if (reply instanceof Response) return Promise.resolve(reply);
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        if (reply === "hang") {
          controller.enqueue(encoder.encode(toolReply[0]));
          return;
        }
        for (const chunk of reply) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });
    return Promise.resolve(
      new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }),
    );
  };
  return {
    fetch,
    bodies,
    get aborted() {
      return aborted;
    },
  };
};

const request = (retries: ModelRequest["retries"] = []): ModelRequest => ({
  snapshot,
  instruction: "make the hats busier",
  retries,
});

/** The model's events for `req`, over `fetch`. */
const streamed = (fetch: ReturnType<typeof fakeFetch>, req = request()) =>
  Effect.flatMap(Model, (model) => Stream.runCollect(model.stream(req))).pipe(
    Effect.map(Chunk.toArray),
    Effect.provide(
      anthropicModel({ apiKey: "test-key", model: "claude-opus-5-5", fetch: fetch.fetch }),
    ),
  );

describe("anthropicModel", () => {
  it.effect(
    "sends one fresh request: the cached prefix, then the snapshot and the Instruction",
    () =>
      Effect.gen(function* () {
        const fetch = fakeFetch([toolReply]);

        yield* streamed(fetch);

        const [body] = fetch.bodies;
        expect(body).toMatchObject({
          model: "claude-opus-5-5",
          stream: true,
          output_config: { effort: "medium" },
          tool_choice: { type: "auto", disable_parallel_tool_use: true },
          tools: [{ name: "change_parts", strict: true, eager_input_streaming: true }],
          system: [
            { type: "text", text: systemPrompt },
            { type: "text", text: reference, cache_control: { type: "ephemeral", ttl: "1h" } },
          ],
        });
        expect(body?.["thinking"]).toBeUndefined();
        expect(body?.["messages"]).toEqual([
          {
            role: "user",
            content: `<snapshot>\n${JSON.stringify(snapshot)}\n</snapshot>\n\n<instruction>\nmake the hats busier\n</instruction>`,
          },
        ]);
      }),
  );

  it.effect("streams the text, the tool input as it grows, then the call", () =>
    Effect.gen(function* () {
      const events = yield* streamed(fakeFetch([toolReply]));

      expect(events.filter((e) => e._tag !== "ToolCall")).toEqual<Array<ModelEvent>>([
        { _tag: "Text", delta: "Doubling " },
        { _tag: "Text", delta: "the hats." },
        { _tag: "ToolInput", partial: '{"changes":[' },
        { _tag: "ToolInput", partial: JSON.stringify(input) },
      ]);
      expect(events.at(-1)).toMatchObject({ _tag: "ToolCall", input });
    }),
  );

  it.effect("sends a retry as the model's whole reply, then the refusal as the call's result", () =>
    Effect.gen(function* () {
      const [call] = (yield* streamed(fakeFetch([toolReply]))).filter(
        (e): e is ToolCall => e._tag === "ToolCall",
      );
      const fetch = fakeFetch([toolReply]);
      const result = { ok: false, reason: "unapplied", part: "hats" } as const;

      yield* streamed(fetch, request(call === undefined ? [] : [{ call, result }]));

      expect(fetch.bodies[0]?.["messages"]).toMatchObject([
        { role: "user" },
        {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "", signature: "sig" },
            { type: "text", text: "Doubling the hats." },
            { type: "tool_use", id: "toolu_1", name: "change_parts", input },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_1",
              content: JSON.stringify(result),
              is_error: true,
            },
          ],
        },
      ]);
    }),
  );

  it.effect("leaves an empty text block out of a replayed reply, as the API refuses one", () =>
    Effect.gen(function* () {
      const fetch = fakeFetch([toolReply]);
      const reply = [
        { type: "text", text: "" },
        { type: "tool_use", id: "toolu_2", name: "change_parts", input },
      ];
      const result = { ok: false, reason: "unapplied", part: "hats" } as const;

      yield* streamed(fetch, request([{ call: { _tag: "ToolCall", input, reply }, result }]));

      expect(fetch.bodies[0]?.["messages"]).toMatchObject([
        { role: "user" },
        { role: "assistant", content: [reply[1]] },
        { role: "user" },
      ]);
    }),
  );

  it.effect("passes on tool input that is not JSON as it came, for change_parts to refuse", () =>
    Effect.gen(function* () {
      const broken = toolReply.map((chunk) =>
        chunk.includes("input_json_delta") && chunk.includes('\\"part\\"')
          ? event({
              type: "content_block_delta",
              index: 2,
              delta: { type: "input_json_delta", partial_json: '{"part": oops' },
            })
          : chunk,
      );

      const events = yield* streamed(fakeFetch([broken]));

      expect(events.at(-1)).toMatchObject({ _tag: "ToolCall", input: '{"changes":[{"part": oops' });
    }),
  );

  it.effect("fails with the API's message on an error response", () =>
    Effect.gen(function* () {
      const response = new Response(
        JSON.stringify({
          type: "error",
          error: { type: "invalid_request_error", message: "bad key" },
        }),
        { status: 400, headers: { "content-type": "application/json" } },
      );

      const exit = yield* Effect.exit(streamed(fakeFetch([response])));

      expect(exit).toMatchObject(Exit.fail({ _tag: "ModelError" }));
      expect(JSON.stringify(exit)).toContain("bad key");
    }),
  );

  it.effect("fails when the model declines, rather than answering with nothing", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(streamed(fakeFetch([textReply("", "refusal")])));

      expect(exit).toMatchObject(Exit.fail({ _tag: "ModelError" }));
    }),
  );

  it.effect("aborts the request when the stream is interrupted", () =>
    Effect.gen(function* () {
      const fetch = fakeFetch(["hang"]);
      const running = yield* Effect.fork(streamed(fetch));
      yield* Effect.promise(() => new Promise((resolve) => setTimeout(resolve, 20)));

      yield* Fiber.interrupt(running);

      expect(fetch.aborted).toBe(1);
    }),
  );
});
