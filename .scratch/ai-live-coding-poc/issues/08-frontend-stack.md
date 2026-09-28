# 08 — Frontend stack

Type: grilling
Status: open
Blocked by: 01, 07

## Question

Choose the frontend stack, driven by what tickets 01 and 07 actually demand rather than by preference.

- What does the Strudel embedding substrate (01) constrain? Strudel's own editor is CodeMirror-based and parts of its REPL ship as web components — what integrates cleanly, and what fights the framework?
- What does the runtime decision (07) demand — streaming into the UI, cancellation, rendering in-flight tool calls?
- Weigh Svelte vs React vs no framework. React has the densest ecosystem for agent-UI work (AI SDK, assistant-ui); Svelte is lighter and the repo already has its MCP server configured; no framework is defensible for a POC this small and avoids a framework-shaped commitment early.
- Consider the long-term UI ambitions (generative UI, agent-to-UI protocols) as a **tiebreaker only** — not as a reason to add anything now.

## Carried in from 07

- The runtime core (agent loop, `change_parts` pipeline, dry-run) is **Effect**. The UI must start a Turn as a fiber and interrupt it when a new Instruction arrives or Stop is pressed. It must also render a `Stream` of text and partial `change_parts` input. Keep Effect out of the components themselves (map Notes).
- The API key comes from `.env.local`, so the bundler must expose env vars to the client (Vite-style). The app is localhost only and never deployed.
- The Vercel AI SDK / `useChat` is not in play: 07 rejected the server loop. So "React for the AI SDK" is no longer an argument.

## Deliverable

An ADR recording the choice and the tiebreaker used.
