# 03 — What counts as "performance state"?

Type: grilling
Status: resolved
Blocked by: 01

## Question

Define the thing the agent perceives. The brief says the agent must "understand the relevant current performance/code state" — this ticket says what that noun actually contains, and names it.

Work through `/grilling` and `/domain-modeling`:

- Is a session **one buffer of code**, or a set of **named, separately addressable parts**? (Ticket 01 says what Strudel permits; this ticket decides what the POC's model is, which may be narrower or an abstraction over it.)
- Does state include **transport** — playing/stopped, tempo, cycle position? Does the agent need to know *where in the bar* it is to answer any of the three acceptance scenarios?
- Is there a distinction between the **buffer** (what the human is typing) and the **evaluated pattern** (what is sounding)? If Strudel exposes both, does the POC's model keep both, and which one is "the truth" the agent reasons about?
- Does state include anything about **what it sounds like** — audio analysis, queried pattern events — or only code?
- What is *deliberately* excluded? Cheapest correct answer wins.

Honour the Notes constraint: the model must not be shaped so that "the state is the Strudel buffer" is baked in, since a visual surface joins later. But do not build multi-surface machinery now.

## Deliverable

Domain vocabulary recorded in `CONTEXT.md`; any architectural commitment recorded as an ADR under `docs/adr/`.

## Answer

The noun is the **Performance**. Vocabulary recorded in [`CONTEXT.md`](../../../CONTEXT.md); the architectural commitment in [ADR 0001](../../../docs/adr/0001-source-is-truth-parts-are-a-projection.md).

**A Performance is its Source, plus what is derived from it.**

- **Named Parts, not one blob — but the Source is truth.** Parts are *parsed* from top-level labels, not serialised out of a structured list. The human keeps typing ordinary text; the agent perceives the **verbatim Source and the Part index over it**. Parts are a projection, not a partition: nothing is ever visible only as a fragment. Top-level code in no label is the **Preamble**, modelled explicitly so a Part splice cannot clobber it. This also yields the label-to-char-range map that ticket 01 identified as the only route to slot attribution, as a byproduct rather than extra machinery — and it makes re-serialise-the-blob vs `evaluateBlock` a pure apply-strategy choice (04, 12), invisible to the model.
- **Buffer and evaluated are both perceived, at Part granularity.** A Part has its current text and its **Live code** (last successful evaluation), with **unapplied edits** derived from the divergence. The agent *edits* the text and *reasons about what is sounding* from the Live code. Strudel gives the split natively (`state.code` / `state.activeCode`); at Part granularity it is just remembering what we last applied. This is what makes the half-typed-edit clobber case decidable in 04 instead of invisible. Named "unapplied edits", not "dirty" or "staged": a human mid-keystroke is neither wrong nor deliberately staging.
- **Transport is `started` + tempo (cps). Cycle position is not agent-perceivable.** Quantised apply is host machinery built on `scheduler.now()` (01); the agent does not need to know where in the bar it is to author code. Excluding it also avoids reasoning over a number that is stale the instant it is serialised into a prompt.
- **Code only — no perception of sound.** `queryArc`, the `onTrigger` event stream and FFT analysis are all excluded. Strudel code is a complete description of what it will sound like, so query results are a lossy re-derivation of what the agent already has; `queryArc` additionally swallows errors and returns `[]`, making "no events" and "your pattern threw" indistinguishable. If *get me unstuck* needs it, it returns as a **tool** (05), never as perception.
- **Mute and solo are derived from the label prefix, never stored.** Strudel encodes them at transpile time (`_d1:`, `S$:`) with no runtime API and no per-slot gain. "Mute the hats" is therefore a text edit, inheriting apply semantics and undo for free.
- **One error slot on the Performance**, carrying the message and its phase (evaluation vs playback) — genuinely different failures: an eval error means the previous pattern is still playing, a playback error means something is wrong *while* sounding. Not attributed to a Part: that needs the char-range map to survive a throw, which 01 does not confirm, and 04 may remove the need. The model reserves the place; who sees it and what they do about it stays with 04/05.
- **Comments are text, not a modelled concept** — no structured annotation channel. One parse rule: a run of comment lines immediately above a label **attaches to that label's Part**, so rewriting a Part preserves the human's note about it; blank-line-separated comments stay interstitial. *Constraint for 05 and the system prompt:* the agent must keep comments current when it changes the code they describe.
- **Surface-neutrality is a tag and a naming rule, nothing more.** A Part carries its Surface; there is exactly one value today. No adapters, no registry, no dispatch — the cheapest thing that is not a lie, and it is the specific dead end the map's Notes were written to avoid.

**Deliberately excluded:** cycle position, audio analysis and the event stream, per-Part audio routing or gain, stored mute/solo state, structured comment annotations, multi-Performance/multi-instance state, and history (undo remains fog, hanging on 04).

## Comments

- **2026-09-22** — Re-claimed: previous claim was stale, no session was operating on it. Working it now.
