# Agent-loop options for a browser-resident live-coding state (Strudel POC)

Research note. Facts and trade-offs only — no recommendation. Sources are primary:
the bundled `claude-api` skill (high-trust), platform.claude.com `.md` docs,
code.claude.com Agent SDK docs, the `anthropic-sdk-typescript` repo source, and
ai-sdk.dev. Anything unverified is listed at the bottom.

Date of research: 2026-09-21.

---

## Summary

The four options are not four points on one axis. They differ on two mostly
independent axes:

1. **Where the loop runs.** Agent SDK is *server/Node-only, out-of-process*
   (it spawns a bundled Claude Code binary). Tool Runner and the manual loop are
   *in-process* and will run anywhere `fetch` runs, **including the browser**.
   Vercel AI SDK splits deliberately: `streamText` + provider on the server,
   `useChat` in the browser.
2. **How much of the loop you own.** Agent SDK owns everything (loop, built-in
   filesystem/bash tools, permission prompts, sessions, compaction). Tool Runner
   owns just the `while stop_reason === "tool_use"` loop. The manual loop owns
   nothing. Vercel AI SDK owns the loop *plus* a message/transport protocol and
   a React state model.

For browser-resident state the decisive question is (c): a loop running in the
browser closes over the live Strudel state directly and needs no transport at
all; a loop running on a server needs a bidirectional, blocking round-trip per
tool call, which HTTP request/response and plain SSE do not give you for free —
WebSocket, or the Vercel AI SDK's client-tool protocol, or a two-endpoint
poll/submit pattern.

All four ultimately hit the same Messages API, so (d) streaming and the partial
tool-input story is the same wire feature (`input_json_delta` / `partial_json`,
turned on per tool with `eager_input_streaming: true`) — only the surfacing
differs. (e) cancellation is `AbortController` everywhere; nothing anywhere
undoes a tool side effect that already ran.

---

## Comparison table

