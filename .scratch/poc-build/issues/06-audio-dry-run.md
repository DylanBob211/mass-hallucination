# 06: Audio dry-run

**What to build:** A way to know, before anything lands, whether the composition a change would produce evaluates and queries cleanly — without touching the running sound. See [spec §6.3 audio step](../../ai-live-coding-poc/spec.md), ADR 0004.

**Blocked by:** 04 (Live code and Apply by composition).

**Status:** ready-for-agent

- [ ] Dry-run takes a Scope + proposed texts and evaluates the exact composition the resulting Apply would evaluate
- [ ] Uses the transpiler plus a local copy of core's eval step; `hush/all/each/setcps/setCps/setcpm/setCpm/samples/evaluate` shadowed as no-ops, `hush` recorded → `invalid`
- [ ] `Pattern.prototype.p` swapped for a collector and `.play` for a no-op, always restored in `finally`
- [ ] Collected patterns are stacked and `query`'d (never `queryArc`) over cycles 0–8 under a 250 ms cap; exceeding it is `invalid`
- [ ] Warns when `size`/`roomsize` or `legato`/`clip` are both set in one chain
- [ ] Real evaluates and dry-runs are serialised by one mutex
- [ ] Browser-mode tests against the real bundle: valid code passes, syntax/runtime/query errors are `invalid` with message and Part, `hush` is refused, warnings fire, live playback state is untouched
