# 11 — Write the POC spec

Type: task
Status: resolved
Blocked by: 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 14, 15, 16, 17

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

## Carried in from 16

[16](16-visual-parts.md):
- **The four acceptance scenarios**, not three: scenario 4 (*give me visuals for this*) is checkable as "the agent writes a `hydra` Part that follows an audio Part through `pulse`, `value` or `level`".
- **The host's Hydra glue** is its own build item: the canvas, a `makeGlobal:false` instance, the `hydra` tag, the output reset before every evaluate, the mute skip, the four helpers, the dry-run instance, and per-Part playback-error attribution. [ADR 0002](../../../docs/adr/0002-scoped-composition-on-published-strudel.md) and [ADR 0004](../../../docs/adr/0004-one-tool-state-pushed-dry-run-gated.md) amendments hold the detail.
- **Verify first when building:** that wrapping `Pattern.prototype.p` in `beforeEval` collects label → pattern for `pulse`/`value` (read in `@strudel/core@1.2.6`, not tested), and that string `analyze` ids work.
- **The Hydra grounding note** (about 200 tokens) is part of the prompt-reference build step, next to 15's generated signature index from `glsl-functions.js`. Its content:
  - the Part shape;
  - what is in scope (Hydra plus `cycle() pulse(p) value(p, ctl) level(p)` with signatures, nothing from Strudel);
  - `level(p)` needs `.analyze('<p>')`;
  - never `a.fft` or `H`;
  - one output is shown, and the hides-warning.
- **Editor:** the `hydra` template body is highlighted as JavaScript, with no completion in either language.

## Carried in from 17

[17](17-screen-sharing-code-and-visuals.md) / [ADR 0007](../../../docs/adr/0007-instructions-at-the-cursor-state-in-one-status-line.md) amendment:
- **The Part in focus** is editor state derived from the view model: the agent's target while a Turn runs or a Proposal is open, otherwise the cursor's Part. It drives a full-width line decoration. Other lines get lighter per-line boxes. The canvas gets no scrim and no blur.
- **Alt-H's three views** (all / focus / none) are UI-only state, outside the façade. The spec should state the auto-reveal to the Part in focus when a Proposal opens.
- **Visual errors:** a label-line badge on the visual Part, plus a corner chip when the code is hidden. Both render from the existing error slot. The spec needs no new façade field.
- **Acceptance** for scenario 4 includes "the Proposal and the streamed draft stay readable over the busy-colour and white-strobe backdrops" (the prototype's presets).

## Deliverable

`spec.md` in this directory. When it lands, the map is done.

## Answer

**The spec is written: [spec.md](../spec.md).** It assembles 01–17 into a build order, with the ADRs as the normative text. It covers what the POC is and isn't, the architecture table, pins, the Performance model, Apply, the tool surface, the agent loop, the Hydra glue, the prompt-reference build step, the interaction model, instrumentation, acceptance for the four scenarios with 10's budget, the verify-first list, and the milestones.

- **Earliest playable point:** the end of M1. The human live-codes Strudel through composition Apply, with no agent yet. The agent plays scenarios 1–3 at M3 and scenario 4 at M5.
- **One missed decision was found and settled with the human: the agent has no memory between Instructions.** ADR 0005 carried the last `tool_result` into the next Instruction, which implied a session transcript. ADR 0007 had deferred history, and 10's cache plan didn't assume it. Chosen: **one fresh request per Instruction.** It holds the cached prefix, then the snapshot and the Instruction. Retries live only inside their Turn's transcript, which is discarded when the Turn ends. Recorded as an amendment to [ADR 0005](../../../docs/adr/0005-poc-agent-loop-runs-in-the-browser.md).
- **The rest of the fog was ruled out of scope,** not missed:
  - more than one landed change per Instruction (fixed at one, to be discussed after the POC);
  - whether the POC is beautiful and enjoyable (the effort after this map).
- **Defaults the spec set itself**, marked in it and free to change:
  - a successful Apply clears the error slot;
  - the dry-run's time cap is 250 ms;
  - if the 5.5 models hide the pre-tool note in a `thinking` block, a `note` field on `change_parts` carries it instead.
