# 17 — Code over moving visuals

Type: prototype
Status: open
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
