# 03: Parse the Performance

**What to build:** The Performance model derived from the Source on every change: Parts, the Preamble, Revs, mute/solo and Surface, published in the view model. See [spec §4](../../ai-live-coding-poc/spec.md), ADR 0001, CONTEXT.md.

**Blocked by:** 01 (Scaffold).

**Status:** ready-for-agent

- [ ] Spike first (spec §13.4): confirm Strudel 1.2.6's solo label syntax from the transpiler source and record it in the ticket
- [ ] A top-level labelled statement is a Part; identity is the label with mute/solo marks stripped
- [ ] A Part's text runs from its leading comment run (no blank line between) to the end of its statement; blank-line-separated comments belong to the Preamble
- [ ] All other top-level text, anonymous `$:` blocks included, is the Preamble, addressed as `"(preamble)"`
- [ ] A Part whose expression is exactly a `hydra` tagged template is Visual; everything else is Audio; unlabelled Hydra is Preamble
- [ ] Muted/soloed read from the label using the transpiler's rules
- [ ] Rev = first 8 hex chars of SHA-256 over the Part's exact text
- [ ] The view model lists Parts with muted/soloed/surface, re-derived on every edit
- [ ] Node tests cover each rule above, including edge cases (comments, `$:`, marks, nested labels not being Parts)
