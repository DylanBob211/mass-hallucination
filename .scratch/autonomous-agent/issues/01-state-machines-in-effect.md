# 01 — State machines in an Effect codebase

Type: research
Status: resolved
Blocked by: —

## Question

The agent's flow will be an explicit state machine whose states and transitions the developer edits and compares between runs. What should express it in this codebase, where the core is Effect 3.22 behind a façade (ADR 0006)?

Compare **xstate v5**, **Effect's own primitives** (`Effect` + `Ref`/`SubscriptionRef`, `Stream`, `Schedule`, `FiberRef`, any state-machine module in Effect or `@effect/*`), and a **hand-rolled reducer** of typed states plus an Effect interpreter. For each, cover:

1. How easy it is to **add, remove or rewire a state** and to swap the policy behind a transition (for example, which decider answers it).
2. **Inspection**: whether the current state and the transition history can be shown live in the UI and written to a run record.
3. **Async and cancellation**: long model calls inside a state, interruption by a human edit or Instruction, timers in musical time.
4. **Fit with Effect**: running inside the Turn fiber the façade owns, testability with the existing fakes, and typing.
5. Maturity, bundle size and pinning, in line with ADR 0006's exact-pin rules.

## Answer

**Build a hand-rolled reducer that is plain data, and a small Effect interpreter to run it. Use no library.**

- **The machine** is a pure file. It holds the states and events as `Data.TaggedEnum`s, an `on[state][event]` transition table as data, and a machine name or version. A developer edits and diffs it between runs.
- **Activities:** each state has one Effect that emits events.
- **The interpreter** is a scoped Layer like `Agent.layer`.
  - State and history live in `SubscriptionRef`s, which feed `ViewModelStore` and `Instrumentation`.
  - An event inbox `Queue` receives human edits, Instructions and activity results.
  - A `FiberHandle` interrupts the running activity on every transition.
- **Deciders** sit behind a `Policies` service that is swapped by Layer, which is the `Decider` from 02.
- **Musical time** reuses the boundary loop in `AgentApplies`.
- **What this buys:** it runs inside the façade's fiber, works with the existing fakes and `TestClock` unchanged, adds 0 kB, and uses only APIs that exist in both Effect 3 and 4.

**Rejected:**
- **`@effect/experimental` Machine:** it is an actor with no named states, transitions or history. It needs FiberRef and `@effect/platform`, which ADR 0006 bans, and it is gone from Effect 4.
- **xstate 5.33.2:** it is the best library and the strongest on inspection: `provide()`, `inspect`, and a pure `transition()`. But it runs on its own scheduler outside the fiber, every Effect call crosses a `runPromise` bridge where typed errors become `unknown`, its timers need a second simulated clock in tests, and v6 is in alpha. **Revisit** only if hierarchy or parallel regions are needed, and then use only its pure `transition()` inside the same interpreter.

**Side finding:** Effect 4 went stable (4.0.0 on 2026-10-01). That undercuts one of ADR 0006's reasons for pinning 3.22. The upgrade is outside this map.

Findings: `research/01-state-machines-in-effect.md` on branch `research/01-state-machines-in-effect`. **It is not pushed yet:** the agent's push was denied, so the branch is local only.
