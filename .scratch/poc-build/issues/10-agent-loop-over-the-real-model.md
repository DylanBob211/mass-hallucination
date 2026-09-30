# 10: Agent loop over the real model

**What to build:** The performer presses Ctrl-K, types an Instruction, and the AI pair-programmer lands one change through `change_parts` (or answers in words), with the Turn's state visible in the status line and Esc stopping it instantly. See [spec §6.1, §7, §10](../../ai-live-coding-poc/spec.md), ADR 0005, ADR 0007.

**Blocked by:** 07 (`change_parts` pipeline), 09 (Prompt reference build, Strudel part).

**Status:** ready-for-agent

- [x] Spike first (spec §13.3): check Opus 5.5 at `effort: medium` returns the pre-tool note as visible text; if not, add an optional `note` field to `change_parts` and record the outcome
- [x] Snapshot built exactly as spec §6.1, including `aim`
- [x] `Model` Effect service over `@anthropic-ai/sdk`: streams text deltas, partial tool input and the final call; SDK abort tied to a scope finalizer; `claude-opus-5-5`, `effort: medium`; fallback by configuration only
- [x] Cached prefix (tool with `strict` + `eager_input_streaming`, system prompt per §7.1, the reference) with 1-hour `cache_control`; `tool_choice: auto`
- [x] One fresh request per Instruction; retries append `tool_use` + refusing `tool_result` to this Turn only; transcript discarded at Turn end
- [x] Turn endings: landed, answered, superseded, stopped (Esc), timed out (60 s), out of retries (4th refusal), model/network error; none undoes a landed change
- [x] Ctrl-K opens the input at the cursor aimed at the Part there (blank line/Preamble → `@all`); Tab toggles aim; Enter sends, Esc cancels; focus returns to the editor
- [x] Esc in the editor stops the running Turn; façade `instruct` and `stop`
- [x] Status line shows Turn state, the note and the retry count (`↻2`)
- [ ] Node tests with the fake `Model` for retries, every ending and supersession; manually verified against the real API on scenario 12.1

## Comments

**Implemented (2026-09-30).** The implementation environment had no key, so the spike and scenario 12.1 were written as a key-gated test (below).

**Spike outcome (2026-09-30):** run against the real API with the performer's key, both real-model tests pass. With `claude-opus-5-5` at `effort: medium`, the pre-tool note arrives as visible `text` before the `change_parts` call. No `note` field is needed. Scenario 12.1, run at Write through the real model and the loop with the dry-run faked, lands a change to `hats` only. The last box stays open for the in-app check by ear (Propose, Write and Apply, with the human mid-edit in `chords`).

