# 07 — Agent runtime & trust boundary

Type: grilling
Status: resolved
Blocked by: 02, 05, 13

## Question

Decide where the agent loop runs and how its tool calls reach browser-resident state.

- **Browser-direct** (key in localStorage, calls straight to the API) vs **thin local server** (key server-side, browser talks to it). Given the POC is single-player and local, is a server justified at all — or is it the first piece of speculative infrastructure?
- **A third shape, from 02:** a server-side loop whose tools carry *no server implementation* and are forwarded to the browser to execute, with each step a fresh HTTP request (the Vercel AI SDK's client-tool protocol; also reachable by hand with a manual loop that suspends across the boundary). This keeps the key server-side **without** requiring a WebSocket. Weigh it as a real option, not a footnote.
- Which loop driver, from ticket 02's findings. Note that Tool Runner and the manual loop are the *same client* — the choice between them is a beta dependency and who writes the `while`, not an architecture. The Agent SDK is Node-only and out-of-process, so choosing it forecloses browser-direct entirely.
- If server-side: what carries tool calls to the browser and results back — and what that costs in latency, given ticket 10's budget.
- Where the **tool implementations** physically live. Tools from ticket 05 act on state that lives in the page; that is the whole difficulty of this decision.
- What this forecloses for the long-term vision. Multiple agents and autonomous initiative are out of scope, but a runtime that structurally cannot host a second agent loop is a dead end worth knowing about before committing.

## Deliverable

An ADR recording the runtime shape and the dead ends it was chosen to avoid.

## Answer

**For the POC: the loop runs in the browser, in Effect, behind our own `Model` service.** This covers the POC only; the tools and libraries are to be reconsidered for the product. Recorded in [ADR 0005](../../../docs/adr/0005-poc-agent-loop-runs-in-the-browser.md). New terms **Instruction** and **Turn** in [`CONTEXT.md`](../../../CONTEXT.md). The facts came from [02](02-anthropic-agent-loop-options.md) and [13](13-model-provider-seam.md).

- **Where the loop runs: browser-direct.** `change_parts` acts directly on the live Performance, so there is no transport.
  - The rejected local server (with WebSocket) and the server loop with client-forwarded tools are both recorded in the ADR. The latter is the route if the loop ever leaves the page.
  - Several agents later means several loops in one page.
- **The key: exposed but capped.** A dedicated workspace key with a spending limit, read from `.env.local`, localhost only, **never deployed** (the human's standing commitment).
- **The loop driver: hand-written in Effect.** It sits over a `Model` service (a `Layer`) whose interface uses our terms. Its one implementation wraps `@anthropic-ai/sdk`.
  - `@effect/ai` was rejected: it has no per-tool `eager_input_streaming`, and it is 0.x.
  - Tool Runner was rejected: it makes ending on `ok: true` awkward, and it depends on a beta API.
  - Agent frameworks were rejected: LangChain, MS Agent Framework, Genkit / ADK.
- **Failover: a swap point, not a switch.**
  - Bedrock Mantle is a new configuration of the same implementation.
  - Another model family would be a second implementation.
  - Nothing switches automatically.
- **A Turn ends on the first `ok: true`.** The explanation is the text written before the tool call. The `tool_result` is carried into the next Instruction. A closing reply is deferred.
- **A new Instruction replaces the running Turn** by interrupting its fiber, and there is a Stop button. Nothing that already landed is undone. Queueing or anything more elaborate is deferred.
- **Trust boundary:** agent code runs in the page at every Autonomy, even before a Proposal is reviewed. Accepted as **known debt, not the final design**. The dry-run must be sandboxed and the key moved off the page before any untrusted input appears.
- **Hand-offs:**
  - To 08: the UI hosts Effect fibers, and the bundler reads `.env.local`.
  - To 10: one streamed model call per Instruction, plus refused retries.
  - To the build: test Bedrock Mantle auth first.
