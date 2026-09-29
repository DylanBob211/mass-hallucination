# 07: `change_parts` pipeline, landing by Write and Apply

**What to build:** The agent's one tool works end to end without a model: a scripted tool call is validated, gated by Rev, Unapplied and the dry-run, and lands atomically — written into the editor, or written and Applied at the next cycle boundary — according to Autonomy. See [spec §5 (agent Apply), §6.2](../../ai-live-coding-poc/spec.md), ADR 0003, ADR 0004.

**Blocked by:** 06 (Audio dry-run).

**Status:** ready-for-agent

- [ ] `change_parts` input/result types exactly as spec §6.2
- [ ] Pipeline in order, atomic: shape (`bad_request`: unknown Part, label changed beyond mute/solo marks, `rev: null` on an existing name, duplicate Part) → Rev (`stale`, returning current text) → Unapplied (`unapplied`) → dry-run (`invalid` or warnings) → land. Any refusal changes nothing
- [ ] Write lands as one tagged CM transaction (one undo step, cursor carried); `rev: null` appends the new Part at the end
- [ ] Apply Autonomy writes, then schedules an agent Apply with Scope = touched Parts at the next cycle boundary on `scheduler.now()`; on a stopped transport it updates Live code only; a queued Apply survives the Turn ending
- [ ] `setAutonomy` on the façade and Alt-1/2/3 (Propose falls back to Write until ticket 08); Autonomy and "plays at cycle N" shown in the status line
- [ ] A fake `Model` that replays scripted tool calls drives Node tests for every refusal and both landings, including 12.1's "human mid-edit in another Part" case
