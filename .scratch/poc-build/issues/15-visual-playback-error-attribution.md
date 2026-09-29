# 15: Visual playback-error attribution

**What to build:** When a Visual Part fails while running (not at evaluate), the performer sees one error naming that Part, and nothing is reverted. See [spec §8 playback-error attribution](../../ai-live-coding-poc/spec.md).

**Blocked by:** 13 (Hydra canvas and the `hydra` tag).

**Status:** ready-for-agent

- [ ] Each Visual Part's parameter functions are wrapped; a throw sets the error slot once (`phase: 'playback'`, with its Part)
- [ ] `gl.getError()` is checked after ticks; a frozen output is blamed on the Part that last wrote it
- [ ] Nothing is reverted; the next successful Apply clears the slot
- [ ] Browser-mode test for a throwing parameter function
