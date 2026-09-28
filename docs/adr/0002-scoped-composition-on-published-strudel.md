# Apply by scoped composition; target published Strudel

_Amended by [ADR 0003](0003-agent-changes-land-by-autonomy-never-on-unapplied-text.md): a Part missing from the Source keeps its Live code until an Apply of every Part, and the "no Live code contributes nothing" rule below is now locked._

An **Apply** never evaluates the Source. It evaluates a transient document composed from the
**Live code** of every Part and the Preamble, with only the Parts **in scope** substituted by
their current text. Scope = every Part makes the composition identical to the Source, so
"evaluate everything" is the widest scope rather than a second mechanism; both the human's
gesture and the agent's tool go through the same one.

This exists to stop an Apply being hostage to in-progress typing. Re-evaluating the raw Source
means an agent's edit to `hats:` fails on a half-typed `d2:` elsewhere and lands nothing. Under
composition the half-typed Part contributes the version already sounding, so the Apply evaluates
cleanly and nothing the human hears changes.

Because composition needs no per-Part evaluation API, the POC targets **published npm**:
`@strudel/web@1.3.0` as the sole direct dependency, which already exact-pins its own tree
(`@strudel/core`, `@strudel/mini`, `@strudel/tonal`, `@strudel/transpiler` at `1.2.6`,
`@strudel/webaudio` at `1.3.0`, no carets). Bundled with lockfile-exact pins — **not** a CDN
import map, because `process.env.NODE_ENV` survives into published `@strudel/core@1.2.6`, where
it makes `errorLogger` throw `ReferenceError` inside a catch block and turns a recoverable query
error into an unhandled one. A bundler `define` disarms that by configuration rather than by
discipline. No git dependency, no vendoring, no carried patches.

## Considered options

- **Pin `main` (or vendor) for `repl.evaluateBlock()`.** Rejected because composition made it
  *unnecessary*, not because it was unavailable — record this so it isn't re-opened when it
  ships. It also carries real defects we would have had to work around: anonymous `$:` is
  rejected outright, and `allTransforms` is reset on every call, so an `all(...)` declared in
  another block silently evaporates. Under composition `all(...)` is ordinary text in the
  composed document and behaves normally.
- **Re-evaluate the raw current Source.** The naive form of the same idea. Rejected: it makes
  every Apply hostage to whatever the human is mid-way through typing.
- **Omit the Preamble from an Apply that doesn't scope it,** leaning on sound registrations and
  `cps` surviving `hush()`. Rejected: `hush()` *does* clear `allTransform`, so an out-of-scope
  `all(x => x.room(.5))` would vanish on the first scoped Apply. A correctness hole traded for a
  latency win not yet shown to be needed.

## Consequences

- **The Preamble re-runs on every Apply.** Audio is unaffected — `loadBuffer` memoises an
  in-flight promise per URL, so each sample file is fetched and decoded once per page, ever. But
  `samples('github:…')` re-fetches its `strudel.json` sample map unmemoised on every call, one
  awaited network round-trip per call per Apply. Accepted for now; the known optimisation, if
  ticket 10's latency budget demands it, is for the host to memoise `samples()` in the
  evaluation scope.
- **Removing a Part is free and doubt-free.** `evaluate()` hushes and rebuilds from one string,
  so a Part absent from the composed document is simply not there — no need for the per-block
  removal semantics research could not confirm.
- **A Part with no Live code contributes nothing.** A never-evaluated Part is silent, so omitting
  it from a composition is consistent; the alternative, erroring, would make the agent hostage to
  the human's unapplied work — the very failure this ADR exists to prevent. Held provisionally:
  it is a question of how the thing *feels*, and ticket 04 is where that gets judged in a
  prototype.
- The composed document is derived and thrown away after evaluation. It is never written back;
  the Source stays exactly what the human typed, per ADR 0001.