- **Snapshot** (`src/core/snapshot.ts`): `snapshotOf` builds spec §6.1's shape from the Performance, the Live code, the transport, the error slot and the aim. The Preamble comes first as `(preamble)` when it has text, or when text it lost still plays. `live` holds the Live code of every Unapplied unit that has some, including a deleted Part still sounding. `outputs` waits for the visual dry-run (ticket 16). `takeSnapshot(aim)` takes it once per Instruction, and retries reuse it.
- **`Model`** (`src/core/Model.ts`): a request is `{ snapshot, instruction, retries }`, where each retry is `{ call, result }`. A `ToolCall` event carries `reply`, the model's whole reply as the `Model` needs it back (thinking blocks with their signatures, the note, the `tool_use`). Only the `Model` reads it.
- **Over the SDK** (`src/facade/live/model.ts`, `prompt.ts`): one fresh `messages.create({ stream: true })` per call, to `claude-opus-5-5` at `output_config.effort: "medium"`, with thinking left at the model's adaptive default. It sends `max_tokens` 16000 and `tool_choice: { type: "auto", disable_parallel_tool_use: true }`. `change_parts` is declared with `strict` and `eager_input_streaming`. The cached prefix is the tool, then the §7.1 system prompt, then the reference (the index, strudel-vs-tidal and the do-not-use list), with `cache_control: { type: "ephemeral", ttl: "1h" }` on the last block. After it comes one user message holding the snapshot JSON and the Instruction. A retry appends the reply as the assistant turn, then the refusal as a `tool_result` with `is_error: true`. Text deltas become `Text` events and input JSON deltas become `ToolInput` events (the raw JSON so far). The call is parsed once complete and emitted on `message_stop` if the stop reason is `tool_use`. A `refusal` or `max_tokens` stop fails with `ModelError`. Interrupting while connecting aborts through `tryPromise`'s signal. Once streaming, a scope finalizer calls `controller.abort()`.
- **Configuration** (`.env.local`): `VITE_ANTHROPIC_API_KEY`, plus optional `VITE_ANTHROPIC_MODEL` and `VITE_ANTHROPIC_BASE_URL` for the fallbacks. Nothing switches on its own.
- **The loop** (`src/core/Agent.ts`): `Agent.instruct(instruction, aim)` interrupts the running Turn (ending it `superseded`), forks the new one, and completes when that Turn ends. `Agent.stop` interrupts it (`stopped`). A Turn streams one call: `thinking`, then `writing` once input streams, then `dry-running` in `change_parts`. It ends `landed` on the first `ok: true`, or `answered` when no call comes. After a refusal it retries, and the 4th refusal ends it `out of retries`. It also ends `timed out` after 60 s, or `failed` on a `ModelError` or a defect. The retries live in the Turn's local state and are gone when it ends.
- **The view model** gains `turns`: this session's Turns (`instruction`, `aim`, `state`, `note`, `retries`, `landed?`, `warnings?`, `error?`). `retries` counts the retries made, so a Turn out of retries shows `↻3`. The status line shows the latest Turn's state, `↻N`, the landed change's dry-run warnings, the note (or the answer, or the error), and `esc stop` while it works. The façade gains `instruct(text, part | null)` and `stop()`.
- **Keys** (`src/ui/instruction.ts`): Ctrl-K opens a one-line input as a block widget under the cursor's line, aimed at the Part there. A blank line, the Preamble, or a spot between Parts gives `@all`. Tab toggles the aim, Enter sends (an empty input sends nothing), and Esc or a click away cancels. Focus goes back to the editor each way. Esc in the editor calls `stop()` and keeps its default.
- **Tests:** `Agent.test.ts` runs the loop over the fake `Model` for every ending, retries, supersession, the timeout (TestClock) and the afresh-per-Instruction rule. `model.test.ts` runs the live `Model` over a fake `fetch` serving SSE, covering the request shape, event translation, retry messages, broken JSON, API errors, a refusal and abort-on-interrupt. `snapshot.test.ts`, the view-model and façade tests, and browser tests for Ctrl-K/Tab/Enter/Esc complete the set. The fake `Model` can now answer in words (`answers`), fail (`fails`) and hang (`hangs`), and it counts aborted streams.

**Re-running the real-model checks:** `pnpm vitest run --project node src/facade/live/model.real.test.ts` (billed; a couple of calls). It uses the key in `.env.local`, and `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL` override it. The first test is spec §13.3: it passes if a non-empty note arrives as text before the call. The second runs scenario 12.1 at Write Autonomy through the real model and the loop, with the dry-run faked. After that, check 12.1 by ear in the app.

Decisions beyond the spec:

- **The note stays visible text, confirmed by the spike.** Per Anthropic's docs, Opus 5.5 returns between-tool notes longer than a sentence or two as `thinking` blocks, empty unless `thinking.display: "updates"` (beta) is sent. The one-line note stays `text`. If the note ever goes missing (a longer note, or another model as the fallback), either add an optional `note` field to `change_parts`, or request `display: "updates"` and read non-empty `thinking_delta` as the note.
- **`disable_parallel_tool_use: true`**, so a reply holds at most one `change_parts` call, matching "at most one landed change".
- **No server-side refusal `fallbacks`.** They would switch models automatically, which ADR 0005 rules out. A refusal ends the Turn `failed`.
- **The landing and the Turn's `landed` state (with the warnings) are recorded uninterruptibly together** (`changeParts(input, onLanded)`). Interrupting during the checks or the dry-run lands nothing. A Turn stopped just as its change lands therefore shows `landed`, never `stopped`, and a `stopped` Turn has landed nothing (ADR 0007).
- **Tool input that isn't valid JSON** (possible with eager streaming) is passed to `change_parts` as the raw string, which refuses it as `bad_request` and so counts as a retry. The replayed `tool_use` then carries `input: {}`, because the API needs an object. Empty text blocks are left out of a replayed reply, because the API refuses them.
- **Answered Turns show their answer in the status line** until the peek exists (ticket 11). The view model's `turns` is the session list the peek will read.

Known limits:

- The streamed draft (`ToolInput`) only flips the state to `writing`. Rendering it under its Part is ticket 11's.
- Usage tokens aren't read yet (ticket 12).
- **Unverified against Opus 5.5's preserved-thinking check:** the retry replay changes the reply in the two ways above. If the API refuses that with a 400, the Turn ends `failed` instead of retrying. Watch for this on the first real runs.
- **Esc during a dry-run** waits for the dry-run to finish (capped at 250 ms), because the dry-run is synchronous JavaScript. That can exceed §12.5's 200 ms budget for Esc. It lands nothing either way.
- Like Alt-A/P/R, Esc can't see whether a Turn is running, so it always calls `stop()`, which does nothing when none is.
