# 19: Frame-time and sync instrumentation

**What to build:** The log also records frame stutter after each Apply and an onset-to-flash sync estimate, so the visual rows of the budget can be judged. See [spec §11 items 3–4](../../ai-live-coding-poc/spec.md).

**Blocked by:** 12 (Turn and no-freeze instrumentation), 14 (Audio-linked helpers).

**Status:** ready-for-agent

- [ ] Frame times for the second after each Apply, with the number of Visual Parts
- [ ] Onset-to-flash estimate from scheduler time vs `AudioContext.outputLatency` vs `requestAnimationFrame`
- [ ] Both included in the downloaded JSON
- [ ] A short note on how to do the one-off slow-motion film check
