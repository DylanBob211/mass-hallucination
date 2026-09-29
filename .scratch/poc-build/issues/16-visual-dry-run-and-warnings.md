# 16: Visual dry-run and warnings

**What to build:** Agent changes to Visual Parts are gated like audio: a throwaway Hydra compiles and probes them before they land, refuses with a typed `kind`, and warns when one Part hides another. The snapshot reports each Visual Part's outputs. See [spec §6.1, §6.3 visual step](../../ai-live-coding-poc/spec.md), ADR 0004 visual amendment.

**Blocked by:** 07 (`change_parts` pipeline), 14 (Audio-linked helpers).

**Status:** ready-for-agent

- [ ] A throwaway `hydra-synth` (`makeGlobal:false`, `autoLoop:false`, own small WebGL context, created once)
- [ ] Per Visual Part: strict GLSL generation, compile, and parameter probes at cycles {0, .37, 1.5, 3.9} × helpers stubbed to 0, 1, 0.5; failures are `invalid` with `kind` syntax|name|argument|shader|parameter
- [ ] Hydra in any shape other than a Visual Part is refused
- [ ] Warnings: no output written; hides another Part on an output (`glow hides viz on o0`); helper names a missing Part; `level('x')` without `.analyze('x')`
- [ ] `outputs` from the last dry-run in the snapshot and view model
- [ ] Browser-mode tests for each `kind` and each warning
