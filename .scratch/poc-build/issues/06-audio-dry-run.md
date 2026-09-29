# 06: Audio dry-run

**What to build:** A way to know, before anything lands, whether the composition a change would produce evaluates and queries cleanly — without touching the running sound. See [spec §6.3 audio step](../../ai-live-coding-poc/spec.md), ADR 0004.

**Blocked by:** 04 (Live code and Apply by composition).

**Status:** ready-for-agent

- [x] Dry-run takes a Scope + proposed texts and evaluates the exact composition the resulting Apply would evaluate
- [x] Uses the transpiler plus a local copy of core's eval step; `hush/all/each/setcps/setCps/setcpm/setCpm/samples/evaluate` shadowed as no-ops, `hush` recorded → `invalid`
- [x] `Pattern.prototype.p` swapped for a collector and `.play` for a no-op, always restored in `finally`
- [x] Collected patterns are stacked and `query`'d (never `queryArc`) over cycles 0–8 under a 250 ms cap; exceeding it is `invalid`
- [x] Warns when `size`/`roomsize` or `legato`/`clip` are both set in one chain
- [x] Real evaluates and dry-runs are serialised by one mutex
- [x] Browser-mode tests against the real bundle: valid code passes, syntax/runtime/query errors are `invalid` with message and Part, `hush` is refused, warnings fire, live playback state is untouched

## Comments

**Implemented (2026-09-30).**

- `LiveCodeStore.dryRun(scope, texts)` in the core. `texts` holds proposed texts keyed by Part identity or `(preamble)`. The method reads the Source, puts the texts in place (`withTexts` in `src/core/liveCode.ts`), composes for `scope` with `compose`, and dry-runs the result. It fails with `Invalid {message, part?}` or succeeds with its warnings (`"hats: size and roomsize …"`). It never touches Live code, the error slot or the transport.
- `Strudel.dryRun(code)` in the live adapter runs `evaluateDry` (`src/facade/live/dryRun.ts`): the transpiler, then core's eval step with the nine names shadowed, `.p` collecting and `.play` doing nothing, both restored in `finally`. The collected patterns are then stacked and `query`'d cycle by cycle over 0–8.
- One mutex: `StrudelLive`'s semaphore covers both `evaluate` and `dryRun`, and `LiveCodeStore` holds its lock across an Apply or a dry-run, so a dry-run composes from the Live code the last Apply left.
- Browser tests over the real bundle (`dryRun.browser.test.ts`) and Node tests over fakes (`src/core/dryRun.test.ts`, `src/facade/live/dryRun.test.ts`).

Decisions beyond the spec:

- **Every key in `texts` is in Scope,** whatever `scope` names. A text left out of Scope would land without ever being evaluated.
- **Where `withTexts` puts things:** a new Part goes at the end. A proposed Preamble replaces all Preamble segments, where the first one stood (or at the top). **Ticket 07's write must lay the Source out the same way**, or the dry-run and the Apply will evaluate different code.
- **Errors with no offset find their Part by prefix.** Runtime and query errors come from code Strudel generated. The core dry-runs the composition one unit longer at a time, and the first prefix that fails with the same message names the Part (else the last unit). This costs extra dry-runs only on failure.
- **The `.p` collector follows `repl.evaluate`:** mute marks give silence, `$` ids are numbered, only soloed ids play when any is soloed, and a numbered `d1`…`d9` throws as the real `.p` does.
- **Synonym warnings cover every registered control alias.** An alias shares its control's `Pattern.prototype` method, so `size`/`roomsize`, `legato`/`clip`, `sz`, `rsize` and the rest are all caught. The warning fires when two different names of one control appear in one method chain.
- **The time cap is checked between cycles.** A query is synchronous, so one cycle that never ends hangs the page. Evaluation itself has no cap.

Known limits:

- `all`/`each` are no-ops, so a transform they would apply is never checked.
- `samples` is stubbed, so a bad sample-map URL passes.
- `register`/`evalScope` in the code still change globals.
- The dry-run skips the `withState(setControls({id}))` that the repl adds per pattern.
- `.cpm()` exists only after the first real evaluate, so a dry-run before any Apply refuses it.
