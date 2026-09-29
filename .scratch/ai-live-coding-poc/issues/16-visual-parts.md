# 16 — Visual Parts in the Performance

Type: grilling
Status: open
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
