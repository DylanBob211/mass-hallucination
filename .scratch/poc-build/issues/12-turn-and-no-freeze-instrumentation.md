# 12: Turn and no-freeze instrumentation

**What to build:** Every Turn and every main-thread stall is recorded in memory and downloadable as JSON from the peek, so the budget in spec §12.5 can be judged. See [spec §11 items 1–2](../../ai-live-coding-poc/spec.md), map ticket 10.

**Blocked by:** 11 (Seeing the agent work).

**Status:** ready-for-agent

- [ ] Spike first (spec §13.5): find a late-note hook on the trigger path of `@strudel/web@1.3.0`; record the outcome
- [ ] Per Turn: timestamps for Enter, first streamed character, landed, heard (agent Apply's cycle boundary, separate); calls, retries, input/output/cache-read/cache-write tokens; ending
- [ ] `PerformanceObserver` on `longtask` and a late-note count, each entry marked with whether a Turn was running
- [ ] Façade `downloadLog()` and a download control in the peek produce the JSON
