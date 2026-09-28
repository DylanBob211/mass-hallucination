# 02 — Anthropic agent-loop options for a browser-facing tool user

Type: research
Status: resolved
Blocked by: —

## Question

What are the realistic ways to run a Claude agent loop whose tools act on state living in the browser, and what does each cost in moving parts?

Compare, against current Anthropic documentation (consult the `claude-api` skill first):

- **Claude Agent SDK** — what it assumes about its environment, whether it runs in-process server-side, what it gives for free (tool loop, streaming, context management) and what it imposes.
- **Messages API `tool_runner`** — the agentic loop over your own tools; what the loop looks like and how tool results flow back.
- **Manual Messages API loop** — the floor: what you actually have to write.
- **Vercel AI SDK** — if it earns its place for streaming and tool-call UI, note what it adds over the above.

For each, answer: can it run **directly in the browser** at all (and what that means for the API key)? How does a tool call reach browser-resident state and get its result back? What does streaming look like — token streaming, tool-call streaming, and whether partial tool input is observable? How is an in-flight turn cancelled?

Also record model options and their latency/cost profile for short, tool-heavy turns (this feeds ticket 10).

This ticket gathers **facts and trade-offs only** — where the agent runs is decided in ticket 07.

## Deliverable

A markdown summary linked from this ticket, with source links.

## Answer

Full findings: [research/02-anthropic-agent-loop-options.md](../research/02-anthropic-agent-loop-options.md) (935 lines, sourced against platform.claude.com, the Anthropic TS SDK source, the Agent SDK docs, and the Vercel AI SDK docs).

### The four options split on two axes, not one

- **Where the loop runs.** **Claude Agent SDK** is Node-only and *out-of-process* — it spawns a bundled per-platform `claude` binary (optional npm dep), persists sessions to disk, reads `cwd`/`env`. No browser build exists. **Tool Runner** and the **manual loop** are the *same client* over the same wire protocol, in-process, and run anywhere `fetch` runs — including the browser. **Vercel AI SDK** is split by design: `streamText` + `@ai-sdk/anthropic` server-side, `useChat` in the browser.
- **How much of the loop you own.** Agent SDK owns everything (loop, built-in filesystem/bash tools, permissions, sessions, compaction) and you prune with `disallowedTools`. Tool Runner owns only the `while stop_reason === "tool_use"` loop. The manual loop owns nothing. Vercel AI SDK owns the loop *plus* a message/transport protocol and a React state model.

**Tool Runner vs manual loop are only cosmetically different** — same client, same wire, same abort primitive. The real deltas: the beta dependency (`client.beta.*`), automatic Zod validation, and who writes the `while`. Two Tool Runner gotchas: it does **not** auto-resume `pause_turn`, and it does not apply the stop-reason rules for you.

### (b) Browser-direct is real

