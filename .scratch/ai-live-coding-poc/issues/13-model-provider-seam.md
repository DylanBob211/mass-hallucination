# 13 — Model provider seam: `@effect/ai` vs a wrapped SDK, and failover

Type: research
Status: resolved
Blocked by: —

## Question

The agent runtime core is written in Effect (a learning goal, see the map's Notes). The runtime runs
in the browser: the loop is browser-direct unless 07 decides otherwise. The human wants to be able
to **swap model provider mid-performance** if the Anthropic API goes down. Establish the facts that
decide how the loop talks to a model.

1. **`@effect/ai` + `@effect/ai-anthropic`**, at the current stable Effect major. Does it expose
   everything the map already relies on, and does it run in the browser?
   - `cache_control` breakpoints on arbitrary content blocks.
   - `eager_input_streaming` per tool, including partial `input_json_delta` events.
   - `pause_turn`.
   - `tool_choice`.
   - The browser-access header or `dangerouslyAllowBrowser`, or a custom `fetch`/`HttpClient`.

   Also: which other providers ship (Google/Gemini, OpenAI, Bedrock, OpenRouter)? How does
   provider-neutral tool definition work (`Tool`/`Toolkit`, `Schema`)? How stable has the API been
   across recent releases?
2. **Wrapping `@anthropic-ai/sdk` in Effect by hand.** What does idiomatic code look like: the stream
   as a `Stream`, abort through fiber interruption? Is there prior art?
3. **Failover targets, ranked by how little changes.**
   - The same Claude models via **AWS Bedrock** and **Google Vertex AI**:
     - Anthropic's `@anthropic-ai/bedrock-sdk` / `vertex-sdk`.
     - Whether either can authenticate from a browser.
     - Feature parity for caching and eager streaming.
     - Whether their availability is independent of api.anthropic.com.
   - **OpenRouter** as a single multi-provider endpoint.
   - A **different model family** (Gemini via `@google/genai`, OpenAI):
     - What differs in tool-calling semantics.
     - What differs in streaming partial tool input.
     - What differs in prompt caching.
4. **Vercel AI SDK** as the alternative provider-neutral seam, for comparison only. Does it pass
   `eager_input_streaming` and `cache_control` through? (This is 02's open item.)

Out of the question: whether failover is *worth building* for the POC. That is 07's decision.

## Deliverable

A research file at `research/13-model-provider-seam.md`: a feature-coverage table (feature ×
option) with sources, plus a short ranked list of failover targets.

## Answer

Full findings: [research/13-model-provider-seam.md](../research/13-model-provider-seam.md). It has a feature × option table with a source per cell. The research was captured on branch `research/13-model-provider-seam` (commit 55a6834). No end-to-end model call was made. Browser claims rest on package source, docs and live CORS preflights (2026-09-28).

- **Effect AI** (stable Effect 3.22 with `@effect/ai` 0.37 and `@effect/ai-anthropic` 0.27; Effect 4 is still an RC):
  - **Covers:** `cache_control` on messages and parts; partial tool input as `tool-params-delta`; `pause_turn` as `"pause"`; `tool_choice`; `apiUrl`, and `transformClient` for adding the browser header.
  - **Does not cover:** per-tool `eager_input_streaming` or per-tool `cache_control`, in v3 or v4. Workaround: the legacy `fine-grained-tool-streaming-2025-05-14` beta header, or rewriting the body in `transformClient`. Neither has been tested.
  - **Unstable:** 18 breaking 0.x releases in about 13 months. v4 drops Google and Bedrock providers and drops `cache_control` on assistant parts.
- **Hand-wrapped `@anthropic-ai/sdk`:** full typed access to every feature, plus `dangerouslyAllowBrowser` and `baseURL`. Tie the SDK's `AbortController` to a scope finalizer and use `Stream.fromAsyncIterable`. No maintained library does this; the nearest prior art is `@effect/ai-anthropic` itself, which uses `HttpClient` and SSE.
- **Cheapest failover: the same Claude model on Claude in Amazon Bedrock (the Mantle endpoint).** It takes the same Messages body, and docs list caching and eager streaming as supported. Only `baseURL`, the `anthropic.`-prefixed model id and the key change. Its CORS allows any origin, so browser-direct survives. Bearer-token auth in `x-api-key` is contradicted between two doc pages, so test it first. Next come Claude Platform on AWS (Anthropic-operated, a separate capacity pool), then Vertex (small body reshape and an OAuth token), then OpenRouter (its CORS rejects `anthropic-*` headers), then OpenAI, then Gemini (no partial tool arguments, so no live preview).
- **Vercel `@ai-sdk/anthropic` 4.0.67** passes both `eager_input_streaming` (on by default) and `cache_control` (tools included) through. This closes 02's open item.
- **Correlated outages:** no evidence either way.
