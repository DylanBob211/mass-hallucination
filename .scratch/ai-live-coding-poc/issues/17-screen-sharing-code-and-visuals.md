# 17 — Code over moving visuals

Type: prototype
Status: resolved
Blocked by: 16

## Question

08 put Hydra's canvas behind a transparent editor. 09 put everything the agent does *into* that
editor: the streamed tool input under its Part, the inline Proposal diff, the tinted agent text,
ghosts of deleted Parts, and one status line. [16](16-visual-parts.md) now makes visuals a real
Surface, so the code has to stay legible over bright, moving, flickering imagery. Decide, by
reacting to a rough prototype with real Hydra behind it:

- **Legibility:** how the code stays readable over any visual (a backdrop per line, a dimmed or
  blurred canvas, a toggle to show visuals only). Does it change while the agent streams or a
  Proposal is open?
- **09's marks over visuals:** whether the tint, diff colours, ghosts and the "agent at work"
  badge still read. Which of them need an amendment to [ADR 0007](../../../docs/adr/0007-instructions-at-the-cursor-state-in-one-status-line.md).
- **Visual errors:** 16 sends them to the status line with their Part. Is that enough when the
  failure *is* what's on screen (a frozen output, a black screen)?
- **Space:** does the human ever want the code out of the way (performing to an audience), and
  what is the least gesture for it?

## Deliverable

An amendment to ADR 0007, or a new ADR if the layout changes, and a prototype on a
`prototype/17-…` branch.

## Answer

**Only the Part in focus gets a solid band; the canvas is never dimmed.** Recorded as an amendment to [ADR 0007](../../../docs/adr/0007-instructions-at-the-cursor-state-in-one-status-line.md). The layout doesn't change: the canvas stays behind the editor (ADR 0006), so no new ADR is needed. Prototype: branch `prototype/17-code-over-visuals`, `.scratch/ai-live-coding-poc/prototypes/17-code-over-visuals/` (`pnpm dev`, then `?variant=A|B|C|D`). It is 09's variant D over a real `hydra-synth@1.4.0` canvas with 16's glue, and **D** is the chosen variant.

- **Legibility:**
  - The Part in focus sits on a solid, full-width band. That Part is the agent's target while a Turn runs or a Proposal is open, and otherwise the one under the cursor.
  - Every other line has a lighter box, only as wide as its text.
  - The canvas is never dimmed or blurred. It uses plain CSS, with no cost to 10's frame budget.
  - **While the agent streams or a Proposal is open,** the band moves to the agent's target. That is the only change.
- **09's marks:** the tint, the diff colours, the ghost and the badges all still read, once the widgets sit on solid panels. None of them needs a new colour.
- **Visual errors:** the status line (16) plus a badge on the broken visual Part's label line. When the code is hidden, a small corner chip stands in for the badge. The failure is already on screen; the error's job is to name the Part.
- **Space:** Alt-H steps from all code, to only the Part in focus, to no code, and back to all. The status line stays in every view.
  - Hidden code reveals itself only for a Proposal, and only as far as the Part in focus.
  - A Write or Apply landing never reveals anything.

Rejected:
- **B, a scrim that breathes:** it dims the Performance, and a blur on every frame costs GPU time.
- **C, side by side with an output strip:** it overturns ADR 0006 and halves the picture. The Part index's `outputs` and 16's hides-warning already carry what the strip showed.
- **A, per-line boxes alone:** legible, but every line is equally loud.
- **D's first draft, outlined text off the focus Part:** it failed over white strobes and thin stripes, so A's boxes replaced it.

Not prototyped, and specified only in the ADR: the corner chip and the auto-reveal for a Proposal. Screenshots came from headless Chromium with software rendering, not a laptop GPU. 10's frame measurement still applies.

