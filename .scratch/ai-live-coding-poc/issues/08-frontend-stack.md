# 08 — Frontend stack

Type: grilling
Status: resolved
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

## Answer

**Svelte 5 and raw CodeMirror 6 on Vite, behind a plain façade that is the only place Effect meets the UI.** Recorded in [ADR 0006](../../../docs/adr/0006-svelte-codemirror-behind-an-effect-facade.md).

- **Framework: Svelte 5, with no SvelteKit.**
  - Angular was rejected: its own builder fights Vite and `.env.local`, and its DI duplicates Effect's Layers.
  - React was close. The generative-UI tiebreaker leans React, but it was judged weak because the protocols are converging on framework-agnostic formats.
  - The Svelte MCP was explicitly *not* counted in Svelte's favour.
- **Editor: raw CM6, without `StrudelMirror`.**
  - **The CM document is the Source.** The core reaches it only through an `Editor` service (`read`, `write`, `changes`).
  - An agent write is one tagged transaction, so the undo step and cursor mapping come free.
  - Hydra later is a fixed canvas behind a transparent editor, which is Strudel's own approach, so the choice forecloses nothing.
- **Façade.** It owns the `ManagedRuntime` and the Turn fiber, and exposes plain calls plus one immutable view model, received into a `$state.raw` that is replaced whole. Components never import Effect.
- **Effect 3.22, pinned**, under three migration rules: no `@effect/platform`, no `Runtime<R>` or `FiberRef`, and Effect only in the core.
- **Toolchain:**
  - pnpm with `save-exact`.
  - TS 7 with `@effect/tsgo` checks the code. TS 6 stays only for `svelte-check --tsgo` and typescript-eslint.
  - ESLint (flat config) and Prettier, plus Vitest with `@effect/vitest`.
  - Tailwind v4, with its tokens as CSS variables that the CM theme reads.
  - Bits UI for primitives, added only when needed.
- **Handed to 09:** focus must not leave the editor unless the performer chooses.

### Amendment: the test stack (2026-09-29)

The answer named Vitest but not where tests run. Two environments, chosen by what the code under test needs:

- **Node, the default.** The Effect core (agent loop, `change_parts` pipeline, Part parsing, Revs) runs under `@effect/vitest` against a fake `Editor` service and a fake `Model`. No DOM is needed.
- **Vitest browser mode with the Playwright provider**, only for tests that touch the real bundle: the dry-run against `@strudel/web` and hydra-synth, which need Web Audio and WebGL that Node and jsdom lack. Kept as a separate Vitest project, so the fast suite never starts a browser.
- **No component tests and no end-to-end suite.** The UI is a thin shell over the façade, and the POC is throwaway. The façade's view model is tested in Node instead.

Recorded as an amendment to [ADR 0006](../../../docs/adr/0006-svelte-codemirror-behind-an-effect-facade.md).
