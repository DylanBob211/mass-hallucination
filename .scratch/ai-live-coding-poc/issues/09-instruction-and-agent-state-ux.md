# 09 — Instruction & agent-state UX

Type: prototype
Status: resolved
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

## Carried in from 08

[08](08-frontend-stack.md) / [ADR 0006](../../../docs/adr/0006-svelte-codemirror-behind-an-effect-facade.md):
- The stack is **Svelte 5, raw CodeMirror 6, Tailwind v4 and Bits UI**. Bits UI primitives are added only when an interaction decided here needs one.
- **Focus must never leave the editor unless the performer chooses.** Bits UI dialogs and popovers move or trap focus by default. Decide which interactions may take focus, and how it returns to the editor.
- Everything the UI shows comes from one immutable view model published by the façade. Everything the UI does is a plain façade call (`instruct`, `stop`, `accept`, `reject`, `setAutonomy`). A prototype may fake the façade.

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

## Answer

**Ask at the cursor, watch the agent work in the code, and read everything else from one status line.** There is no conversation, only a peek. Recorded in [ADR 0007](../../../docs/adr/0007-instructions-at-the-cursor-state-in-one-status-line.md). Prototype: branch `prototype/09-instruction-ux`, `.scratch/ai-live-coding-poc/prototypes/09-instruction-ux/` (`pnpm dev`, then `?variant=A|B|C|D`). **D** is the chosen mix.

- **Input:** Ctrl-K opens an input at the cursor, aimed at the Part there (`@hats`). Tab switches to `@all`, and a blank line or the Preamble opens on `@all`. The aim is **a hint, not a restriction**: the agent still sees and may change everything.
- **Legibility:**
  - The tool input **streams into the editor** under the Part being rewritten. The tool call is the interface.
  - An "agent at work" badge sits on the Part's label line.
  - Agent text stays tinted **until the human edits that Part**.
  - A deleted Part that still sounds stays visible as a ghost.
- **Proposal:** an inline diff. **Keys first** (Alt-A accept, Alt-P accept & play, Alt-R reject); focus-safe buttons duplicate them. A Stale Proposal is greyed out and can only be dismissed.
- **One status line** carries:
  - Autonomy (Alt-1/2/3) and the Turn's state and note;
  - a retry count (the human sees *that* retries happened, not their detail);
  - dry-run warnings (shown), and an agent Apply waiting for its cycle;
  - eval and playback errors, and the transport.
- **Intervention:** Esc stops the Turn. Nothing half-lands, because landing is atomic (05); the streamed draft just disappears.
- **Conversation:** none. **The peek** (Ctrl-J, Esc to hide, never takes focus) lists this session's Instructions and outcomes, and opens by itself when the agent answers in words. It is for the human only. What the *agent* remembers stays in the map's fog.
- **Focus (from 08):** only the Ctrl-K input takes focus, and it returns focus on Enter or Esc. No Bits UI dialog or popover is needed.

Rejected: the chat dock (A), which pulls eyes and focus off the code. Also rejected: errors and notes scattered per Part (C), and a Part aim that restricts the agent.

Deferred past the POC: a conversation the human can review, and conversation history as agent context, to make the agent more independent.
