---
status: accepted (POC only)
---

# Instructions are asked at the cursor, the agent works visibly in the code, and one status line carries the rest

**This decision covers the POC only**, like ADRs 0005 and 0006. It records how the performer talks
to the agent and how the agent's work is made legible. What an agent change *does* is ADR 0003's.

The rule behind every choice: **the performer's hands and eyes stay on the code.** Nothing takes
focus unless the performer asks, and keys come first. Every mouse control is a duplicate of a key
and never moves focus out of the editor.

## Asking

- **Ctrl-K opens a one-line input at the cursor.** It is aimed at the Part the cursor is in
  (`@hats`). **Tab** switches the aim to `@all`. On a blank line or in the Preamble it opens on
  `@all`. Enter sends and returns focus to the editor. Esc cancels.
- **The aimed-at Part is a hint, never a restriction.** It travels with the Instruction as context.
  The agent still receives the whole Performance and may change any Part. For example, "add a
  bassline" asked at `@hats` may create a new Part. `change_parts` (ADR 0004) is unchanged.

## Seeing the agent work

- **The tool input streams into the editor**, as a dashed block under the Part being rewritten, or
  at the end of the Source for a new Part. Streaming is the "thinking" indicator: the tool call is
  the interface. It needs per-tool `eager_input_streaming` (07).
- **A badge on the Part's label line** says the agent is at work there.
- **A Proposal is an inline diff**: the old lines struck through, the new text in a block beneath.
  **Alt-A** accepts, **Alt-P** accepts and plays, **Alt-R** rejects. Focus-safe buttons duplicate
  the keys. A Stale Proposal is greyed out and can only be dismissed.
- **Agent-written text stays marked** (tinted) after a Write or Apply landing **until the human
  edits that Part**. The mark means "agent text you haven't touched yet". Undo stays the plain editor
  history (ADR 0003).
- **A deleted Part that still sounds stays visible as a ghost**, struck through, at the end of the
  Source, until an Apply of every Part silences it.

## The status line: the one place for everything else

A single line under the editor shows:
- **Autonomy**, switched with **Alt-1/2/3** (Propose / Write / Apply);
- **the Turn's state** (thinking, writing, dry-running, landed, answered, stopped), the model's
  one-line note on what it is doing, and the keys that apply now;
- **refused retries**, as a count (`↻2`); the human sees that retries happened, not their detail;
- **dry-run warnings**, shown;
- **an agent Apply waiting** for the next cycle ("plays at cycle 13");
- **eval and playback errors**, with their Part;
- **the transport**: running or stopped, cycle, cps.

**Esc stops the running Turn.** A stopped Turn has landed nothing, because a change lands atomically
(ADR 0004). A half-streamed draft just disappears.

## No conversation, but a peek

- **The code is the shared artifact.** There is no chat transcript beside it.
- **The peek** is a small popup above the status line that lists this session's Instructions and
  what came of each. **Ctrl-J** toggles it, Esc closes it, and it never takes focus. It **opens by
  itself when the agent answers in words**, because an answer has nowhere else to go.
- **The peek is for the human only.** It decides nothing about what the agent remembers between
  Instructions. That question is still open on the map.

## Façade consequences (ADR 0006)

- `instruct(text, part | null)`: the aimed-at Part rides along with the Instruction.
- The view model gains **the session's Turns** (for the peek) and **the streamed draft** of the
  running Turn's tool input. Agent-authored marks stay editor state, derived from tagged
  transactions.

## Considered options

Prototyped as four switchable variants on branch `prototype/09-instruction-ux`.

- **A chat dock** (the familiar shape): a panel with Turn cards, tool-call cards and a diff card.
  It was rejected because it pulls the eyes and the focus away from the code, and a kept
  conversation was judged not worth its weight in the POC.
- **A command line only**: a minibuffer and a status line, driven only by keys. Its status line was
  kept. Its bottom-of-screen input lost to asking at the cursor.
- **Everything in the code**: badges, notes and errors attached to each Part. Asking at the
  cursor, streaming, the inline diff and the ghost were kept. Errors and notes scattered across
  Parts lost to the single status line.
- **Restricting the agent to the aimed-at Part.** Rejected: it would add a rule to `change_parts`
  and block "add a part that fits this one".

## Consequences

- A conversation the human can review, and giving the agent that history to make it more
  independent, are both deferred past the POC.
- Keys used: Ctrl-Enter, Ctrl-., Ctrl-K, Ctrl-J, Esc, Tab (in the input), Alt-A/P/R, Alt-1/2/3.
