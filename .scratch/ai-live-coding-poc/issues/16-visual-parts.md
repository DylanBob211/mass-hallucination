# 16 — Visual Parts in the Performance

Type: grilling
Status: resolved
Blocked by: 14

## Question

Scenario 4 (*give me visuals for this*) needs the agent to write Hydra as a Part and link it to an
audio Part. [14](14-hydra-in-published-strudel.md) established the mechanics. Decide the model and
amend the closed decisions it touches.

- **The Part.** Is ``name: hydra`…` `` the visual Part's shape? How does the Part index show its
  **Surface** (03 left one tag for this)? Hydra's names are scoped inside the template: what does
  the agent see and write? Are outputs (`o0..o3`) and `render()` Part-level or Performance-level,
  and who owns them when two visual Parts write the same output?
- **Apply and Scope (12/04).** Does a scoped Apply of one visual Part still reset every output
  before the evaluate? Or does the host track which Part wrote which output, keeping the Live code
  of out-of-Scope visual Parts showing? Is a deleted visual Part "still showing" until an Apply of
  every Part, like audio?
- **Quantisation (04).** Visual swaps land on the next frame. Should an agent's visual Apply wait
  for the cycle boundary like its audio Apply, or land on arrival?
- **The dry-run and errors (05).** Add the throwaway hydra-synth dry-run as a second step for
  visual Parts: its probe times, and how `invalid` refusals phrase shader errors. Where do the
  invisible failures (a frozen output, fallback defaults) go? Playback-time errors reach the agent
  only through the next snapshot. Is a frozen output a playback error of that Part?
- **Linking to audio.** `H(pattern)` against `.analyze(id)`/`getAnalyzerData`. Which one the agent
  is taught to use, and whether a link needs anything in the Part model: an audio Part tagged
  `.analyze('kick')` that a visual Part reads. The agent never perceives the visuals or the sound;
  it only writes the link.
- **Build (12).** The second pinned dependency (`hydra-synth@1.4.0`) and our own `initHydra`/`H`
  glue replacing `@strudel/hydra`. Confirm this, and record it as an amendment to ADR 0002.

## Carried in from 15

[15](15-hydra-knowledge-grounding.md): the model's Hydra needs no teaching. What it gets wrong are the embedding traps: quoted args transpiled into Patterns, globals, `a`/`a.fft`. The Part shape decided here determines which traps remain, and so what the ~390-token "Hydra inside Strudel" note must say.

## Deliverable

Amendments to CONTEXT.md and ADRs 0001/0002/0004 (or a new ADR), and carried-in notes for
10 and 11.

## Answer

**A visual Part is ``label: hydra`…` ``, and it follows the music only through four helpers in its scope.** Everything else about Apply, Scope, mute and errors is the audio rule, applied to a second Surface. Recorded as amendments to [ADR 0001](../../../docs/adr/0001-source-is-truth-parts-are-a-projection.md), [ADR 0002](../../../docs/adr/0002-scoped-composition-on-published-strudel.md) and [ADR 0004](../../../docs/adr/0004-one-tool-state-pushed-dry-run-gated.md); new term **Visual Part**, and Surface and Muted/soloed amended in [`CONTEXT.md`](../../../CONTEXT.md).

- **The Part.**
  - Exactly ``label: hydra`…` ``. The tag is the host's. Only Hydra's names (`makeGlobal:false`) and the link helpers are in scope. Nothing from Strudel is: no `sine`, no Preamble helpers, no `H`, no `a.fft`.
  - Any other shape holding Hydra code is refused as `invalid` by the dry-run.
  - The editor parses the template body as JavaScript for **highlighting only**. No completion for either language in the POC.
  - Error positions are mapped from the template back to Source offsets.
- **Surface:** `audio | visual`, **derived** from whether the Part's expression is a `hydra` template, and never stored. Unlabelled Hydra is Preamble, with no special case.
- **Apply and Scope.** Every Apply re-runs every Part's Live code (ADR 0002), so:
  - before *every* evaluate the host resets all four outputs to `solid(0,0,0,0)`, sets `render(o0)`, and clears `update`/`afterUpdate`, with no per-output bookkeeping;
  - out-of-Scope visual Parts keep showing, because their Live code runs again;
  - a deleted visual Part keeps showing until an Apply of every Part;
  - feedback survives.

  **The picture must keep flowing.** A small stutter (the first-frame shader recompile) is tolerated, but it is a requirement to measure (10).
