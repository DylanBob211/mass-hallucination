# 07: `change_parts` pipeline, landing by Write and Apply

**What to build:** The agent's one tool works end to end without a model: a scripted tool call is validated, gated by Rev, Unapplied and the dry-run, and lands atomically — written into the editor, or written and Applied at the next cycle boundary — according to Autonomy. See [spec §5 (agent Apply), §6.2](../../ai-live-coding-poc/spec.md), ADR 0003, ADR 0004.

**Blocked by:** 06 (Audio dry-run).

**Status:** ready-for-agent

- [x] `change_parts` input/result types exactly as spec §6.2
- [x] Pipeline in order, atomic: shape (`bad_request`: unknown Part, label changed beyond mute/solo marks, `rev: null` on an existing name, duplicate Part) → Rev (`stale`, returning current text) → Unapplied (`unapplied`) → dry-run (`invalid` or warnings) → land. Any refusal changes nothing
- [x] Write lands as one tagged CM transaction (one undo step, cursor carried); `rev: null` appends the new Part at the end
- [x] Apply Autonomy writes, then schedules an agent Apply with Scope = touched Parts at the next cycle boundary on `scheduler.now()`; on a stopped transport it updates Live code only; a queued Apply survives the Turn ending
- [x] `setAutonomy` on the façade and Alt-1/2/3 (Propose falls back to Write until ticket 08); Autonomy and "plays at cycle N" shown in the status line
- [x] A fake `Model` that replays scripted tool calls drives Node tests for every refusal and both landings, including 12.1's "human mid-edit in another Part" case

## Comments

**Implemented (2026-09-30).**

- `changeParts(input)` in `src/core/changeParts.ts` takes the model's unchecked JSON and returns a `ChangePartsResult` as spec §6.2 gives it, refusals included, as a value for the `tool_result`. The shape is decoded with `Schema`.
- `Editor.write(onto, changes)` makes the changes as one agent write, but only onto the Source it was computed against, and fails as `SourceMoved` otherwise. The live one is one CodeMirror transaction tagged with the user event `agent.write` (for ticket 11's tint) and `isolateHistory`, so it is always its own undo step. CodeMirror carries the cursor.
- `writeTexts` (`src/core/liveCode.ts`) lays texts into the Source exactly as `withTexts` lays them for the dry-run (ticket 06's note). It checks the result by parsing it back, and adds a blank line where a written text would run into its neighbour (a Preamble ending in a comment directly above a Part would become that Part's).
- `AutonomyStore` holds the Autonomy (Propose by default). `AgentApplies` waits for each agent Apply's cycle boundary: it computes the wait from `scheduler.now()` and the tempo, sleeps on Effect's `Clock`, and checks again, so a tempo change or scheduler lag only delays it. Its fibers belong to the layer, not the Turn. The view model gains `autonomy` and `waitingApply`, and the status line shows both.
- `makeFakeModel(calls)` in `src/core/fakes.ts` answers each request with the next scripted `change_parts` call. The `Model` service in `src/core/Model.ts` has only the shape ticket 10 needs to fill in (no snapshot yet).

Decisions beyond the spec:

- **The human keeps typing during the dry-run.** After the dry-run, the pipeline reads the Source again, re-runs the shape, Rev and Unapplied checks, and writes only if the composition is still the one the dry-run passed. If the human typed in another Part, the change lands onto the Source as it is now with no second dry-run. If they typed in a changed Part, it is `stale`. If an Apply changed the Live code, it dry-runs again.
- **A waiting agent Apply is cancelled once the human takes a touched Part over.** At the boundary, `LiveCodeStore.apply(scope, written)` goes ahead only if every touched Part still holds exactly what the agent wrote. If the human edited, undid (Ctrl-Z) or deleted one, nothing plays and nothing becomes Live code. So an agent Apply never plays the human's Unapplied text, nor text the human has taken back.
- **A stopped transport**, at landing or by the boundary, makes the texts Live code (`LiveCodeStore.setLiveCode`, with the same check) and evaluates nothing. A position that goes back between two looks at the scheduler counts as a stop and a restart. The wait sleeps in steps of at most 50 ms, so a stop or a tempo change is seen within one step.
- **`rev: null` on a Part deleted but still sounding** is `unapplied`: the deletion is the human's Unapplied edit.
- **A Part's text must be exactly one labelled Part** with the requested identity, and nothing outside it. A Preamble text may hold no Part. Both are `bad_request`.
- **Propose lands as `written`** until ticket 08. The status line still shows Propose.
- `LiveCodeStore.dryRun` now also returns the code it evaluated (`{ code, warnings }`).

Known limits:

- A Part never Applied counts as Unapplied, so the agent cannot change any Part before the first Apply. This follows CONTEXT.md.
- If several agent Applies are waiting, `waitingApply` shows the earliest cycle.
- The Apply evaluates when `scheduler.now()` reaches the boundary. The scheduler queries about 100 ms ahead, so the change is probably heard a little after the boundary. Ticket 12's "heard" timestamp will measure it.
- `Editor.write` now takes the Source it was computed against (ADR 0006 amended).
