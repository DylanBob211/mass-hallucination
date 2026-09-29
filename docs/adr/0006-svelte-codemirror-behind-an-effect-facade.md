---
status: accepted (POC only)
---

# Svelte 5 and raw CodeMirror 6, behind a plain façade over the Effect core

_Amended by ticket 08 (2026-09-29): where tests run. Amended by poc-build ticket 01 (2026-09-29):
how the UI reads the view model. See the amendments at the end._

**This decision covers the POC only**, like ADR 0005. The UI is a thin shell over the Effect core.
The stack was chosen to fit what 01 and 07 demand, and the shell is kept replaceable.

## The shape

- **Svelte 5 on plain Vite.** No SvelteKit, because the POC has no server and no routing.
- **Raw CodeMirror 6** is the editor. `@strudel/codemirror` is not used: `StrudelMirror` brings its
  own `repl`, a `localStorage` settings store, document-level listeners and a canvas prepended to
  `<body>` (research 01).
- **The CodeMirror document is the Source** (ADR 0001).
  - The core never holds the text. It reaches it only through an `Editor` service:
    `read`, `write(changes)`, and a `changes` stream.
  - The façade provides that service as a `Layer` over the live `EditorView`.
  - An agent write is one tagged CodeMirror transaction. It is one undo step and carries the cursor
    along (ADR 0003) without extra code.
  - Effect derives everything else from the text: Parts, Revs, Live code, Unapplied edits and the
    Proposal. Effect never owns text or UI state.
- **A plain-TypeScript façade is the only place Effect meets the UI.**
  - It owns the single `ManagedRuntime` and the fiber of the running Turn. `instruct` interrupts
    that fiber before it forks the next one.
  - It exposes plain calls: `instruct`, `stop`, `accept`, `reject` and `setAutonomy`.
  - It publishes one immutable **view model**. The UI receives it into a `$state.raw` and replaces
    it whole on each update. The core reuses the references of unchanged sub-objects, so Svelte
    re-renders only what changed.
  - Components never import Effect.
- **Visuals later are a page layer, not an editor feature.** Strudel draws Hydra on a fixed,
  full-screen canvas with `pointer-events: none` behind the editor. The editor theme must allow a
  transparent background.

## Toolchain

- **pnpm** with `save-exact`, satisfying ADR 0002's lockfile-exact pins. TypeScript is strict.
- **Type-checking:**
  - TypeScript 7 (`@typescript/native`) with **`@effect/tsgo`** checks the code, so Effect
    diagnostics fail the build.
  - TypeScript 6 stays installed only for `svelte-check --tsgo`, which transforms `.svelte` files
    through the JS API, and for typescript-eslint.
  - The fallback, if the two versions ever clash, is TypeScript 6 with `@effect/language-service`.
    Switching is a config change.
- **Lint and format:**
  - ESLint flat config: typescript-eslint type-checked rules and `eslint-plugin-svelte`.
  - Prettier with the Svelte and Tailwind plugins, plus `eslint-config-prettier`.
- **Tests:** Vitest with `@effect/vitest`. Where they run is in the amendment at the end.
- **API key:** read from `.env.local` as `import.meta.env.VITE_ANTHROPIC_API_KEY` (ADR 0005).
- **Styling:**
  - Tailwind v4 via `@tailwindcss/vite`. Its theme tokens are CSS variables.
  - The CodeMirror theme reads those same variables, because Tailwind classes cannot reach the
    editor's internals.
  - Bits UI is the library for headless primitives. A primitive is added only when an interaction
    decision needs it.
- **Effect 3.22, pinned.** Three rules keep the move to v4 mechanical:
  - no `@effect/platform`: the Anthropic SDK brings its own `fetch`, and v4 absorbs this package;
  - no `Runtime<R>` and no `FiberRef`, both removed in v4;
  - Effect only in the core.

  What remains is by-hand renames, such as `Context.Tag` → `Context.Service` and
  `fork` → `forkChild`. v4 has no codemod.

## Considered options

- **React.** Close to Svelte on every demand once 07 removed the AI SDK. It was the tiebreaker's
  pick, because the most generative-UI renderers exist for React (CopilotKit and AG-UI). That
  tiebreaker was judged weak: the agent-to-UI protocols are converging on framework-agnostic JSON
  and web components, and the façade keeps the shell replaceable. Svelte won on less code and
  fine-grained updates for streamed tokens.
- **Angular.** Rejected for two reasons:
  - The Angular CLI has its own builder and no `import.meta.env`, which fights Vite and
    `.env.local`.
  - Its DI system would overlap Effect's `Layer`s and invite services into the UI.
- **No framework.** The Proposal, Stale and Autonomy states cut across several widgets. Keeping
  the DOM in sync by hand would be accidental work.
- **The core owning the text, mirrored into the editor.** Rejected: it keeps two copies in sync,
  and every agent write becomes a whole replace that loses cursor mapping and undo grouping.
- **Effect 4 RC.** No migration later, but RC churn and thin documentation while learning.

## Consequences

- **09:** focus must never leave the editor unless the performer chooses. Bits UI dialogs and
  popovers move or trap focus by default.

## Amendment: the test stack (ticket 08)

- **Node is the default environment.** The Effect core runs under `@effect/vitest` against a fake
  `Editor` service and a fake `Model`. No DOM, no jsdom.
- **Vitest browser mode, with the Playwright provider,** only for tests that touch the real bundle:
  the dry-run against `@strudel/web` and hydra-synth needs Web Audio and WebGL. It is a separate
  Vitest project, so the Node suite never starts a browser.
- **No component tests and no end-to-end suite.** Components never import Effect and only render
  the façade's view model, which is tested in Node. The POC is throwaway.

## Amendment: how the UI reads the view model (poc-build ticket 01)

The shape above says the UI receives the view model "into a `$state.raw`". It doesn't. It reads the
façade's view model directly, through Svelte's `createSubscriber`:

```svelte
const track = $derived(createSubscriber((update) => facade.subscribe(update)));
const viewModel = $derived.by(() => {
  track();
  return facade.viewModel;
});
```

- **What stays the same.** The view model is immutable and replaced whole on each update, and
  unchanged sub-objects keep their references. Svelte never deep-proxies it, so it still
  re-renders only what changed. This was the point of `$state.raw`, and it holds.
- **Why not `$state.raw`.** Copying the façade's value into local state needs two things Svelte
  warns against:
  - Seeding it with `$state.raw(facade.viewModel)` reads a prop once at init. The compiler warns
    `state_referenced_locally`, and `svelte-check --fail-on-warnings` fails the build.
  - Keeping it current needs a `$effect` that assigns state from the subscription. Svelte treats
    that as an escape hatch: the effect runs after render, so the copy lags the façade by a render.
- **Why `createSubscriber`.** It is Svelte's own primitive for an external source. It subscribes
  while something reads the value and unsubscribes when nothing does, so the component holds no
  copy of state that lives in the façade.
- **What the façade must provide.** A synchronous `viewModel` getter, and `subscribe(listener)`
  returning an unsubscribe function. Both are plain TS, so components still never import Effect.
