# 13: Hydra canvas and the `hydra` tag

**What to build:** A human can write a Visual Part (``viz: hydra`…` ``) and see it on a full-screen canvas behind the transparent editor, applied by the same Apply as audio. See [spec §8](../../ai-live-coding-poc/spec.md), ADR 0002 amendment, map ticket 16.

**Blocked by:** 05 (Error slot).

**Status:** ready-for-agent

- [ ] Fixed, full-screen, `pointer-events:none` canvas behind a transparent editor; one live `hydra-synth` with `makeGlobal:false`
- [ ] A `hydra` tag registered in Strudel's eval scope returns `silence` and runs its body (not transpiled) with only Hydra's names in scope
- [ ] Before every evaluate, all four outputs reset to `solid(0,0,0,0).out(oN)`, `render(o0)`, `update`/`afterUpdate` cleared (fills the hook from ticket 04)
- [ ] Muted Visual Parts' bodies are skipped; solo works within the Visual Surface
- [ ] Eval errors inside a `hydra` body map back to Source offsets and reach the error slot with their Part
- [ ] Browser-mode test that a Visual Part evaluates and an error maps to its Part; manually verified with a hand-written Performance
