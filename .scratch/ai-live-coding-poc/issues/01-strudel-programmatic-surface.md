# 01 — Strudel's programmatic surface

Type: research
Status: resolved
Blocked by: —

## Question

What can a host application actually do to a running Strudel session from the outside? This is the load-bearing fact for the whole map — the state model, the tool surface, and apply semantics are all downstream of it.

Establish, against primary sources (Strudel docs and the `strudel` repo source):

- **Packages**: what `@strudel/web`, `@strudel/repl`, `@strudel/codemirror`, and `@strudel/core` each expose, and which is the right embedding substrate for a custom UI (as opposed to shipping Strudel's own REPL).
- **Reading state**: can the host read the current editor buffer? The currently *evaluated* pattern (which may differ from the buffer)? Transport state — playing/stopped, cps/cpm, current cycle position?
- **Writing state**: can the host replace or patch the buffer programmatically, and separately trigger evaluation?
- **Hot-swap**: does re-evaluating swap the pattern without dropping audio or resetting the cycle clock? Is the swap quantised to a cycle boundary, and is that controllable?
- **Granularity**: is there any notion of separately addressable parts/voices/slots (e.g. `$:` / `p()` style multi-pattern), or is a session fundamentally one blob of code?
- **Errors**: when evaluation fails, what does the host get back, and does the previously-playing pattern keep running?
- **Analysis**: is any audio/pattern introspection available (what's currently sounding, queryable pattern events for a time span)?

Record what is supported, what is absent, and what would need a fork. Note API instability where docs and source disagree.

## Deliverable

A markdown summary linked from this ticket, with source links and code snippets for each capability.

## Answer

Full findings: [`../research/01-strudel-programmatic-surface.md`](../research/01-strudel-programmatic-surface.md) — 490 lines, one section per question, source permalinks and code snippets throughout.

**Read against**: source at `main` HEAD (commit `8f81463`, 2026-08-19) on **codeberg.org/uzu/strudel**, cross-checked against the published bundles `@strudel/core@1.2.6`, `@strudel/web@1.3.0`, `@strudel/codemirror@1.3.0`.

Two facts frame everything else:

- **`github.com/tidalcycles/strudel` is archived** (last push 2025-06-19, description `MOVED TO CODEBERG`). Canonical is **codeberg.org/uzu/strudel**. This ticket's own brief pointed at the stale repo.
- **npm is ~7 months behind `main`.** Facts below are marked **[npm]** (true of published packages), **[main]** (unreleased), or **[both]**.

### Substrate: `@strudel/web`

`initStrudel()` resolves to the `repl` object — `{ scheduler, evaluate, start, stop, pause, setCps, setPattern, setCode, toggle, state }` — which is the *entire* control surface `StrudelMirror` itself drives. Embedding `@strudel/codemirror` or `@strudel/repl` buys editor plumbing we don't want and inherits CodeMirror 6, a `localStorage`-backed global settings store, `document`-level `start-repl` / `repl-evaluate` event protocols and a canvas prepended to `<body>` — all of which fight a custom chrome. `@strudel/repl` exports no classes at all, only a `customElements.define` side effect.

**We own the buffer.** `core.repl` has no editor; our editor is the source of truth.

### Reading state — well served, and the buffer/evaluated split is native

`repl.state` gives `{ code, activeCode, isDirty, pattern, started, evalError, pending }` **[both]**. `code` is the buffer, `activeCode` is what was last successfully evaluated — the distinction ticket 03 asks about exists natively. Transport: `scheduler.cps`, `scheduler.started`, `scheduler.now()` (fractional **cycles**). Everything richer is closure-private.

### Writing state — set and evaluate are separately addressable

`repl.setCode(text)` sets without evaluating; `repl.evaluate(text)` evaluates without going through any editor. Both first-class **[both]**.

### Hot-swap is free; quantisation is ours to build

`setPattern` is literally `this.pattern = pat`. **No audio dropout, no audio-graph re-init, and the cycle clock never resets** (only `stop()` zeroes it). But: **the swap is not quantised and there is no knob for it** — a new pattern takes effect at the next 100 ms tick, mid-cycle, and if its phase differs you hear the jump. `repl()` doesn't even forward `interval`/`latency` to `Cyclist`.

Quantised-apply is ~10 lines on `scheduler.now()` and **needs no fork** — but it is a feature *we* own, and the 0.1 s tick + 0.1 s latency is the floor on how tight it can be. Direct input to ticket 04.

### Granularity — the risky area

**[npm] A session is one blob.** `evaluate()` always `hush()`es the `$:` registry first, so every evaluation is a full rebuild from one string. `pPatterns` is closure-private: **no read API, no per-slot replace or remove.** The only per-part surface is textual — edit the `bass:` line in our own buffer and re-evaluate the whole document.

**[main] `repl.evaluateBlock(code, autostart, { range })` gives real per-part semantics** — skips `hush()`, keys a label→block map, garbage-collects `pPatterns` against it. But it is unreleased, carries no tests, is self-described in source as *"the hackiest bit"*, **throws on anonymous `$:`** (labels must be unique and named), and **resets `all()` transforms on every call**.

Either way it is **still one blob at the audio layer**: a single `stack(...)` reaches the scheduler. No per-slot bus, scheduler or gain.

Because full re-evaluation is audibly seamless, **the host keeping a structured model of named parts and re-serialising the whole document is a legitimate design** — and probably the right first move. This is ticket 03's decision to make; the cost of the alternative is now known and is ticketed separately as *Which Strudel build the POC targets* (12).

### Slot attribution goes through source offsets, not IDs

The per-slot `id` control is set but has **no consumer anywhere in the repo** — it does not reach the `Hap`. What does reach the hap is `hap.context.locations` (`{start, end}` char offsets), which is what the editor highlighter consumes. So "which part made this sound" is answerable, but only if **we** own the char-range↔part mapping — which pushes toward generating the document from a structured model anyway.

### Errors — a wrapper is needed on day one

- **Evaluation errors are swallowed, not thrown** **[both]**: `repl.evaluate` catches, resolves `undefined`, and calls `onEvalError`. The previously-playing pattern **keeps running** — good.
- **Playback/scheduling errors are invisible to `repl.state`.** `state.schedulerError` is **dead code**: declared, folded into `state.error`, cleared on eval, but *never assigned anywhere*. `Cyclist` accepts `onError` but `repl()` never passes it. Errors arrive only as an untyped `strudel.log` DOM event.

Plan for: check the return value, wire `onEvalError`, **and** listen on `document` for `strudel.log`. Assigning `state.schedulerError` properly is a one-line patch we may choose to carry.

### Analysis — better than expected

Querying any Pattern for its events over an arbitrary span is fully supported (`queryArc`) **[both]**. "What is currently sounding" is reachable three ways. FFT/scope analysis exists but is **opt-in per pattern**. The clean seam for tapping every event is the undocumented `editPattern: (pat) => pat.onTrigger(fn, false)` — `dominant` **must** be `false` or audio is disabled.

### Defects and instability found in source, not docs

1. `state.schedulerError` never assigned (above).
2. **`process.env.NODE_ENV` survives into published `@strudel/core@1.2.6/dist/index.mjs`**, inside `errorLogger` — loading it straight from a CDN in a browser turns any recoverable query error into a `ReferenceError` thrown from a catch block. Stripped in the `web`/`codemirror` bundles, so **use `@strudel/web`, not bare `core`, from a CDN.**
3. `evaluate()`'s third `shouldHush` param exists in npm 1.2.6 and was silently *removed* on `main`.
4. `editPattern` is called with one arg but the official docs site destructures `(pat, id)`.
5. Scheduling errors log with `type === undefined` while eval errors use `type: 'error'` — `strudel.log` listeners cannot filter by type.
6. **Three distinct things are called `hush`** with different semantics — a `Pattern` combinator, `repl()`'s scope-injected registry-clearer (does *not* stop the scheduler), and `@strudel/web`'s export (does stop it). Worth knowing before naming anything in our own API.

Pin exact versions; if we ever take `evaluateBlock`, pin a commit SHA.

### Licensing

Strudel is **AGPL-3.0-or-later**, and the project's own docs assert it reaches derivative UIs and even clean-room clones informed by reading the source. A product-level decision, not an engineering one — ruled **out of scope** for this map (see the map's Out of scope section), since the POC is a throwaway internal judgment tool and shipping is the later effort.

### Not confirmed

- Whether a part can be **removed** via `evaluateBlock` without a full re-eval — the code path was traced, but `evalBlock` guards `if (block)` so an emptied block is never submitted. Needs a browser experiment.
- Audible quality of rapid partial updates (code read, nothing run).
- Whether a newer npm release is imminent; whether `Drawer` works headless; multi-instance behaviour; whether `state.controls.id` is consumed out-of-tree.

