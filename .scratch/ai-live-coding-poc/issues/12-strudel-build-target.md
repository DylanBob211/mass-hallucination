# 12 — Which Strudel build the POC targets

Type: grilling
Status: resolved
Blocked by: 03

## Question

Surfaced by ticket 01. Published Strudel and Strudel's `main` branch differ by ~7 months, and the difference is exactly the capability the state model may want: **per-part evaluation**.

- **Published npm** (`@strudel/web@1.3.0`, `@strudel/core@1.2.6`) — a session is one blob. Every `evaluate()` rebuilds the whole `$:` registry; there is no read, replace or remove API for a single part. Stable, versioned, boring.
- **Pinned `main` (or vendored)** — `repl.evaluateBlock()` gives genuine per-part semantics. Unreleased, untested, self-described in source as *"the hackiest bit"*, rejects anonymous `$:`, and resets `all()` transforms on every call. Taking it means a git/SHA-pinned dependency and accepting churn.
- **A third option**: stay on npm and have the host keep a structured model of named parts, re-serialising and re-evaluating the whole document on every change. Ticket 01 established that full re-evaluation is **audibly seamless** — no dropout, no clock reset — so this may cost nothing musically.

Decide:

- Which build the POC targets, and whether per-part evaluation is needed *at all* given the model chosen in ticket 03.
- If the answer is the third option: what re-evaluating the whole document costs when only one part changed — latency (ties to 10) and any audible artefact.
- What we do if a part must be **removed**. Ticket 01 could not confirm `evaluateBlock` can remove a part without a full re-eval; whole-document re-serialisation has no such doubt.
- Whether we are willing to carry small patches to Strudel at all (ticket 01 found `state.schedulerError` is dead code — a one-line fix). Carrying one patch and pinning `main` are different sizes of commitment.
- The exact pins, so the spec can state them.

This is a risk-appetite question as much as a technical one. Cheapest thing that clears the three acceptance scenarios wins.

## Deliverable

An ADR recording the chosen build, the exact version/SHA pins, and the per-part strategy that follows from it.

## Answer

**Published npm — `@strudel/web@1.3.0`, bundled with lockfile-exact pins. No git dep, no vendoring, no patches.** Recorded as [ADR 0002](../../../docs/adr/0002-scoped-composition-on-published-strudel.md).

The ticket framed this as a risk-appetite trade-off between stability and per-part evaluation. It turned out not to be a trade-off: **every argument for `main` dissolved rather than being outweighed.**

### Per-part evaluation is not needed — per-part *addressing* is, and ADR 0001 already gave it

Addressing "the hats" is parsing, which the host owns on any build. The separate question — what makes a Part change audible — looked like it needed `evaluateBlock`, because the naive third option (re-serialise and re-evaluate the whole Source) is **hostage to in-progress typing**: an agent edit to `hats:` fails on the human's half-typed `d2:` and lands nothing.

### The fix is composition, not a different build

03 had already supplied the ingredient: every Part has **Live code** distinct from its current text, and divergence is a normal state. So:

> An **Apply** never evaluates the Source. It evaluates a transient document composed from the **Live code** of every Part and the Preamble, with only the Parts **in Scope** substituted by their current text.

Scope = every Part ⟹ the composition is identical to the Source, so "evaluate everything" is the widest Scope, not a second mechanism. One Apply path, parameterised by Scope, available to both the human's gesture and the agent's tool. New glossary entries **Apply** and **Scope** in [`CONTEXT.md`](../../../CONTEXT.md); 05 should express its tools in these terms.

### What that does to `evaluateBlock`

It removes the need for it, and with it two defects we'd have had to work around: anonymous `$:` **rejected outright** in block mode, and `allTransforms = []` reset on every call (so an `all(...)` in another block silently evaporates). Under composition, `all(...)` is ordinary text in the composed document. **Removal** — which 01 could not confirm `evaluateBlock` handles without a full re-eval — becomes doubt-free: `evaluate()` hushes and rebuilds from one string, so a Part absent from the composition is simply not there.

