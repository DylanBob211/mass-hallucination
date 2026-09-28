# 09 — Instruction & agent-state UX

Type: prototype
Status: open
Blocked by: 05

## Question

Decide how the human speaks to the agent and how the agent's state and actions are made legible — the brief's "genuinely AI-native interaction patterns rather than simply attaching a chatbot to an editor".

Prototype and react to:

- **Input**: a chat panel, a command palette, an inline instruction in the code itself (a comment the agent answers), or something else. Which fits a performer whose hands are already on the keyboard playing?
- **Legibility**: what does the human see while the agent is thinking, calling tools, and writing? Is the tool call itself the interface? How is an agent edit visually distinguished from the human's own code, and for how long?
- **Intervention**: how is an in-flight turn cancelled, and what happens to a half-applied change?
- **Conversation weight**: does prior conversation stay visible at all, or is the *code* the shared artifact and the chat ephemeral?

Ticket 04 decides what an edit *does*; this ticket decides what the human *sees and does*. Keep them distinct.

## Carried in from 04

[04](04-apply-semantics.md) decided what an edit *does*; these are now things the human must *see and do*:

- **The Autonomy switch** (Propose / Write / Apply), changeable at any moment mid-performance; Propose is the default.
- **The Proposal**: a diff with **Accept**, **Accept & play** and **Reject**; one open at a time, replaced by the next request; how a **Stale** Proposal looks.
- **A refused request**: the agent's change bounced because the human was working in that Part. Does the human see it, or only the agent?
- **Write and Apply landings**: how agent text is marked in the editor, given that undo is the plain editor history.
- **A deleted Part that is still sounding**, because deletion is an Unapplied edit.
- **A quantised agent Apply waiting** for the next cycle boundary.

## Deliverable

A linked throwaway prototype and an ADR recording the interaction model.

## Carried in from 05

[05](05-tool-surface.md) / [ADR 0004](../../../docs/adr/0004-one-tool-state-pushed-dry-run-gated.md):
- **One `change_parts` call is the agent's only action**, and at most one lands per instruction. It
  may be preceded by refused attempts: `stale`, `unapplied` or `invalid` retries. Decide whether
  the human sees those retries or only the outcome.
- **Playback-time errors** (e.g. an unknown sound) pass the dry-run. They reach the agent only on
  its next instruction, so the human is the first to notice them: what they see is yours.
- **Dry-run `warnings`**, such as control synonyms set twice, arrive with a successful change.
  Decide whether they are shown to the human at all.
