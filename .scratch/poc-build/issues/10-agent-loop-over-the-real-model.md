# 10: Agent loop over the real model

**What to build:** The performer presses Ctrl-K, types an Instruction, and the AI pair-programmer lands one change through `change_parts` (or answers in words), with the Turn's state visible in the status line and Esc stopping it instantly. See [spec §6.1, §7, §10](../../ai-live-coding-poc/spec.md), ADR 0005, ADR 0007.

**Blocked by:** 07 (`change_parts` pipeline), 09 (Prompt reference build, Strudel part).

**Status:** ready-for-agent

- [ ] Spike first (spec §13.3): check Opus 5.5 at `effort: medium` returns the pre-tool note as visible text; if not, add an optional `note` field to `change_parts` and record the outcome
- [ ] Snapshot built exactly as spec §6.1, including `aim`
- [ ] `Model` Effect service over `@anthropic-ai/sdk`: streams text deltas, partial tool input and the final call; SDK abort tied to a scope finalizer; `claude-opus-5-5`, `effort: medium`; fallback by configuration only
- [ ] Cached prefix (tool with `strict` + `eager_input_streaming`, system prompt per §7.1, the reference) with 1-hour `cache_control`; `tool_choice: auto`
- [ ] One fresh request per Instruction; retries append `tool_use` + refusing `tool_result` to this Turn only; transcript discarded at Turn end
- [ ] Turn endings: landed, answered, superseded, stopped (Esc), timed out (60 s), out of retries (4th refusal), model/network error; none undoes a landed change
- [ ] Ctrl-K opens the input at the cursor aimed at the Part there (blank line/Preamble → `@all`); Tab toggles aim; Enter sends, Esc cancels; focus returns to the editor
- [ ] Esc in the editor stops the running Turn; façade `instruct` and `stop`
- [ ] Status line shows Turn state, the note and the retry count (`↻2`)
- [ ] Node tests with the fake `Model` for retries, every ending and supersession; manually verified against the real API on scenario 12.1