The ADR records that `evaluateBlock` was rejected **because composition made it unnecessary**, not because it was unpublished, so it isn't re-opened when it ships.

### Confirmed: npm has not moved

`@strudel/web`/`codemirror`/`webaudio` still **1.3.0** (2026-01-18), `core`/`transpiler`/`mini` still **1.2.6** (2026-01-17). The gap to `main` is now ~8 months. 01's findings stand unamended.

### New facts found while resolving this (published `@strudel/web@1.3.0` bundle)

The Preamble re-runs on every Apply — the one real cost of not using `evaluateBlock`. Measured against the bundle:

- **Audio buffers are memoised.** `loadBuffer` keys an in-flight promise map by URL (`if (!ua[e]) { ua[e] = fetch(e).then(...).then(a => { ...; io[e] = c }) }`). Each sample file is fetched and `decodeAudioData`'d **once per page, ever**. Re-running the Preamble never re-downloads or re-decodes audio.
- **The sample *map* is not memoised.** `samples('github:…')` resolves through a helper doing an unmemoised `await fetch(url).then(r => r.json())` on every call — one awaited network round-trip per `samples()` call per Apply, HTTP-cache permitting. **Hands a cost to 10.**
- **Registrations survive `hush()`.** `hush()` clears `pPatterns`, `anonymousIndex`, `allTransform`, `eachTransform`; it does **not** touch the module-global sound registry, and `cps` lives on the scheduler. So `samples()`/`setcps` only need to run once — but `all(...)` does **not** survive and must be re-included every time.

That last point kills the tempting optimisation of omitting an out-of-scope Preamble: it would silently drop `all(...)`. **Decision: always include the Preamble.** The known optimisation, if 10's budget demands it, is for the host to memoise `samples()` in the evaluation scope.

### Pins for the spec

`@strudel/web@1.3.0` as the **sole direct dependency**. It already exact-pins its own tree, no carets: `@strudel/core@1.2.6`, `@strudel/mini@1.2.6`, `@strudel/tonal@1.2.6`, `@strudel/transpiler@1.2.6`, `@strudel/webaudio@1.3.0`. Licence `AGPL-3.0-or-later` (already on the map's out-of-scope list as a later-effort decision).

**Bundled, not a CDN import map.** `process.env.NODE_ENV` survives into published `@strudel/core@1.2.6/dist/index.mjs`, where it makes `errorLogger` throw `ReferenceError` *inside a catch block*, turning a recoverable query error into an unhandled one (01). A bundler `define` disarms it by configuration; an import map relies on nobody ever deep-importing `@strudel/core`. **Which package manager and bundler is 08's call, not this ticket's** — 12 fixes only "bundled, lockfile-exact".

### Patch appetite: zero

Published npm as a black box. The one tempting patch — `state.schedulerError` is declared, folded into `state.error`, never assigned — is avoidable: playback errors reach us as a `strudel.log` DOM event, matched with `/^\[(cyclist|query|getTrigger)\] error: /` because they're logged untyped. A string match we own beats a fork we own. Revisit only if something blocks an acceptance scenario outright.

### Also settled here

- **Anonymous `$:` is unaddressable, not invalid.** It is Source the agent reads verbatim, but yields no Part. The host invents no names (Source-is-truth stays honest); to vary an anonymous block the agent does the human thing and rewrites it with a label, as a plain text edit. This also removes `main`'s anonymous-label rejection as a factor.
- **A Part with no Live code contributes nothing to a composition.** A never-evaluated Part is silent, so omitting it is consistent; erroring would make the agent hostage to the human's unapplied work. **Held provisionally** — it is a question of how the thing *feels*, to be judged in 04's prototype.

### Hands to 06

The runtime filter is computed against **this** tree: the callable union (named exports ∪ `Pattern.prototype`) of `@strudel/web@1.3.0`.
