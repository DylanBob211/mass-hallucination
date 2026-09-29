# 14: Audio-linked helpers

**What to build:** A Visual Part can follow the music: `cycle()`, `pulse('part')`, `value('part','ctl')` and `level('part')` track what is heard. See [spec §8 helpers](../../ai-live-coding-poc/spec.md).

**Blocked by:** 13 (Hydra canvas and the `hydra` tag).

**Status:** ready-for-agent

- [ ] Spikes first (spec §13.1, §13.2): wrapping `Pattern.prototype.p` in `beforeEval` collects label → pattern; string ids work in `.analyze('kick')` / `getAnalyzerData`. Record outcomes
- [ ] `cycle()` follows the Strudel cycle position and `setcps`
- [ ] `pulse(p)` is 1 on each onset of the Part's live pattern, decaying to 0; `value(p, ctl)` gives the control's current value; both compensate the scheduler's ~100 ms lead
- [ ] `level(p)` gives heard loudness 0..1 from `.analyze('p')`
- [ ] All four give 0 for a muted or soloed-out Part
- [ ] Manually verified: a Visual Part pulses with `kick`
