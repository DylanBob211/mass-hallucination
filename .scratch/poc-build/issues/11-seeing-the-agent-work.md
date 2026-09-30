# 11: Seeing the agent work

**What to build:** The performer can watch the agent working in the code and review what happened: a streamed draft under its Part, a badge, tinted agent text, ghosts of deleted-but-sounding Parts, and the peek with this session's Turns. See [spec §10](../../ai-live-coding-poc/spec.md), ADR 0007.

**Blocked by:** 10 (Agent loop over the real model).

**Status:** ready-for-agent

- [x] Tool input streams as a dashed block under its Part (new Parts at the end), from the view model's streamed draft
- [x] "Agent at work" badge on the target Part's label line while a Turn runs
- [x] Agent-written text stays tinted until the human edits that Part
- [x] A deleted Part still sounding shows as a struck-through ghost at the end
- [x] Ctrl-J toggles the peek without taking focus; it lists this session's Instructions and outcomes and opens itself on a word answer

## Comments

**Implemented (2026-09-30).**

- **The streamed draft** (`src/core/draft.ts`): `draftOf` reads `change_parts` input cut off anywhere, with a small JSON reader that keeps what it has read. A change counts once its Part is named in full, and its text shows as far as it has streamed, with half an escape dropped. `Agent.drafts` publishes it on every `ToolInput`. It is cleared in the same uninterruptible step as the landing, when a change is refused (before the retry), and whenever the Turn ends. The view model gains `draft: ReadonlyArray<{ part, text }> | undefined`.
- **Ghosts:** a deleted `PartView` now carries `live`, the text still sounding. That is one field more than ADR 0007's façade section lists, and the ghost needs it.
- **In the editor** (`src/ui/agentWork.ts`, fed by `showAgentWork` from `Editor.svelte`): the draft is a dashed block under its Part's last line, at the end for a new Part, or at the top for the Preamble. It uses the Proposal's placement, now shared in `src/ui/place.ts`. The badge "agent at work" sits at the end of the Part's label line (its first line that isn't a leading comment) while the Turn runs. It marks the Parts the draft touches, or the aimed-at Part until the draft names one. Ghosts are struck-through blocks at the end, after any new-Part draft.
- **Tint** (`src/ui/agentMarks.ts`): editor state derived from transactions tagged `agentWriteEvent` (moved to `facade.ts` so the UI can read it). An agent write replaces whole Parts, so only what differs from the replaced text at either end is tinted. Any other change clears the tint in every unit it touches, undo included.
- **Peek** (`src/ui/Peek.svelte`, `src/ui/peekState.svelte.ts`): a popup above the status line listing each Turn's aim, Instruction, state (and how it landed), retries, warnings and the note, answer or error. Ctrl-J toggles it, and a mousedown on it is prevented so focus stays in the editor. `main.ts` feeds every published view model's Turns to `PeekState.see`, which opens it once per answered Turn.

Decisions beyond the spec:

- **Esc closes an open peek first, and stops the running Turn only when the peek is closed.** ADR 0007 gives Esc both jobs. Dismissing an answer while a follow-up runs shouldn't kill it. So, with the peek open, the first Esc closes it and a second Esc stops the Turn.
- **An `@all` Turn has no badge until its draft names a Part in the Source.** A new Part never has one either. Its dashed block at the end is the only sign it is being written.
- **A Proposal accepted is tinted too**, since it lands as an agent write. It is still "agent text you haven't touched yet".
- **Redo of an agent write comes back untinted**, because the redo is the human's.
- **Tint is by character, not by line**, so a one-number change tints one number.
- The status line still shows the answer as the note. The peek opens with the same answer in full.

Known limits:

- Following ADR 0006's test stack, there are no component tests. `Peek.svelte` isn't tested. `PeekState` is tested in Node, and the widgets, tint and keys in the browser editor tests.
- The draft block and the landed text (or the Proposal) can show together for one frame. The editor write is synchronous, and the draft clears through the view model.
- `draftOf` re-reads the whole input on every delta. That is quadratic in the change's length, which is fine for Parts of a few KB.
- Not checked by eye in the running app yet. Watch the draft streaming, the badge and the peek on the first real Turn.
