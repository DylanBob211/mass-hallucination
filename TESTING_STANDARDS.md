# Testing standards

How to write tests here. The two rules everything else follows from:

1. **Test behaviour through public interfaces, not implementation details.** The code can change
   entirely; a test breaks only when behaviour changed.
2. **Mock at system boundaries only.** Everything inside the boundary goes in real. When something
   is hard to test without faking one of your own modules, redesign the interface instead.

The coding rules these tests protect are in [`CODING_STANDARDS.md`](./CODING_STANDARDS.md).

## What earns a test its place

A test must be able to fail for a plausible real bug that a performer or a caller would see. If you
can't name the bug, don't write the test.

Worth a test:

- **Domain rules**: how a Source projects into Parts and a Preamble, when a Part has Unapplied
  edits, what an Apply leaves running, when an agent change lands under each Autonomy.
- **Parsers and anything that reads the Source**: `parsePerformance`, Revs, Mini-notation spans.
- **The agent loop's contract**: what a Turn sends the model, how a refusal is retried, how a
  stopped Turn ends.
- **Regressions for a real past bug.** A test added with a fix stays.
- **Guards**: tests of `scripts/` checks such as `check:reference`.

Not worth a test:

- **Tautologies**: a fake returning what it was told, a restated constant or lookup table, a type
  being a type.
- **Implementation details**: call counts, call order, private helpers, internal state shape.
  Anything that breaks on a harmless refactor.
- **Near-duplicates**: the same rule at the same seam with another literal.
- **Glue**: a pass-through or one-line mapping. Test what it delegates to.
- **Someone else's code**: that acorn parses, that CodeMirror inserts text, that Svelte renders.

Prefer one test at the right seam over the same rule re-checked through the core, the façade and
the editor.

## Where a test runs

Three Vitest projects (`vite.config.ts`). Node is the default; the browser is the exception; the real
model is opt-in.

| Kind | File | Runs | Use it for |
|---|---|---|---|
| Node | `*.test.ts` | `pnpm test:node` | The core, the façade, UI state, scripts. Almost everything. |
| Browser | `*.browser.test.ts` | `pnpm test:browser` | What only a real browser can do. |
| Real model | `*.real.test.ts` | `pnpm test:real` only | The real Anthropic API. Billed. |

### Node: the core under `@effect/vitest`

Core tests import `describe`, `expect` and `it` from `@effect/vitest` and write Effectful tests with
`it.effect`, or `it.scoped` when the test builds layers, never `Effect.run*` in the test body. (The
façade and browser tests run Effects by hand because what they test sits at the entry point.)

**The boundaries are Effect services**, and `src/core/fakes.ts` has a fake layer for each:
`makeFakeEditor`, `makeFakeStrudel`, `makeFakeModel`, `makeFakePage`. A test builds the real layers
it is testing (`Agent.layer`, `LiveCodeStore`, …) on top of those fakes. Everything between the
fakes runs for real. A new boundary gets a new fake in `fakes.ts`, next to the others. Never
`vi.mock` a module of this repo.

**Time goes through `TestClock`.** `it.effect` runs on the test clock: move it with
`TestClock.adjust("1 second")`, never a real sleep. `TestClock.adjust(0)` lets forked fibers run.
That is what makes a Turn timeout or a cycle-quantised Apply a fast, deterministic test. If the
code under test reads the real clock, that is a bug in the code (see "No ambient globals in the
core").

**Fakes record what they were asked, so the test asserts outcomes.** `makeFakeEditor` keeps the
Source and every agent write; the test checks the Source that results, not that `write` was called.

### Node: the façade and UI state

The façade test (`src/facade/facade.test.ts`) drives `createFacade` over the same fake layers and
asserts on the view model it publishes, the one thing the UI sees.

UI decisions that live in a plain state class or function (`peekState.svelte.ts`,
`codeView.svelte.ts`) are tested in Node with plain `vitest`, by calling the class and reading its
state. No rendering.

### Browser: only what Node can't reproduce

Write a `*.browser.test.ts` only for:

- **The real bundle**: a dry-run against `@strudel/web` (Web Audio) or hydra-synth (WebGL).
- **The editor's wiring**: which key does what in a real CodeMirror view, focus and selection,
  widgets and decorations on the page.

If the behaviour can be pulled out into a function, do that and test it in Node. One browser test
per behaviour, not one per module. There are no Svelte component tests and no end-to-end suite
(ADR 0006).

How to write one:

- **Act like a performer**: `userEvent.keyboard(...)` into a focused editor, not a dispatched
  transaction standing in for a key.
- **Assert what the performer or the façade sees**: the text on the page, or the command the
  façade receives. The commands object handed to `createEditor` is the boundary here, so `vi.fn()`
  spies on it are fine.
- **No snapshots, no class names, no internal state.**
- **Load the real CSS** (`import "../app.css"`) when the test depends on layout or colour.

### Real model: billed

`*.real.test.ts` calls the real API with the key from `.env.local` or `ANTHROPIC_API_KEY`, and skips
itself with `describe.skipIf` when there is none. It checks the prompt, the model and the loop
together; the dry-run stays faked. It is its own Vitest project, which `pnpm test` and `pnpm check`
leave out, so nothing bills without you asking. Run them on purpose:

```sh
pnpm test:real                                  # all of them
pnpm vitest run src/facade/live/model.real.test.ts  # one file
```

## Writing a test

- **Name the behaviour, in the glossary's words.** `"keeps the other Parts whole while one is
  half-typed"`, not `"handles parse error"`. A `describe` names the unit or situation; an `it` reads
  as a sentence about it.
- **Build inputs as Sources.** A test about a Performance starts from Source text, the way a
  performer would write it, not from a hand-built `Part` object.
- **One behaviour per test.** Several `expect`s are fine when together they state one outcome.
- **Shared setup is a small named function** at the top of the file (`setup`, `mounted`), not a
  `beforeEach` that mutates outer variables.

### Good and bad

```ts
// GOOD: drives the public interface, asserts what a caller observes
it("keeps the other Parts whole while one is half-typed", () => {
  const performance = parsePerformance(`kick: s("bd*4")\nhats: s("hh*8").gain(`);
  expect(performance.parts.map((p) => p.id)).toEqual(["kick", "hats"]);
});
```

```ts
// BAD: mocks an internal module and asserts HOW, not WHAT
vi.mock("./Performance");
it("calls parsePerformance on apply", () => {
  apply(/* … */);
  expect(parsePerformance).toHaveBeenCalledTimes(1);
});
```

Red flags:

- `vi.mock` of anything under `src/`
- Asserting call counts or order of internal calls
- A real `setTimeout` or sleep in a core test
- A test that breaks on a refactor that didn't change behaviour
- A test name that describes how rather than what
- A test that mirrors a one-line function back at itself

## TDD: vertical slices

Write one failing test, make it pass, then write the next. Writing every test first produces tests
that check _imagined_ behaviour and miss the real changes.

```
RED→GREEN: test1→impl1
RED→GREEN: test2→impl2
RED→GREEN: test3→impl3
```

Each test responds to what the previous cycle taught you. Get to green before you refactor, and run
the tests after every refactoring step.

While iterating, run only the file you're working on (`pnpm vitest run path/to/x.test.ts`).
`pnpm check` runs the whole suite before a change is done.
