# 05: Error slot

**What to build:** When code fails, the performer sees one error, with its Part, in the status line — whether it failed at evaluate or during playback. See [spec §4, §5 and §8 (audio playback errors)](../../ai-live-coding-poc/spec.md).

**Blocked by:** 04 (Live code and Apply by composition).

**Status:** ready-for-agent

- [x] One error slot per Performance: `{message, phase: 'eval' | 'playback', part?}` or empty, in the view model
- [x] Eval errors set `phase: 'eval'` with the Part found by mapping character offsets in the composition back to the Source
- [x] `strudel.log` events matching `/^\[(cyclist|query|getTrigger)\] error: /` set `phase: 'playback'`
- [x] A successful Apply clears the slot; a newer error replaces it
- [x] The status line shows the error with its Part
- [x] Node tests for offset-to-Part mapping and slot transitions

## Comments

**Implemented (2026-09-30).**

- `src/core/ErrorSlotStore.ts` holds the slot. It reports every playback error it receives from `Strudel.playbackErrors`. `LiveCodeStore.apply` reports eval errors and clears the slot after a successful Apply, inside its lock.
- `compose` now returns a `Composition`: the code plus each unit's span. `unitAt` maps an offset to a Part identity, or to `(preamble)`. An offset just past a unit's end belongs to that unit, which covers an unfinished last line.
- `EvalError` gains `offset?`. The live adapter reads it from acorn's `SyntaxError.pos`, or from the line in `[mini] parse error at line N`. Other errors come from code Strudel generated, whose positions aren't the composition's, so they get no Part.
- `StrudelLive.playbackErrors` listens on the `strudel.log` DOM event for `/^\[(cyclist|query|getTrigger)\] error: /` and emits the message without its prefix.
- The view model gains `error: ErrorSlot | undefined`. The status line shows `✕ eval in hats: …` or `✕ playing: …`.

Decisions beyond the spec:

- **The Preamble is named `(preamble)` in `part`**, the same way a Scope names it. The §6.1 snapshot will pass that string on to the agent.
- **Messages drop positions in the composition** (acorn's ` (l:c)`, mini's `at line N`), because the performer never sees the composition and those positions don't match the Source.
- **Audio playback errors have no Part.** The spec asks only for `phase: 'playback'`.

Known limits:

- **A syntax error is blamed where acorn notices it.** If a Part ends unfinished and another unit follows it (`hats: s("hh").gain(` then `chords: …`), acorn fails at the next unit, so the error names `chords`. Blaming the first unit that doesn't parse on its own would fix that, if it bites.
- **A mini-notation error raised at runtime can name the wrong unit.** Examples are `mini()` over a computed string, or a tagged template. Strudel counts its line within the fragment, not the composition. Errors in string literals are caught by the transpiler, which counts lines in the composition.
- **An error from the previous pattern can land just after a successful Apply cleared the slot**, and it then stays until the next Apply. Strudel's logger also drops a repeat of the same message within 1 s.
