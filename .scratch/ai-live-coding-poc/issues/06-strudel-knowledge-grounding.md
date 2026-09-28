# 06 — Strudel knowledge grounding

Type: research
Status: resolved
Blocked by: 01

## Question

The *get me unstuck* scenario ("make this more like dub techno") only works if the agent actually commands Strudel's vocabulary. This ticket establishes whether that is already true or must be engineered.

Investigate:

- **Baseline**: how well does the model write idiomatic, *evaluating* Strudel from its own knowledge? Strudel is a comparatively small and fast-moving library — assume nothing. Test against real function coverage, not vibes.
- **Failure modes**: does it hallucinate TidalCycles-only syntax, outdated Strudel APIs, or plausible-but-nonexistent functions?
- **Remedies, cheapest first**: a static cheatsheet in the system prompt; the Strudel function reference pasted wholesale (how many tokens?); a docs-lookup tool the agent calls; retrieval over the docs.
- **Verification loop**: is the honest answer that the agent should *evaluate and read the error*, rather than be pre-loaded with knowledge? If so, that changes ticket 05's tool surface.

Bias hard toward the cheapest remedy that clears the scenario. Retrieval infrastructure for a POC is exactly the speculative infrastructure the map forbids.

## Deliverable

A markdown summary linked from this ticket, with a recommendation and the evidence behind it.

## Answer

**Full findings: [research/06-strudel-knowledge-grounding.md](../research/06-strudel-knowledge-grounding.md)** (commit `af88c71`, branch `research/06-strudel-knowledge-grounding`).

**Recommendation: a slimmed, runtime-filtered reference in the system prompt.** A generated signature index with one-line descriptions, filtered to what the *shipped bundle* can actually call — 514 entries, 40 KB, **~10,000 tokens** — plus `learn/strudel-vs-tidal.mdx` verbatim (~1,140) and a short do-not-use list ≈ **11,200 tokens**. Static, and fully prompt-cacheable (which 02 established is the cost lever).

Rejected, with reasons:
- **Hand-written cheatsheet** — bounded by the human's own vocabulary, which is the exact thing the *get me unstuck* scenario must exceed.
- **Docs-lookup tool** — the model is *confident*, not uncertain, so it never reaches for one; and per 02, adding a tool invalidates the prompt cache.
- **Retrieval** — the speculative infrastructure the map forbids.
- **The docs verbatim** — ~220,000 tokens. Impossible.

**Baseline: the model's Strudel is good; the gap is narrow and specific.** Ten `$:` statements written from model knowledge before consulting any reference, then checked against real coverage and *executed* against the published bundle (transpiler + `queryArc(0,4)`, audio stubbed): **61 distinct symbols, 59 callable (96.7%)**; **8/10 statements evaluated and queried clean**. The two failures are the two symbol misses:

- `sidechain` — nonexistent. The real API is `duckorbit`/`duck` + `duckattack`/`duckdepth`, whose own docstring says *"to create a 'sidechain' like effect"*. Get-me-unstuck failing in miniature: right musical idea, wrong library name.
- `whenmod` — TidalCycles-only (zero hits in `packages/`).

No Haskell-isms (`d1 $`, `#`, `$`) appeared. **Tidal carry-over is function-level, not syntax-level.**

**Two silent semantic failures no error loop can catch:** `size`/`roomsize` and `legato`/`clip` are registered synonyms, so a chain can set the same control twice and still evaluate clean.

**Machine-readable metadata exists, and it is what makes this remedy cheap.** `doc.json` is JSDoc-derived, built by the repo's own `npm run jsdoc-json`, and consumed by *both* the docs site (`JsDoc.jsx`) and the editor autocomplete (`codemirror/autocomplete.mjs`). It is **not committed and not published** (`strudel.cc/doc.json` → 404), so the POC generates it. Generated from `main@8f81463`: 880,961 chars, 603 entries, 545 unique names. Token ladder (chars÷4): verbatim ~220,000 · all examples ~36,900 · no examples ~27,700 · **signatures+descriptions, runtime-filtered ~10,000** · signatures only ~2,450.

**The filter is non-negotiable.** Real callable surface of `@strudel/web@1.3.0` = 1017 named exports ∪ 1169 `Pattern.prototype` props = **1471 names** (an export list alone is wrong — `layer`, `density`, `duckorbit`, `into` are methods, not exports). Against that, **116 of 724 documented names (16%) are not callable in npm 1.3.0**, including `all`, `each`, `flux`, `setcpm`, `juxFlip`. Pasting `main`'s docs unfiltered would confidently offer functions the POC's runtime lacks. Note the coupling: **this filter is computed against whichever build 12 picks.**

**Verification loop: yes, but as one field, not a second tool.** The apply tool returns **synchronously in its `tool_result`** either `{ok: true, activeCode}` or `{ok: false, error}` → hands to **05**. Two constraints:

1. `repl.evaluate` resolving is **not** success — it catches and resolves `undefined`, so the tool must correlate the `onEvalError` callback (or read `state.evalError`) with the in-flight call.
2. **Refinement to 01:** evaluation errors are *not* fully invisible — `state.evalError`/`state.error` are set and `onEvalError` fires, so that half is a callback, not real work. **Playback-time errors still never reach `repl.state`**, arrive only as the untyped `strudel.log` DOM event, and so cannot ride in that `tool_result`. Whether they reach the agent at all on a later turn is 05's call — and it rubs against the map's "agent acts only when instructed".

**Caveat carried forward:** `doc.json`'s `@param` data is unreliable (`swingBy` params misnamed at source; `chunk`/`ply`/`arp`/`compressor`/`cpm`/`cutoff` have empty params). That is why the recommendation carries **descriptions** rather than trusting signatures.
