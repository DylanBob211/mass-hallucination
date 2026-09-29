---
status: accepted (POC only)
---

_Amended by ticket 11 (the spec): the agent keeps no memory between Instructions. See the amendment at the end._

# For the POC, the agent loop runs in the browser, in Effect, behind our own Model service

**This decision covers the POC only.** The POC is a throwaway tool for judging the idea. The human
runs it on localhost and **never deploys it**. Every choice below depends on that, and every one is
expected to be reconsidered, tools and libraries included, when a product is built after the POC.

The agent loop runs **in the page**. `change_parts` (ADR 0004) acts directly on the live
Performance, so a tool call never crosses a process boundary and the design needs no transport.
The API key is **exposed but capped**:
- It is a dedicated key in its own Console workspace, with a spending limit.
- It is read from `.env.local`, which is never committed.
- It is sent with `dangerouslyAllowBrowser`.

In a browser nothing can hide a key. The cap is what limits the damage if it leaks.

The loop is **hand-written in Effect**. The model sits behind our own `Model` service, an Effect
`Layer`. Its interface speaks this project's terms:
- **In:** the snapshot plus the Instruction.
- **Out:** streamed text, partial `change_parts` input, and the final call.

It has **one implementation**, which wraps `@anthropic-ai/sdk`:
- The stream is exposed as a `Stream`.
- The SDK's `AbortController` is tied to a scope finalizer, so interrupting a fiber cancels the
  request.

## Loop behaviour

- **A Turn ends on the first `ok: true`.** No further model call is made. The agent's explanation
  is the text it wrote before calling the tool. The final `tool_result` is not sent anywhere
  (amended by ticket 11, below).
- **A new Instruction replaces the running Turn** by interrupting its fiber. The UI also has a Stop
  button. Interrupting never undoes a change that already landed, including an Apply queued for the
  next cycle. `change_parts` is atomic, so no half-change can exist.
- **Failover is a swap point, not a switch.** Only the Anthropic implementation is built.
  - The cheapest fallback is the same Claude model on Bedrock's Messages-compatible (Mantle)
    endpoint. It is a new configuration of the same implementation: base URL, model id and key.
  - A different model family would be a second implementation of the same `Model` service.
  - Nothing switches automatically. A silent switch mid-performance would change who the human's
    partner is without telling them.
  - While the model is down the music keeps playing. Only the agent goes quiet.

## Known debt: agent code runs in the page

The dry-run (ADR 0004) evaluates the agent's JavaScript in the page at every Autonomy, including
before a Proposal is reviewed. That code can reach `fetch`, `window` and so the key. The POC accepts
this because the agent's only inputs are the human's Instructions and Source. **This is not the
intended final design.** Before any untrusted input reaches the agent (another agent's output,
shared Performances, autonomous initiative), the dry-run must move into a sandbox (a Worker or a
sandboxed iframe) and the key off the page.

## Considered options

- **A thin local server running the loop, keeping the key server-side.** Rejected for the POC.
  Nobody else runs the app, so there is nobody to keep the key from. The loop blocks inside tool
  calls, so it would also need a WebSocket to the page.
- **A server loop that forwards tool calls to the page over plain HTTP** (the Vercel AI SDK's
  client-tool protocol, or a manual loop that suspends). Rejected for the POC, but it is **the
  route to take if the loop ever has to leave the page**. That move is cheap, because the snapshot
  and `change_parts` are already plain JSON.
- **Several agents later** do not need a server. They would be several loops in the same page
  sharing one Performance and the dry-run mutex.
- **Tool Runner.** Rejected. It is the same client as a manual loop, but it makes "end the Turn on
  `ok: true`" awkward, it doesn't resume `pause_turn`, and it adds a beta dependency.
- **`@effect/ai` / `@effect/ai-anthropic`.** Rejected for the POC. It cannot set per-tool
  `eager_input_streaming` (the ghost preview), and it is 0.x with frequent breaking releases.
  Worth re-checking once it reaches 1.0 or Effect 4 ships.
- **LangChain / LangGraph, Microsoft Agent Framework, Google Genkit / ADK.** Rejected for the POC.
  With one agent and one tool, their prebuilt loops fight this loop's rules, and their
  provider-neutral layers hide the Anthropic features the design relies on. LangGraph is worth
  revisiting if several agents with durable state arrive.
- **A closing reply after the change lands.** Deferred. It costs one extra model call per
  Instruction, and changing `tool_choice` to prevent a second call risks the prompt cache.
- **Queueing or blocking concurrent Instructions.** Deferred. Replace is enough for the POC. The
  product will want something more elaborate.

## Consequences

- **08 (frontend stack):** the UI must host Effect fibers (interrupt on a new Instruction or on
  Stop). The bundler must read `.env.local`.
- **10 (latency budget):** the normal case is one streamed model call per Instruction, plus one per
  refused retry.
- **The build:** test Bedrock Mantle bearer-token auth before relying on it as the fallback. Two
  doc pages contradict each other on it (see
  [research 13](../../.scratch/ai-live-coding-poc/research/13-model-provider-seam.md)).

## Amendment: no memory between Instructions (ticket 11)

The line above once said the pending `tool_result` opens the next Instruction's user message. That
implied one conversation growing across the session, which ADR 0007 had deferred and ticket 10's
cache plan did not assume. Decided while writing the spec:

- **Each Instruction is one fresh request:** the cached fixed prefix (tool, system prompt,
  grounding), then one user message holding the snapshot and the Instruction.
- **Retries inside a Turn** append the `tool_use` and its refusing `tool_result` to that Turn's
  messages only. When the Turn ends, its transcript is discarded.
- The agent learns what came of earlier Instructions only from the Performance in the next
  snapshot (its code, Unapplied edits and error slot). The snapshot already holds everything the
  four acceptance scenarios need.
- **Cost accepted:** follow-ups that refer to an earlier Turn ("no, like before") don't work.
  Giving the agent the session's history stays deferred past the POC.

Rejected: a growing session transcript (each Turn larger and costlier, stale snapshots beside the
fresh one) and a short recap of recent Instructions in the snapshot (the start of the deferred
history-as-context).