`dangerouslyAllowBrowser: true` makes `@anthropic-ai/sdk` auto-send `anthropic-dangerous-direct-browser-access: true` (confirmed in the SDK's `src/client.ts`). The API does serve CORS: `OPTIONS /v1/messages` returns `access-control-allow-origin: *` and echoes back requested headers, beta headers included — **note this is an empirical probe, not a documented guarantee**. Official posture is that browser use is disabled by default and "dangerous", with two carve-outs: trusted internal tools, and short-lived/rotated dev credentials. Agent SDK: no browser, full stop. Vercel AI SDK: `useChat` is browser-safe, the provider is not.

### (c) This is the decisive question for 07

- **Loop-in-browser** — the tool's `run()` closes over the live Strudel runtime directly. **Zero transport.**
- **Loop-on-server, Tool Runner or Agent SDK** — the loop *blocks inside* `run()`, so it needs a push-capable blocking transport. WebSocket in practice; SSE+POST is two half-transports; a plain HTTP round-trip cannot work because the server cannot initiate.
- **Loop-on-server, manual loop** — the one shape that can *suspend across* the boundary instead of blocking, turning the round-trip into two ordinary HTTP requests.
- **Vercel AI SDK** — purpose-built for exactly this. A tool with no `execute` is forwarded to the client and terminates the server loop; `useChat`'s `onToolCall` runs it; `addToolOutput` (reference also lists `addToolResult`) returns `{tool, toolCallId, output}` — and **must be called without `await` or it deadlocks**; `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls` resubmits. Nobody blocks; each step is a fresh POST carrying the whole transcript.

**This gives 07 a third option its question doesn't currently enumerate**: not just browser-direct vs thin local server, but *server loop with client-forwarded tools over plain HTTP*.

### (d) Partial tool input is GA, not beta

`eager_input_streaming: true` per user-defined tool on a streaming request (`fine-grained-tool-streaming-2025-05-14` is the legacy header). Events: `content_block_start` (`input: {}` placeholder) → `input_json_delta`/`partial_json` ×N → `content_block_stop`. With it on, **the API no longer validates** — and both SDKs use a *tolerant* parser, so malformed input typically returns a silently truncated object rather than throwing. You must validate against the schema yourself before running, and check for `stop_reason === "max_tokens"` with a `tool_use` present. Gotcha: `betaZodTool()` has no option for it; spread the field on.

For this POC it enables a **ghost-buffer preview** of the pattern as Claude writes it — feeding 09's "what should the human see during the wait" and 04's apply semantics. It must stay a preview and only commit after validation at `content_block_stop`.

### (e) Cancellation

`AbortController` everywhere. Tool Runner *can* be aborted — `BetaToolRunnerRequestOptions = Pick<RequestOptions,'headers'|'signal'|'fallbackState'>`, plus `setRequestOptions` — but the SDK source's own doc comment on `BetaToolRunContext.signal` says **"The runner still waits for `run` to return"**, so your `run()` must observe the signal itself. Manual loop: per-request `signal`, `stream.abort()`, `stream.controller.abort()`. Agent SDK: `options.abortController`.

**Nothing anywhere undoes a tool side effect that already ran** — directly relevant to 04. The Vercel AI SDK has an extra failure mode: stopping between tool execution and auto-submit leaves state mutated with the model never told.

### Model profile for short, tool-heavy turns (feeds 10)

| | Input/Output $/MTok | Context | Fast mode | Effort | Thinking |
|---|---|---|---|---|---|
| Opus 5 | $5 / $25 | 1M | **Yes** — $10/$50, first-party API only | all levels | adaptive only; rejects `budget_tokens` (400) |
| Sonnet 5 | $2 / $10 | 1M | No | all levels | adaptive only; rejects `budget_tokens` (400) |
| Haiku 4.5 | $1 / $5 | 200K | No | **not supported** | **`budget_tokens` only**, off by default; rejects `adaptive` (400) |

Sonnet 5's $2/$10 introductory price is now permanent (the $3/$15 rise was cancelled). Cache reads are 0.1×. Per-request tool-use system-prompt overhead: Opus 5 286 tok, Sonnet 5 354, Haiku 4.5 496. Claude 4.7+ uses a tokenizer producing ~30% more tokens for the same text.

**Haiku 4.5 supporting neither `effort` nor adaptive thinking is a real constraint on 10** — the obvious "use the fast cheap model" lever comes with a different and coarser control surface. `effort: low` explicitly produces *fewer and terser tool calls*, which is itself a latency lever at a fixed model.

**Caching in a resend-everything loop**: breakpoint on the last content block of the newest turn; hits accrue incrementally; the 5-minute cache pays off after one read. Silent invalidators to avoid: changing top-level `effort`, switching models mid-session, adding/removing tools, editing `system`. Mid-conversation `role: "system"` messages preserve the prefix and work on Opus 5 but **not** Sonnet 5.

### Caveat carried forward

**No published TTFT or tokens-per-second numbers exist anywhere.** Every latency claim in the research file is *structural*, not measured. Ticket 10 will need its own measurements — this ticket cannot supply them.

Other items the research could not verify against a primary source are listed in the file's **Unverified / open** section; the load-bearing one for this map is **whether `@ai-sdk/anthropic` sets `eager_input_streaming`**, which the ghost-buffer preview idea depends on.
