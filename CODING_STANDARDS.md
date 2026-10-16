# Coding standards

The rules a human or an agent holds in their head while writing and reviewing code here. Read them
while writing, not only while reviewing. Each rule says what enforces it, if anything does. The
reasoning behind the larger ones lives in the ADR it links. How to write tests is in
[`TESTING_STANDARDS.md`](./TESTING_STANDARDS.md).

`pnpm check` runs every guard named below.

## Where Effect lives

### Effect stays in the core and the façade

`src/core/` is Effect all the way down. `src/facade/` is the one place Effect meets the UI: it owns
the single `ManagedRuntime` and hands the UI plain calls and an immutable view model. Svelte
components and `src/ui/` never import Effect. A UI that needs something from the core asks the
façade for a plain call or a new field on the view model.

Enforced by ESLint (`no-restricted-imports` outside `src/core/**` and `src/facade/**`). Detail:
[ADR 0006](./docs/adr/0006-svelte-codemirror-behind-an-effect-facade.md).

### Effects are run, never dropped

An Effect is a description of work. One that is neither yielded nor returned is silently skipped.

- **Yield or return every Effect**: `yield* eff`, never a bare `eff;`.
- **`return yield* eff`, never `return eff`** inside `Effect.gen`.
- **Never `Effect.run*` inside an Effect.** It starts a detached runtime that interrupting the Turn
  will not reach. Run Effects only at the façade, the entry point.
- **Provide layers once, at the entry point.** A test provides its own.

Enforced by `@effect/tsgo` in `pnpm typecheck` (`runEffectInsideEffect`, `returnEffectInGen`,
`nestedEffectGenYield`, `effectInVoidSuccess`, `strictEffectProvide`; see `tsconfig.json`).

### Failures are values, and they are typed

Inside Effect, a failure is a value in `E`, not a thrown exception.

- **`return yield*` a failure**: `return yield* new SourceMoved()`.
- **No `try/catch` inside a generator.** Use `Effect.try` / `Effect.tryPromise`.
- **Every error in `E` is tagged** (`Data.TaggedError`), never a subclass of `Error` and never
  `unknown`. The compiler then shows a caller which failures it must handle.
- **Never swallow a failure silently.** Catch the tag you expect, or say in a comment why dropping
  it is right.
- **Cancelling goes through `Effect.abortSignal`**, never a hand-made `AbortController`, so
  interrupting the Turn fiber cancels the model's stream.

Enforced by `@effect/tsgo` (`tryCatchInEffectGen`, `anyUnknownInErrorContext`,
`unsafeEffectTypeAssertion`, `effectInFailure`, `abortControllerInEffect`, and in the core
`extendsNativeError`).

### No ambient globals in the core

Time, timers, randomness, logging, `fetch` and environment variables come from Effect services
(`Clock`, `Schedule`, `Random`, …), never from `Date.now()`, `setTimeout`, `Math.random()` or
`process.env`. That is what lets the Turn timeout and the quantised agent Apply run under
`TestClock` instead of a real clock. In the core, no `new Promise` and no `async` functions either.

