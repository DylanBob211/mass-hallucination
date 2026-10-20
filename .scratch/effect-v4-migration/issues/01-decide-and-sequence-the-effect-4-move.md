# 01 — Decide and sequence the move to Effect 4

Status: needs-triage

## Question

ADR 0006 pinned Effect 3.22 and turned down the v4 RC because of "RC churn and thin documentation while learning". That reason is gone: `effect@4.0.0` went stable on 2026-10-01, and `latest` is 4.0.5 (2026-10-15). 3.x continues as `prev`.

Should the core move to Effect 4, and when?

1. **Cost:** what the move touches in `src/core` and `src/facade`. ADR 0006's three rules were meant to keep it mechanical (no `@effect/platform`, no `Runtime<R>`/`FiberRef`, the renames such as `fork` → `forkChild`), and v4 has no codemod. Also check `@effect/vitest`, `@effect/tsgo` diagnostics, and the exact pins.
2. **Documentation and stability** of v4 now that it is GA, for the modules this repo uses.
3. **Sequencing against the autonomous agent** (`.scratch/autonomous-agent/map.md`). That effort will add a new state-machine interpreter and a `Decider`/`Policies` service. If the move comes first, that code is written once, on v4. If it comes after, it migrates along with the rest.
4. Whether ADR 0006 is superseded or amended.

## Context

- Found as a side finding of autonomous-agent research 01 (branch `research/01-state-machines-in-effect`). Its recommended interpreter uses only modules present in both `effect@3.22.2` and `effect@4.0.5` (`SubscriptionRef`, `Queue`, `FiberHandle`, `Stream`, `Schedule`, `Data.TaggedEnum`, `Match`), so the move neither forces nor blocks that design.
- `@effect/experimental`'s `Machine` is absent from `effect@4.0.5`, which was one reason it was rejected.