- **Timing:** no separate rule. An agent Apply is quantised to the cycle boundary (04) for both Surfaces at once, so an audio change and its visual land together. A human's Apply stays immediate.
- **Mute and solo:**
  - A muted visual Part (`_viz`, `viz_`) is not drawn: the host skips its body. Strudel's `.p` mute only runs after the template has already drawn, so this is host work.
  - Solo works **within one Surface**.
- **Links to the music: four helpers.** The link is only code, and the Part model stores none.
  - `cycle()`: Strudel's position in cycles. It follows `setcps`.
  - `pulse('part')`: 1 on each onset of that Part's **live** pattern, decaying to 0.
  - `value('part', 'ctl')`: the control value (e.g. `gain`) that Part's code sets right now.
  - `level('part')`: that Part's heard loudness, 0..1. It needs `.analyze('<part>')` on the audio Part, with the label as the analyser id by convention. `analyze` ids are plain object keys, so strings work (read in `superdough@1.2.6`, not tested).

  `pulse` and `value` read the Part's pattern by label, not a copy of it, so they follow the human's edits without the visual Part changing. They compensate Strudel's ~100 ms scheduler lead.

  **All four follow what is heard:** a muted or soloed-out Part gives no pulse, no value and level 0.

  How to reach a Part's pattern: `pPatterns` is closure-private in `@strudel/core@1.2.6` `repl.mjs`. But `beforeEval` runs after `injectPatternMethods`, so the host can wrap `Pattern.prototype.p` there to collect label → pattern. This was read, not tested; verify it first when building.
- **Outputs:** plain Hydra semantics, where the last `.out(oN)` in Source order wins. The Part index lists each visual Part's `outputs`. The agent may replace a visual or combine with it (e.g. writing `o1` and blending `src(o0)`); the warning below makes a hidden Part visible to the human.
- **Dry-run: a second step** for visual Parts, at every Autonomy, using the throwaway hydra-synth from 14.
  - **Probes:** cycles {0, .37, 1.5, 3.9} × the helpers stubbed to 0, 1 and 0.5.
  - **`invalid`** carries `kind: syntax | name | argument | shader | parameter`. `parameter` names its probe (`at cycle 3.9, level=0: returned Infinity`).
  - **Warnings:**
    - the Part writes no output;
    - the Part hides another Part on an output (`glow hides viz on o0`);
    - a helper names a Part that doesn't exist;
    - `level('x')` is used where `x` has no `.analyze('x')`.
- **Errors while playing:** a parameter that fails at an unprobed moment, a frozen output (`gl.getError()` after a tick), or a link to a renamed Part.
  - The host wraps each visual Part's parameter functions, so each failure is **attributed to its Part**.
  - It is **reported once**, not per frame, into the error slot with `phase: playback`. The status line (09) shows it, and the agent reads it in the next snapshot.
  - A frozen output is an error of the Part that last wrote it.
  - Nothing is reverted automatically.
- **Build:** `hydra-synth@1.4.0` is pinned exactly as the second direct dependency. About 40 lines of our own glue replace `@strudel/hydra`: the canvas, the scoped tag, the reset, the helpers and the dry-run instance.
- **Grounding:** 15's ~390-token trap note shrinks to about 200 tokens. It covers:
  - the Part shape;
  - what is in scope (Hydra plus the four helpers, with signatures, and nothing from Strudel);
  - `level` needing `.analyze`;
  - never `a.fft` or `H`;
  - that one output is shown, and the hides-warning.

Rejected:
- a bare `viz: osc().out()` or a `hydra(() => …)` wrapper, which need global Hydra names;
- host-composited outputs, which are magic, and break feedback;
- refusing output collisions;
- `H(pattern)`, which copies the rhythm instead of linking to a Part;
- a separate quantisation rule for visuals;
- auto-reverting a broken visual.
