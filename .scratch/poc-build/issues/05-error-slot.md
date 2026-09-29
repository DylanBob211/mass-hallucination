# 05: Error slot

**What to build:** When code fails, the performer sees one error, with its Part, in the status line — whether it failed at evaluate or during playback. See [spec §4, §5 and §8 (audio playback errors)](../../ai-live-coding-poc/spec.md).

**Blocked by:** 04 (Live code and Apply by composition).

**Status:** ready-for-agent

- [ ] One error slot per Performance: `{message, phase: 'eval' | 'playback', part?}` or empty, in the view model
- [ ] Eval errors set `phase: 'eval'` with the Part found by mapping character offsets in the composition back to the Source
- [ ] `strudel.log` events matching `/^\[(cyclist|query|getTrigger)\] error: /` set `phase: 'playback'`
- [ ] A successful Apply clears the slot; a newer error replaces it
- [ ] The status line shows the error with its Part
- [ ] Node tests for offset-to-Part mapping and slot transitions