| | **1. Agent SDK** (`@anthropic-ai/claude-agent-sdk`) | **2. Tool Runner** (`client.beta.messages.toolRunner`) | **3. Manual Messages loop** | **4. Vercel AI SDK** (`ai` / `@ai-sdk/anthropic` / `@ai-sdk/react`) |
|---|---|---|---|---|
| **(a) Env / what you get & pay** | Node + **subprocess** (bundled `claude` binary as optional dep) + filesystem (sessions persisted unless `persistSession:false`). Free: loop, built-in tools, permissions, hooks, subagents, skills, sessions, compaction. Cost: all of that is *there whether you want it or not*; you prune with `disallowedTools`. | Any `fetch` runtime incl. browser. Free: tool loop, Zod schema gen + input validation, `max_iterations`, per-turn streaming, retries (2), container-id carry-forward. Cost: **beta** (`client.beta.*`), does **not** auto-resume `pause_turn`, does not apply stop-reason rules. | Any `fetch` runtime incl. browser. Free: nothing but HTTP/SSE plumbing, retries, typed errors. Cost: you write loop, stop-reason handling, validation. | `streamText`/provider are server-side; `@ai-sdk/react` `useChat` is browser. Free: loop (`stopWhen`), UI message protocol, transport, React state, client-tool forwarding. Cost: its own message format + transport, a provider abstraction between you and Anthropic params. |
| **(b) Directly in browser?** | **No.** Library is Node/Python, ships a per-platform native binary; no browser build. | **Yes**, with `dangerouslyAllowBrowser: true`. API serves CORS (`access-control-allow-origin: *`). Official posture: browser use is *disabled by default* and "dangerous". | Same as 2 — same client. | Split: `useChat` yes; `streamText` + `@ai-sdk/anthropic` are server-side (they'd carry the key). |
| **(c) Reaching browser state** | Loop-on-server only. Tool `handler` in a `createSdkMcpServer` runs in *your Node process*; must relay to browser and block on a reply. | Loop-in-browser: `run()` closes over the Strudel runtime — zero transport. Loop-on-server: `run()` must await a browser round-trip (WebSocket or poll/submit). | Identical to 2; you own the await either way. | Purpose-built for this: a tool with **no `execute`** is forwarded to the client; `useChat`'s `onToolCall` runs it; `addToolOutput`/`addToolResult` returns it; `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls` resubmits. Each step is a fresh HTTP request — the server does not block. |
| **(d) Streaming** | `includePartialMessages: true`; message-level SDK events. Partial tool input not exposed as a first-class `partial_json` stream (see Unverified). | `stream: true` → iterate streams; raw `input_json_delta` / `partial_json` events; `eager_input_streaming: true` must be spread onto `betaZodTool()` output. | Full raw control: `content_block_start` → `input_json_delta` ×N → `content_block_stop`; or `stream.on("inputJson", …)`. | `fullStream` parts `tool-input-start` / `tool-input-delta` / `tool-call`; tool callbacks `onInputStart` / `onInputDelta` / `onInputAvailable`; UI part states `input-streaming` → `input-available` → `output-available` / `output-error`. |
| **(e) Cancellation** | `options.abortController`; `controller.abort()` ends the generator. | Per-request `signal` in the runner's request options (`Pick<RequestOptions,'headers'\|'signal'\|'fallbackState'>`), settable later via `setRequestOptions`. Tool `run()` receives `context.signal`; **the runner still waits for `run` to return**. | `signal` on `create`/`stream`, plus `stream.abort()` / `stream.controller.abort()`. | `stop()` on `useChat`; `abortSignal` on `streamText`, `onAbort` callback, `abortSignal` forwarded to tool `execute`. |

Where they are only cosmetically different: **2 and 3 are the same client, the
same wire protocol, and the same abort primitive.** The only real deltas are the
beta dependency, automatic Zod validation, and who writes the `while` loop.

---

## 1. Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`)

### (a) Environment assumptions

It is Claude Code packaged as a library: "the same tools, agent loop, and
context management that power Claude Code, programmable in Python and
TypeScript"
([overview](https://code.claude.com/docs/en/agent-sdk/overview)). It is
explicitly "available as a library for Python and TypeScript only"; other
languages are told to "run the CLI as a subprocess".

Concretely, per the
[TypeScript page](https://code.claude.com/docs/en/agent-sdk/typescript):

- It **bundles a native Claude Code binary** for your platform as an optional
  npm dependency (`@anthropic-ai/claude-agent-sdk-darwin-arm64`,
  `-linux-x64`, `-win32-x64`, …). SDK version tracks the bundled Claude Code
  version. If optional deps are skipped you point
  `pathToClaudeCodeExecutable` at a separately installed `claude`.
- Sessions are **persisted to disk** by default (`persistSession: true`); can be
  disabled with `persistSession: false`.
- Options include `cwd` (defaults to `process.cwd()`) and `env` (defaults to
  `process.env`) — both clearly Node-shaped.

What you get for free: the agent loop, built-in tools (Read/Write/Edit/Bash/web
search), hooks, subagents, MCP, a permissions system, sessions (resume/fork),
skills/commands/memory loaded from `.claude/`, plugins
([capability table](https://code.claude.com/docs/en/agent-sdk/overview)).
Budget controls: `maxTurns`, `maxBudgetUsd`, `effort`.

What it imposes:

- A **subprocess and a filesystem**, i.e. a server you operate.
- A **built-in tool surface you do not want** for this POC. You remove tools with
  `disallowedTools`, which has two forms: a bare name (`"Bash"`) "removes tool
  from context entirely" and a scoped rule (`"Bash(rm *)"`) leaves the tool but
  denies matching calls. `allowedTools` only auto-approves; it "does not restrict
  Claude to only these tools."
- A **permissions model**: `permissionMode` of `'default' | 'plan' |
  'bypassPermissions'` (the last requires
  `allowDangerouslySkipPermissions: true`), plus a `canUseTool(request, {signal})
  => Promise<boolean>` callback that fires only when the flow falls through to a
  prompt.
- **Auth constraint**: "Anthropic does not allow third party developers to offer
  claude.ai login or rate limits for their products, including agents built on
  the Claude Agent SDK. Use the API key authentication methods" — so an
  Agent-SDK-backed product needs its own API key, i.e. a server.

### (b) Browser?

No. There is no browser build: the package is a Node/Python library whose
runtime is a spawned platform-native binary, reading `cwd`/`env` and persisting
sessions to disk. Nothing in the Agent SDK docs mentions a browser target.

### (c) Reaching browser-resident state

Loop-on-server only. The natural tool surface is an in-process MCP server:

```ts
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
// tool(name, description, inputSchema, handler, extras?)
// createSdkMcpServer({ name, version?, instructions?, tools?, alwaysLoad?, timeout? })
```
(signatures from the [TypeScript reference](https://code.claude.com/docs/en/agent-sdk/typescript)).

The `handler` runs in your Node process. To act on the Strudel buffer it must:
send a command to the browser, await the browser's reply, and return it as the
tool result. That requires a transport the server can *push* on and *block* on —
in practice a WebSocket per browser session, keyed by an in-flight call id. The
`createSdkMcpServer` `timeout` option is the ceiling on that round-trip.
`canUseTool` can additionally block on a human approval, which is a second
blocking round-trip to the same browser.

Note the tool surface is MCP-shaped (`{ content: [{ type: "text", text }] }`),
not raw Messages-API tool results.

### (d) Streaming

`includePartialMessages: boolean` (default `false`) — "Include partial streaming
messages". The generator yields typed SDK messages: `SDKTextMessage`,
`SDKThinkingMessage`, `SDKToolUseMessage`, `SDKToolResultMessage`,
`SDKTaskProgressMessage`, hook messages. Input is `string |
AsyncIterable<SDKUserMessage>` for streaming input.

I could **not** confirm from the docs that raw `input_json_delta` /
`partial_json` fragments for a tool's input are surfaced as observable partial
tool input (see Unverified). The relevant knob is `includePartialMessages`, but
the page does not enumerate the partial-message shape.

### (e) Cancellation

`abortController: AbortController` (default `new AbortController()`). "Pass an
`AbortController` to cancel operations… The operation will be cancelled and the
generator will terminate." `canUseTool` also receives `{ signal: AbortSignal }`.

Aborting kills the turn; it does **not** undo a tool handler's side effect that
already ran — if a `set_pattern` handler already pushed new code into the
browser, that code is live.

---

## 2. Messages API Tool Runner (`client.beta.messages.toolRunner`)

### (a) Environment assumptions

Plain `@anthropic-ai/sdk`. Supported runtimes: "Node.js 20 LTS or later,
Deno v1.28.0+, Bun 1.0+, Cloudflare Workers, Vercel Edge Runtime, Jest 28 with
the `node` environment, Nitro v2.6+", plus "Web browsers: disabled by default…
Enable browser support by explicitly setting `dangerouslyAllowBrowser` to
`true`." React Native is not supported.
([TypeScript SDK docs](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript))

No subprocess, no filesystem, no CLI. It only needs a global `fetch` (and you can
inject your own via the `fetch` client option).

What you get free:

- The agentic loop itself — "No manual loop — the SDK handles calling tools and
  feeding results back… Iteration stops automatically when Claude has no more
  tool calls" (`claude-api skill: typescript/claude-api/tool-use.md`).
- **Schema generation and runtime validation** from Zod via `betaZodTool`: "the
  runner validates each tool input against the Zod schema before calling `run`…
  and never calls `run()` on input that fails"
  (`claude-api skill: typescript/claude-api/streaming.md`). `betaTool()` from
  `@anthropic-ai/sdk/helpers/beta/json-schema` takes a raw JSON Schema instead
  but is **not** validated at runtime — validate inside `run`.
- `max_iterations` (a hard cap on API requests in the loop), `setMessagesParams`,
  `pushMessages`, `setRequestOptions`, `done()` / `runUntilDone()`, and
  `runner.params` (holds the conversation so far).
- Structured tool errors: `throw new ToolError(...)` from
  `@anthropic-ai/sdk/lib/tools/BetaRunnableTool` accepts content blocks (text,
  images), not just a string.
- Default **2 retries** with exponential backoff on connection errors, 408, 409,
  429, ≥500. Default timeout 10 minutes (scaled by `max_tokens` when not
  streaming, up to 60 min).

What it imposes:

- **Beta surface** (`client.beta.messages.*`). The skill flags it: drop to a
  manual loop when "avoiding a beta dependency" matters.
- It does **not** auto-resume `pause_turn` (as of `@anthropic-ai/sdk` 0.110.0):
  "a paused turn ends the loop and is returned as the final message — no error,
  no warning, just a silently truncated answer." Only relevant if you mix in
  server tools; a Strudel POC with only client tools won't hit it.
- It does **not** apply stop-reason rules: you must check `stop_reason` for
  `max_tokens` (with a `tool_use` present) and `refusal` yourself after each
  turn, before the runner executes that turn's tools.
- No built-in tools are imposed — the tool surface is exactly what you pass.
- Context management is **not** built in the way the Agent SDK's is; the
  `compactionControl` option is deprecated in favour of server-side compaction
  (`edits: [{ type: 'compact_20260112' }]` in the runner params), per a
  deprecation warning in `BetaToolRunner.ts`.

### (b) Browser?

**Yes, technically.** Verified in the SDK source
([`src/client.ts`](https://github.com/anthropics/anthropic-sdk-typescript/blob/main/src/client.ts)):

```ts
if (!options.dangerouslyAllowBrowser && isRunningInBrowser()) {
  throw new Errors.AnthropicError("It looks like you're running in a browser-like environment. …");
}
```

and, when the option is set, the client adds the header automatically:

```ts
...(this._options.dangerouslyAllowBrowser ?
  { 'anthropic-dangerous-direct-browser-access': 'true' }
: undefined),
```

So you do **not** set `anthropic-dangerous-direct-browser-access` yourself — the
flag implies the header.

**CORS**: the API does serve it. Empirically probed (this session, 2026-09-21):

```
$ curl -i -X OPTIONS https://api.anthropic.com/v1/messages \
    -H "Origin: https://example.com" -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: x-api-key,anthropic-version,content-type,anthropic-dangerous-direct-browser-access"
HTTP/2 200
access-control-allow-origin: *
access-control-allow-methods: DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT
access-control-allow-headers: x-api-key,anthropic-version,content-type,anthropic-dangerous-direct-browser-access
access-control-allow-credentials: true
access-control-max-age: 600
vary: Origin, Access-Control-Request-Headers
```

The allow-headers list is echoed from the request (a probe with
`anthropic-beta,x-totally-made-up` was echoed back verbatim), so beta headers
pass preflight too. This is an empirical observation, not a documented
guarantee.

**Official posture on shipping a key to a browser** — from the SDK docs'
"Browser usage" accordion, verbatim:

> Enabling the `dangerouslyAllowBrowser` option can be dangerous because it
> exposes your secret API credentials in the client-side code. Web browsers are
> inherently less secure than server environments, any user with access to the
> browser can potentially inspect, extract, and misuse these credentials. This
> could lead to unauthorized access using your credentials and potentially
> compromise sensitive data or functionality.
>
> **When might this not be dangerous?** … **Internal tools:** If the application
> is used solely within a controlled internal environment where the users are
> trusted… **Development or debugging purpose:** Enabling this feature
> temporarily might be acceptable, provided the credentials are short-lived,
> aren't also used in production environments, or are frequently rotated.

Note both carve-outs (single-developer internal tool; short-lived rotated
credentials) match a solo live-coding POC fairly well. That is an observation
about what the doc says, not a recommendation.

### (c) Reaching browser-resident state

**Loop-in-browser.** This is the shape the Tool Runner is best at. `run()` is a
closure:

```ts
const setPattern = {
  ...betaZodTool({
    name: "set_pattern",
    description: "Replace the contents of the Strudel editor buffer and re-evaluate.",
    inputSchema: z.object({ code: z.string() }),
    run: async ({ code }) => {           // closes over the live editor + scheduler
      editor.setValue(code);
      await strudel.evaluate(code);
      return "ok";
    },
  }),
  eager_input_streaming: true,
};
```

No transport, no serialization boundary, no id correlation, no session affinity.
The tool result is whatever `run` returns. The whole "relay" problem disappears.

**Loop-on-server.** The runner is an in-process loop: it `await`s `run()` and
only then issues the next request. So `run()` has to block on the browser. The
transports, ranked by how much you own:

- **WebSocket** — server pushes `{callId, name, input}`, browser replies
  `{callId, result}`; `run()` awaits a promise keyed on `callId`. One connection,
  both directions, naturally blocking. Fewest moving parts for this shape.
- **SSE + a POST endpoint** — SSE carries the server→browser push, a separate
  `POST /tool-result` carries the reply; the server holds the promise. Works, but
  is two half-transports plus correlation state, and SSE is server→client only.
- **HTTP round-trip only** — does not work for a server-owned loop: the server
  cannot initiate. You'd have to invert to the Vercel AI SDK shape (option 4),
  where the *loop* is broken into per-step requests.

Who owns/blocks: with the runner on the server, the **server process** holds the
in-flight turn and blocks in `run()`; the browser is a slave that answers. That
means a server-side session object per browser tab, a timeout policy, and a
reconnect story if the tab refreshes mid-turn.

### (d) Streaming

Construct with `stream: true`; then "each iteration yields a stream, not a
message" (`claude-api skill: typescript/claude-api/tool-use.md`). Outer loop =
runner iterations, inner loop = stream events:

```ts
for await (const messageStream of runner) {
  for await (const event of messageStream) {
    if (event.type === "content_block_delta") {
      if (event.delta.type === "text_delta")       process.stdout.write(event.delta.text);
      if (event.delta.type === "input_json_delta") process.stdout.write(event.delta.partial_json);
    }
  }
  const message = await messageStream.finalMessage();
}
```

**Partial tool input is observable**, and it is the same wire feature for
options 2 and 3 — see the shared subsection below.

Gotcha specific to the runner: `betaZodTool()` has **no option** for
`eager_input_streaming`; you spread it onto the returned object:

```ts
const tool = { ...betaZodTool({ name, description, inputSchema, run }), eager_input_streaming: true };
```
(`claude-api skill: shared/tool-use-concepts.md` → Eager input streaming.)

### (e) Cancellation

The runner's request options type is, verbatim from
[`src/lib/tools/BetaToolRunner.ts`](https://github.com/anthropics/anthropic-sdk-typescript/blob/main/src/lib/tools/BetaToolRunner.ts):

```ts
export type BetaToolRunnerRequestOptions = Pick<RequestOptions, 'headers' | 'signal' | 'fallbackState'>;
```

So yes, the Tool Runner can be aborted: pass `signal` as the second argument to
`toolRunner(params, { signal })`, or set it later with
`runner.setRequestOptions({ signal: controller.signal })`. The signal is threaded
into every request the runner makes (including its internal compaction call).

**What happens to a mid-flight tool call** — from the source's own doc comment on
`BetaToolRunContext.signal`:

> Aborted when the runner is aborted or, in the session runner, when the
> per-tool timeout fires. **The runner still waits for `run` to return**, so
> check it in long-running work.

That is the important bit: aborting does not kill `run()`. Your `run()` must
observe `context.signal` itself, or the runner sits waiting for it. Separately,
the runner's iteration `finally` block calls `this.#stream?.abort()` at the end
of each iteration, so a streaming turn's HTTP stream is always torn down.

What cancelling does not undo: a `run()` that already wrote to the Strudel
buffer has already written to it. Cancellation is about the model turn, not the
world. If you want undo, the tool has to record an inverse itself.

---

## 3. Manual Messages API loop (`client.messages.create` / `.stream`)

### (a) Environment assumptions

Identical to option 2 — same package, same runtimes, same browser rule, same
retry/timeout defaults. The difference is purely how much you write.

The skill is explicit about when to choose it: "Prefer the tool runner above.
Drop to a manual loop only when you need control the runner does not expose
(e.g., a custom transport, request shapes the SDK cannot build, or avoiding a
beta dependency — the runner is beta, and it supports per-token streaming via
`stream: true`). Human-in-the-loop approval does *not* require a manual loop"
(`claude-api skill: typescript/claude-api/tool-use.md`).

"A custom transport" is the phrase that matters here: if the tool-result
round-trip is not a plain `await`, the manual loop is the shape that
accommodates it, because *you* decide when the next `create()` happens.

What you get free: HTTP, SSE parsing, typed errors (`Anthropic.RateLimitError`,
`Anthropic.APIError`, …), 2 retries, `_request_id` on every response. Nothing
else. No context management, no compaction, no validation, no loop.

What you must write: the `while` loop, `stop_reason` dispatch (`end_turn`,
`tool_use`, `pause_turn`, `max_tokens`, `refusal`), message accumulation, input
validation, and the invalid-JSON `is_error` tool result.

### (b) Browser?

Same as option 2: `dangerouslyAllowBrowser: true`, header sent automatically,
CORS served. Same official warning text applies.

### (c) Reaching browser-resident state

**Loop-in-browser**: trivially the same as option 2 — `executeTool()` closes over
the live state.

**Loop-on-server**: this is where the manual loop earns its keep. Because you
control the point at which the loop resumes, you can suspend the loop across a
network boundary rather than block inside a callback:

- Turn N returns `stop_reason: "tool_use"`. You persist `messages` server-side,
  emit the `tool_use` block(s) to the browser (SSE, or the response body of the
  current HTTP request), and **return**.
- The browser runs the tool against the Strudel state and POSTs
  `{tool_use_id, content}` back.
- That POST resumes the loop: append the `tool_result` user message, call
  `create()` again.

That turns the round-trip into two ordinary HTTP requests and needs no
WebSocket — at the cost of server-side conversation state keyed by session, and a
re-entrancy story if two results arrive out of order. (This is, structurally,
exactly what the Vercel AI SDK implements for you; see option 4.)

The tool-result message shape either way:

```ts
messages.push({ role: "assistant", content: message.content });
messages.push({ role: "user", content: [
  { type: "tool_result", tool_use_id: toolUse.id, content: result },
]});
```

### (d) Streaming

Full raw access. `client.messages.stream({...})` plus `finalMessage()`; text via
`stream.on("text", …)`, tool-input fragments via `stream.on("inputJson", …)` or
by filtering `content_block_delta` for `input_json_delta`. See the shared
subsection below.

### (e) Cancellation

Three documented forms:

- Per-request `signal`. From
  [`src/internal/request-options.ts`](https://github.com/anthropics/anthropic-sdk-typescript/blob/main/src/internal/request-options.ts):
  `/** An AbortSignal that can be used to cancel the request. */ signal?: AbortSignal | undefined | null;`
  Passed as the second arg: `client.messages.create(params, { signal })`.
- `stream.abort()` — in
  [`src/lib/MessageStream.ts`](https://github.com/anthropics/anthropic-sdk-typescript/blob/main/src/lib/MessageStream.ts):
  `abort() { this.controller.abort(); }`, over a public
  `controller: AbortController = new AbortController()`. An external `signal`
  passed via request options is wired to it
  (`signal.addEventListener('abort', this.controller.abort.bind(this.controller))`),
  and an already-aborted signal aborts immediately. Aborting emits the stream's
  `abort` event with an `APIUserAbortError`.
- For `client.messages.create({..., stream: true})` (the lower-level iterable):
  "If you need to cancel a stream, you can `break` from the loop or call
  `stream.controller.abort()`."
  ([TypeScript SDK docs](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript))

Because *you* call the tool, you also control what happens to a mid-flight tool
call: nothing is hidden. You can abandon it, await it, or feed a synthetic
`is_error` tool result. Still: whatever the tool already did to the Strudel
buffer stays done.

---

### Shared: partial tool input on the Messages API (applies to 2 and 3)

Per the
[fine-grained tool streaming doc](https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming):

- Field name: **`eager_input_streaming: true`**, set per user-defined tool, on a
  streaming request. "All models support fine-grained tool streaming on the
  Claude API" and on Bedrock / AWS / Google Cloud / Foundry.
- It is **GA, not a beta**. The older `fine-grained-tool-streaming-2025-05-14`
  beta header is **legacy**: it "turns fine-grained streaming on for tools that
  leave the field unset. The per-tool field replaces that header, and an explicit
  `false` keeps buffered streaming for a tool even when a request still sends
  it." The legacy header **cannot** be combined with a computer-use or
  browser-use toolset entry (the API rejects the request).
  (Cross-check: `claude-api skill: shared/model-migration.md` lists
  `fine-grained-tool-streaming-2025-05-14` as GA → "Remove".)
- Default without the field: "the API buffers and validates each parameter value
  before streaming it back, so nothing prints for a large parameter until Claude
  has finished generating it."
- Events are unchanged either way: `content_block_start` (with `input: {}` as a
  placeholder) → `content_block_delta` with
  `{"type":"input_json_delta","partial_json":"…"}` ×N → `content_block_stop`.
  Concatenate `partial_json`, parse at `content_block_stop`.
- SDK conveniences: TS `stream.on("inputJson", partialJson => …)`;
  the stream accumulator materializes the input at `content_block_stop`.

**The validation caveat, stated by the source:**

> Because the API does not buffer or validate a tool's input before streaming
> it, you might receive partial or invalid JSON. A response that ends with the
> stop reason `max_tokens` can also cut a parameter off midway. Accumulate the
> fragments, guard the parse…

The skill sharpens this (`claude-api skill: shared/tool-use-concepts.md`):

1. Validate the parsed input against the tool's schema **before** running the
   tool. `betaZodTool` / typed runners do this; `betaTool()` (raw JSON Schema)
   does **not** — validate inside `run` or leave the flag off for that tool.
2. Check `stop_reason === "max_tokens"` when a `tool_use` block is present — "a
   truncated input usually parses as a valid partial object, so this is what
   catches it". Also stop on `stop_reason === "refusal"`.
3. Both SDKs use a **tolerant** partial-JSON parser, so malformed input often
   comes back as a *silently truncated object* rather than an exception. "Do not
   rely on an exception."
4. For JSON that cannot be parsed at all, TypeScript materializes the input at
   `content_block_stop`, so the error rejects `await stream.finalMessage()` (or
   the `for await` loop) — wrap the whole consumption. Catch only that; rethrow
   typed API errors.
5. When you hold the `tool_use` block and validation failed, return
   `{"type":"tool_result","tool_use_id":"…","is_error":true,"content":"{\"INVALID_JSON\":\"…\"}"}`.
   When the SDK raised before the block completed there is no `tool_use_id` —
   re-issue the request instead.

**What partial tool input buys a live-coding UI.** The tool input *is* the
artifact here: a `set_pattern(code)` call's `code` parameter is the music. With
`eager_input_streaming` you can render the pattern into a ghost/preview buffer
character-by-character as Claude writes it, show a live diff against the current
buffer, or start syntax-highlighting before the call completes — instead of a
multi-second silent gap followed by a sudden full replacement. The skill notes
the gap is real: "a 20K-token parameter is a multi-minute silent gap on the
stream." The trade is that anything you show mid-stream is unvalidated and may
be truncated, so the optimistic render must be a *preview* that only commits at
`content_block_stop` after validation — never evaluated into the Strudel
scheduler mid-stream.

---

## 4. Vercel AI SDK (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/react`)

### (a) Environment assumptions

It is split by design:

- **Server**: `streamText` / `generateText` from `ai`, plus the provider
  `@ai-sdk/anthropic`. The provider takes `apiKey` (sent as `x-api-key`,
  defaults to `ANTHROPIC_API_KEY`), `authToken` (`Authorization: Bearer`,
  `ANTHROPIC_AUTH_TOKEN`), `baseURL` (default `https://api.anthropic.com/v1`),
  `headers`, and a custom `fetch`
  ([provider page](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic)).
- **Browser**: `@ai-sdk/react`'s `useChat`, which "uses a transport-based
  architecture" defaulting to `DefaultChatTransport` and "no longer manages
  input state internally" as of SDK 5.0
  ([useChat reference](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat)).

Free: the agentic loop with declarative stop conditions, a UI message protocol
with typed parts, React state (`messages`, `status`, `stop`, `regenerate`),
streaming transport, and the client-tool forwarding described below. The
Anthropic provider also handles thinking config (`type: 'adaptive'`, or
`budgetTokens` on older models), `cacheControl: { type: 'ephemeral' }` on message
parts, and "automatically adds required beta headers".

Imposed: a provider abstraction between you and raw Anthropic request params
(anything Anthropic-specific goes through provider options), its own UIMessage
format and transport protocol, and — for a browser-resident loop — the fact that
`streamText` and the provider are server-side, so the key lives on a server.

Loop control (from [Loop control](https://ai-sdk.dev/docs/agents/loop-control)):
`stopWhen` with built-in helpers — `isStepCount(count)`, `hasToolCall(...names)`,
`isLoopFinished()`; multiple conditions in an array, "execution stops when any of
the conditions are met"; `ToolLoopAgent` defaults to `isStepCount(20)`.
`prepareStep` runs before each step for dynamic model/tool/message changes.

> ⚠ Naming: this page reports `isStepCount`. Older AI SDK v5 material uses
> `stepCountIs(n)`. Treat the exact spelling as version-dependent and check
> against the installed package.

### (b) Browser?

Partially, and deliberately:

- `@ai-sdk/react` (`useChat`) — browser, by design.
- `streamText`, `generateText`, `@ai-sdk/anthropic` — server. The provider page
  "does not specify whether this provider runs in browsers"; it reads the API key
  from env and is used in server route handlers throughout the docs. There is no
  `dangerouslyAllowBrowser` equivalent, and no documented browser posture.

So the Vercel AI SDK is the one option that **cannot** put the whole loop in the
browser without going off-label. That is also the point: its client-tool feature
exists precisely so the loop can stay on the server while tools run in the
browser.

### (c) Reaching browser-resident state — this is its headline feature

From [Chatbot tool usage](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage)
and [Tools and tool calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling):

- A tool defined **without an `execute` function** is not run on the server.
  "Tools without `execute` can forward calls to clients or queues instead of
  processing locally." The loop-control page confirms this is a loop-terminating
  condition: the loop continues until "a finish reason other than tool-calls is
  returned, **or a tool that is invoked does not have an execute function**, or a
  tool call needs approval, or a stop condition is met."
- On the client, `useChat`'s **`onToolCall`** callback receives the invocation:
  `({ toolCall }) => void | Promise<void>`. The guide: "Client-side tools that
  should be automatically executed are handled with the `onToolCall` callback.
  You must call `addToolOutput` to provide the tool result."
- **`addToolOutput`** (the useChat reference also lists **`addToolResult`**) takes
  `{ tool, toolCallId, output }`, or an error form with
  `state: 'output-error'` and `errorText`. Important caveat, verbatim: calls
  should occur "without `await` to avoid potential deadlocks."
- Type-narrowing rule: "Always check `if (toolCall.dynamic)` first in your
  handler… before accessing `toolCall.toolName`."
- **`sendAutomaticallyWhen`** with the `lastAssistantMessageIsCompleteWithToolCalls`
  helper "automatically submits when all tool results are available", which is
  what makes the multi-step loop continue without a user action.

**What the transport actually is:** ordinary HTTP. The server's `streamText`
stops when it emits a tool call with no `execute`; the stream ends; the browser
runs the tool; `sendAutomaticallyWhen` fires a **new POST** carrying the full
message list including the tool output; the server resumes. Nobody blocks: the
server holds no in-flight turn across the tool call. No WebSocket, no server-side
session state, no correlation ids — that is the real advantage.

The cost of that shape: the whole conversation is round-tripped from browser to
server on every step (relevant to prompt caching and payload size), and
per-tool-call latency includes a fresh HTTP request + a fresh model request.

For the Strudel POC, a `set_pattern` tool would be declared server-side with
`inputSchema` but **no `execute`**, and implemented in `onToolCall` where the
editor and scheduler live — structurally the same closure as option 2's
loop-in-browser, but with the model call brokered by your server so the API key
never ships.

Mixed surfaces work: read-only tools that need no browser state (docs lookup,
Strudel reference) can keep a server `execute`; only the state-touching ones go
executeless.

### (d) Streaming

- Core `streamText` `fullStream` emits `tool-input-start`, `tool-input-delta`
  (argument text chunks), then `tool-call` with "finalized tool invocation with
  validated inputs"
  ([tools and tool calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)).
  Tool-level callbacks: `onInputStart()`, `onInputDelta()` (streaming only),
  `onInputAvailable()` (complete, validated input).
- UI side: message `parts` progress through `input-streaming` → `input-available`
  → `output-available` / `output-error`. `input-streaming` is the UI-level
  equivalent of `partial_json` — it is exactly what you'd bind a ghost-buffer
  preview to.
- `status` on `useChat` is `'submitted' | 'streaming' | 'ready' | 'error'`.

> ⚠ The `streamText` API-reference page returned older part names
> (`tool-call-streaming-start`, `tool-call-delta`) while the conceptual page
> gives `tool-input-start` / `tool-input-delta`. The latter matches AI SDK v5+
> naming. Verify against the installed version.

Whether AI SDK's `tool-input-delta` actually maps onto Anthropic's
`eager_input_streaming` (i.e. whether the Anthropic provider sets that field, or
whether you get the API's default buffered-per-parameter behaviour surfaced as
one big delta) is **not documented on the provider page** — see Unverified. This
matters: without `eager_input_streaming`, `input-streaming` on a long `code`
parameter will still arrive in one burst at the end.

### (e) Cancellation

- Client: `useChat().stop()` — "Halts the current operation."
- Server: `streamText({ abortSignal })` and `onAbort: (event) => Promise<void>`;
  `abortSignal` is also forwarded to a tool's `execute` as part of the second
  argument (alongside `toolCallId`, `messages`, `context`).

Whether `stop()` propagates through the transport to abort the *upstream*
Anthropic request, rather than only detaching the client's reader, is the
interesting question and I could not confirm it from the docs (see Unverified).
Mechanically it depends on the route handler wiring
`request.signal` → `streamText({ abortSignal })`; the presence of `onAbort` and
`abortSignal` on `streamText` means the plumbing exists, but the docs I read do
not state that `stop()` alone completes the chain.

What `stop()` does not undo: a client tool that already ran in `onToolCall` has
already mutated the Strudel state. Also note that because tool results are sent
in the *next* request, stopping between the tool running and the auto-submit
leaves the state mutated with the model never told — an inconsistency the other
three options don't have in the same form.

---

## Model options: latency/cost profile for SHORT, TOOL-HEAVY turns

### Price and limits

Prices per MTok, from
[Pricing](https://platform.claude.com/docs/en/about-claude/pricing). Context /
max output from `claude-api skill: shared/models.md`.

| Model | ID | Input | Output | 5m cache write | 1h cache write | Cache read | Batch in/out | Context | Max output |
|---|---|---|---|---|---|---|---|---|---|
| Claude Opus 5 | `claude-opus-5` | $5 | $25 | $6.25 | $10 | $0.50 | $2.50 / $12.50 | 1M | 128K |
| Claude Sonnet 5 | `claude-sonnet-5` | $2 | $10 | $2.50 | $4 | $0.20 | $1 / $5 | 1M | 128K |
| Claude Haiku 4.5 | `claude-haiku-4-5` | $1 | $5 | $1.25 | $2 | $0.10 | $0.50 / $2.50 | 200K | 64K |

Notes:
- Sonnet 5's $2/$10 was introductory pricing "announced… through August 31,
  2026"; the docs now state it "is now the standard price. The previously
  scheduled increase to $3/$15… will not occur."
- Cache reads are 0.1× base input on all three.
- 1M context is at standard pricing on Claude 4.6 and later — no long-context
  premium.
- Claude 4.7 and later use a newer tokenizer producing "approximately 30% more
  tokens for the same text" — so Opus 5 / Sonnet 5 token counts are not
  comparable to Haiku 4.5's for the same text. This inflates both cost and
  latency estimates carried over from older models.

### Fast mode

| | Applies? | Price | Constraints |
|---|---|---|---|
| Opus 5 | **Yes** | $10 in / $50 out per MTok | Research preview; **Claude API (first-party) only** — not Bedrock, Google Cloud, Foundry, or Claude Platform on AWS. Not available with the Batch API. Dedicated rate limits separate from the standard Opus pools. |
| Sonnet 5 | **No** | — | Fast mode is listed only for Opus 5 and Opus 4.8. |
| Haiku 4.5 | **No** | — | Same. |

Invocation: beta endpoint (`client.beta.messages.*`), beta flag
**`fast-mode-2026-02-01`**, and **`speed: "fast"`** as a top-level request
parameter. Fast-mode pricing "applies across the full context window, including
requests over 200k input tokens", and stacks with prompt-caching multipliers and
data-residency multipliers.
([Fast mode pricing](https://platform.claude.com/docs/en/about-claude/pricing#fast-mode-pricing);
`claude-api skill: shared/model-migration.md` §Fast Mode.)

So for a latency-budget ticket: fast mode is the only lever that buys raw
decode speed at a fixed model, it doubles the token price, and it restricts you
to the first-party API.

### Effort (`output_config.effort`)

From [Effort](https://platform.claude.com/docs/en/build-with-claude/effort). The
parameter is `output_config: { effort: "low" | "medium" | "high" | "xhigh" | "max" }`,
top-level, **no beta header required**. Default is `high`; "Setting `effort` to
`"high"` produces exactly the same behavior as omitting the `effort` parameter
entirely."

| Model | Supported levels |
|---|---|
| Claude Opus 5 | `low`, `medium`, `high`, `xhigh`, `max` (all five) |
| Claude Sonnet 5 | `low`, `medium`, `high`, `xhigh`, `max` (all five) |
| Claude Haiku 4.5 | **Not supported.** The doc's "Supported models" list omits `claude-haiku-4-5` entirely. |

Why effort matters specifically for tool-heavy turns — verbatim from the doc:

> When using tools, the effort parameter affects both the explanations around
> tool calls and the tool calls themselves. Lower effort levels tend to:
> Combine multiple operations into fewer tool calls · Make fewer tool calls ·
> Proceed directly to action without preamble · Use terse confirmation messages
> after completion.

And: "Because effort applies to every output token, it works whether or not
thinking is enabled. Lower effort also means fewer and terser tool calls."
That is a direct latency lever for a short interactive turn — fewer round trips,
less preamble — separate from raw decode speed.

Opus 5 caveat: "Effort controls thinking volume, not visible response length: on
Claude Opus 5, changing effort does not reliably shorten responses, so prompt for
length instead."

**Cache interaction (important for a loop):** "The resolved effort value is
rendered into the prompt, so changing it between requests invalidates cache
breakpoints." Per-message effort avoids this on Opus 5 (beta
`mid-conversation-output-config-2026-07-01`: a `role: "system"` message with
`content: []` and `output_config: {effort: …}`) — supported on Claude Fable 5.1,
Claude Mythos 5.1 and **Claude Opus 5**, not Sonnet 5.

### Thinking configuration

From [Troubleshooting thinking](https://platform.claude.com/docs/en/build-with-claude/thinking-troubleshooting)
(the per-model table is the authority):

| Model | Thinking types | Default | Rejected with 400 |
|---|---|---|---|
| Claude Opus 5 | Adaptive only | On | `"enabled"`, `"disabled"`* |
| Claude Sonnet 5 | Adaptive only | On | `"enabled"` |
| Claude Haiku 4.5 | **Extended only** | Off | `"adaptive"` |

\* Opus 5 accepts `thinking: {type: "disabled"}` only at effort `high` or below;
combining it with `xhigh`/`max` returns a 400.

This confirms the asymmetry the ticket asked about:

- **Haiku 4.5 still uses `budget_tokens`**: `thinking: {type: "enabled",
  budget_tokens: N}`. Passing `{type: "adaptive"}` returns a 400
  (`adaptive thinking is not supported on this model`). Thinking is **off** by
  default on Haiku 4.5.
- **The 5-family rejects `budget_tokens`**: `"thinking.type.enabled" is not
  supported for this model. Use "thinking.type.adaptive" and
  "output_config.effort" to control thinking behavior.` Both Opus 5 and
  Sonnet 5 have thinking **on** by default; omitting `thinking` runs adaptive.
- Since Haiku 4.5 supports neither `effort` nor adaptive thinking, the only
  thinking knob you have there is `budget_tokens` (or leaving thinking off,
  which is the default).

Other latency-relevant thinking facts:
- Thinking counts toward `max_tokens` ("a hard cap on total output for the
  request, thinking and response text combined"). "In a tool-use loop, each
  request in the turn has its own `max_tokens`, so it doesn't bound the whole
  turn's spend."
- Thinking interleaves with tool use automatically — "Claude can think between
  tool calls… You don't need a beta header or any additional configuration."
  That is latency you pay per tool call, not per turn.
- `thinking.display` defaults to omitted on newer models (empty `thinking` text,
  signature only). Set `display: "summarized"` to see it. Billing is identical
  either way; `usage.output_tokens_details.thinking_tokens` reports the billed
  reasoning tokens, and when streaming "this breakdown appears only on the final
  `message_delta` event."
- Opus 5, thinking disabled, tool-heavy: "A response occasionally writes a tool
  call into its text instead of emitting a `tool_use` block… This happens on
  Claude Opus 5 when thinking is disabled, most commonly on tool-heavy workloads
  such as search." Directly relevant if you were planning to disable thinking for
  latency.

### Tool-use token overhead

The `tools` parameter adds a per-model tool-use system prompt, from
[Pricing → Tool use pricing](https://platform.claude.com/docs/en/about-claude/pricing):

| Model | `tool_choice: auto`/`none` | `tool_choice: any`/`tool` |
|---|---|---|
| Claude Opus 5 | 286 tokens | 406 tokens |
| Claude Sonnet 5 | 354 tokens | 474 tokens |
| Claude Haiku 4.5 | 496 tokens | 588 tokens |

Plus the tool definitions themselves, `tool_use` blocks, and `tool_result`
blocks. Small, but it is fixed per request and a tool-heavy turn pays it on every
iteration.

### Prompt caching in a loop that resends a growing transcript

This is the single biggest cost lever for the shape described in the ticket, and
the skill states the invariant plainly
(`claude-api skill: shared/prompt-caching.md`):

> **Prompt caching is a prefix match. Any change anywhere in the prefix
> invalidates everything after it.** … Render order is: `tools` → `system` →
> `messages`.

Applied to a tool loop:

- **Multi-turn placement**: "Put a breakpoint on the last content block of the
  most-recently-appended turn. Each subsequent request reuses the entire prior
  conversation prefix. Earlier breakpoints remain valid read points, so hits
  accrue incrementally as the conversation grows."
- Economics: a cache hit costs 0.1× base input, so caching "pays off after one
  cache read for the 5-minute duration (1.25× write), or after two cache reads
  for the 1-hour duration (2× write)". In a tool loop where each iteration
  resends everything before it, every iteration after the first is a read — the
  5-minute cache is essentially always worth it.
- Minimum cacheable prefix on Opus 5 is **512 tokens** (down from 1024 on Opus
  4.8) — `claude-api skill: shared/models.md`.
- **Silent invalidators to avoid in this POC**: changing top-level `effort`
  between requests; switching models mid-session; adding/removing tools
  mid-session; editing the top-level `system` prompt. Each restarts the prefix.
  For a live-coding agent that might want to inject "the user just edited the
  buffer" mid-session, the skill's answer is a mid-conversation
  `{"role": "system", ...}` message appended to `messages[]` rather than editing
  `system` — "The cached prefix stays intact". Supported on **Claude Opus 5** but
  **not** on Claude Sonnet 5 ("Sources conflict… Treat it as unsupported and
  catch the 400"). Not applicable to Haiku 4.5.
- A per-turn reminder that is injected then *removed* is a history edit and
  misses the cache from that point; use `clear_at: "next_user_message"` (beta
  `mid-conversation-system-clear-at-2026-08-21`) and leave earlier copies in
  place.
- Changing the thinking configuration also invalidates: "switching thinking
  modes, changing the effort value, and changing `budget_tokens` all invalidate
  message cache breakpoints".

---

## Unverified / open

Flagged honestly. Nothing below was confirmed against a primary source.

1. **Agent SDK partial tool input.** I could not confirm whether
   `includePartialMessages: true` surfaces per-fragment tool *input* (the
   `input_json_delta` / `partial_json` equivalent), or only partial assistant
   text. The TypeScript reference names the option and lists `SDKToolUseMessage`
   but does not document the partial-message shape. Needs a look at the
   `SDKPartialAssistantMessage` type in the package.
2. **Whether `@ai-sdk/anthropic` sets `eager_input_streaming`.** The provider
   page does not mention it. If it does not, AI SDK `tool-input-delta` /
   `input-streaming` on a large `code` parameter will still arrive in one burst
   because the API buffers per parameter by default. This is load-bearing for the
   optimistic-preview idea and should be checked in the provider source or by
   observation.
3. **Whether `useChat().stop()` aborts the upstream Anthropic request.** Docs say
   `stop()` "halts the current operation" and that `streamText` takes
   `abortSignal` with an `onAbort` callback, but I found no statement that the
   default transport propagates the client abort through the route handler to the
   model call. It plausibly depends on the route handler passing
   `request.signal` into `streamText`.
4. **`addToolOutput` vs `addToolResult`.** The current chatbot-tool-usage guide
   uses `addToolOutput`; the `useChat` API reference lists both. Likely a rename
   with an alias. Check the installed `@ai-sdk/react` version's types.
5. **`isStepCount` vs `stepCountIs`, and `fullStream` part names.** The
   loop-control page says `isStepCount(count)`; older v5 material says
   `stepCountIs(n)`. The `streamText` reference page returned
   `tool-call-streaming-start` / `tool-call-delta` while the conceptual page
   returned `tool-input-start` / `tool-input-delta`. Version-dependent; verify
   against the package. The `ai-sdk.dev/docs/reference/ai-sdk-core/step-count-is`
   URL returned **404**.
6. **Anthropic API CORS is an empirical finding, not a documented guarantee.**
   The `OPTIONS` probe above returned `access-control-allow-origin: *` and echoed
   the requested headers. I found no docs page stating a CORS policy, and it
   could change. Also unverified: whether the API *rejects* a browser-origin
   request that omits `anthropic-dangerous-direct-browser-access`.
7. **Agent SDK Node minimum version.** Not stated on the TypeScript page.
8. **Agent SDK compaction configuration.** The page references `PreCompact` /
   `PostCompact` hooks but the excerpt I read did not document the compaction
   config surface.
9. **Adaptive thinking URL.** `…/build-with-claude/adaptive-thinking.md` (listed
   in `claude-api skill: shared/live-sources.md`) now redirects to
   `thinking-steering-and-cost`. Content was obtained; the live-sources entry is
   stale.
10. **Skill internal inconsistency, noted.** `shared/tool-use-concepts.md`
    heads its section "Eager input streaming (default for streaming requests with
    client tools)" while its body says the API buffers by default. The heading is
    the skill's own *recommendation* ("Default rule: … set
    `eager_input_streaming: true`"), not an API default. The platform doc is
    unambiguous that omitting the field gives buffered streaming; I followed the
    doc.
11. **No measured latency numbers anywhere.** Neither the docs nor the skill
    publish TTFT or tokens/sec per model. Everything above about latency is
    structural (fewer tool calls, less thinking, fast mode, cache hits), not
    measured. A latency-budget ticket will need its own measurements.