Read configuration at the edge (the façade's live layers), so a missing key stops the app before
any work starts and the error names the variable.

Enforced by `@effect/tsgo`: the `…InEffect` rules everywhere, and the `global…`, `processEnv`,
`newPromise` and `asyncFunction` rules in `src/core/` outside tests.

## Errors and promises outside Effect

### Throw Errors, not values

Outside Effect (the façade's live adapters, the UI, scripts), throw an `Error` or a subclass. A thrown
string or plain object has no stack and fails every `instanceof Error` check downstream.

Enforced by ESLint (`@typescript-eslint/only-throw-error`, in `strictTypeChecked`).

### Every promise is awaited, handled or marked void

A promise nobody awaits loses its rejection, and the work it started may still be running after the
caller has moved on. Await it, or `.catch` it where it is made. When fire-and-forget really is the
intent, write `void promise` with a comment saying why nothing waits on it. Don't hand an async
function to a slot that expects a `void` callback (an event listener, a CodeMirror command).

Enforced by ESLint (`@typescript-eslint/no-floating-promises`, `no-misused-promises`).

## Control flow

### A switch over a union names every member

A `switch` on a union lists every member as its own `case`, even the ones that share a branch. A
`default` that absorbs the leftover members also absorbs the member someone adds next month, which
then takes the fallback branch without anyone deciding it should: a new `TurnEvent` would go
unrecorded in the timing log, a new `ModelEvent` unhandled by the Agent. Without a `default`,
adding a member breaks the lint until every switch says what to do with it.

Enforced by ESLint (`@typescript-eslint/switch-exhaustiveness-check`, with a `default` not counted
as exhaustive for unions).

## Types

### Every `any` is a leak

An `any` switches the type checker off for every value that flows through it. Write the type you
mean: a known shape gets a named type; an unknown one gets `unknown` and is narrowed; one that
varies by caller gets a generic **constrained** to the real thing.

A third-party library that is untyped or typed `any` is typed once, at the edge: `src/types/*.d.ts`
declares what this repo uses of `@strudel/web` and `hydra-synth`, and nothing past that edge sees
`any`. Silencing a lint rule takes an `eslint-disable-next-line` with the reason beside it.

Enforced by ESLint (`strictTypeChecked`'s `no-unsafe-*` and `no-explicit-any`) and a strict
`tsconfig.json` (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).

### Optional parameters are suspect

An optional parameter is a bug by omission waiting to happen: every caller that forgets it gets the
default silently. Prefer a required parameter, and prefer correctness over keeping a call site
unchanged.

## The domain

### The Source is the only copy of the text

The CodeMirror document is the Source. The core never holds its own copy: it reads and writes
through the `Editor` service and derives Parts, Revs and Unapplied edits from the text. The one
thing it stores is each Part's Live code, which the Source can't say. An agent write names the
Source it was computed against (`write(onto, changes)`) and fails as `SourceMoved` if the human has
typed since.

Detail: [ADR 0001](./docs/adr/0001-source-is-truth-parts-are-a-projection.md),
[ADR 0006](./docs/adr/0006-svelte-codemirror-behind-an-effect-facade.md).

### Use the glossary's words

A name in code, a test title or a comment uses the term [`CONTEXT.md`](./CONTEXT.md) defines for the
concept, never a synonym it lists under _Avoid_: a `Part`, not a slot or track; `Unapplied edits`,
not dirty. A concept the glossary lacks is a gap to fill there first, not a word to invent in code.

### Dependencies are pinned exactly

Every dependency is pinned to an exact version (`.npmrc` `save-exact`), and `pnpm-lock.yaml` is the
truth. Moving `@strudel/web` or `hydra-synth` changes what the agent's prompt reference describes,
so it is a deliberate change: rebuild the reference with `pnpm build:reference`.

Enforced by `pnpm check:reference`, which fails when `src/reference/` names versions other than the
lockfile's. Detail: [ADR 0002](./docs/adr/0002-scoped-composition-on-published-strudel.md).

## Interface design

### Deep modules

Prefer deep modules: a small interface over a deep implementation. A few calls with simple
parameters hiding complex logic behind them, like the façade's `instruct`, `stop` and `accept`.

Avoid shallow modules, whose many methods pass straight through to a thin implementation. When
designing, ask: can I reduce the number of calls? Simplify the parameters? Hide more inside?

### Design for testability

1. **Accept dependencies, don't create them.** In the core, a dependency is an Effect service
   (`Editor`, `Strudel`, `Model`, `Page`) that a test replaces with a fake layer.
2. **Return results, don't produce side effects.** A function that returns a value is easier to
   test than one that mutates state.
3. **Small surface area.** Fewer calls need fewer tests; fewer parameters need simpler setup.

### UI decisions live outside components

A component renders the view model and turns DOM events into façade calls. A decision the UI makes
on its own (when the peek opens, which code view comes next) lives in a plain state class or
function (`peekState.svelte.ts`, `codeView.svelte.ts`) that a Node test drives without rendering.
