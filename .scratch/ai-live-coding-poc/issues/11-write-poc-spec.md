# 11 — Write the POC spec

Type: task
Status: open
Blocked by: 01, 02, 03, 04, 05, 06, 07, 08, 09, 10

## Question

Nothing left to decide — assemble the resolved decisions into the spec that is this map's destination.

Write `.scratch/ai-live-coding-poc/spec.md` covering:

- What the POC is and what it deliberately is not.
- Architecture: embedding substrate, state model, runtime, stack — each pointing at its ADR rather than restating the argument.
- The tool surface in full.
- Apply semantics and the interaction model.
- The **three acceptance scenarios** as concrete, checkable criteria, with the latency targets from ticket 10.
- The **prompt-reference build step** decided by [06](06-strudel-knowledge-grounding.md): pin the Strudel version chosen by [12](12-strudel-build-target.md) → run `npm run jsdoc-json` → intersect with the bundle's callable union (named exports ∪ `Pattern.prototype`) → emit the ~10K-token signature+description index, plus `strudel-vs-tidal.mdx` and the do-not-use list. It is a build step, not a runtime component, and it must be re-run whenever the pinned version moves.
- Build sequencing — what order to build it in, and the earliest point at which the thing can be played.

It must be tight enough for a build cycle to start from it with no further decisions required. Anything still undecided at this point is either a missed ticket or genuinely out of scope — say which.

## Deliverable

`spec.md` in this directory. When it lands, the map is done.
