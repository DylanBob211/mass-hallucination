# 04: Live code and Apply by composition

**What to build:** Apply becomes the real mechanism: a composition of Live code with the in-Scope Parts substituted, so Unapplied edits elsewhere never sound, and deleted Parts keep sounding until a full Apply. Unapplied state is visible in the view model. See [spec §4 and §5](../../ai-live-coding-poc/spec.md), ADR 0002, ADR 0003.

**Blocked by:** 02 (Play the whole Source), 03 (Parse the Performance).

**Status:** ready-for-agent

- [x] Live code is stored per Part identity and for the Preamble; nothing else is stored
- [x] Compose walks the Source in order: in-Scope units give their current text, others their Live code, Parts with no Live code give nothing; deleted Parts with Live code are appended unless Scope is every Part
- [x] Before each evaluate, the Hydra reset hook point exists (a no-op until ticket 13)
- [x] Success is decided by correlating `onEvalError`/`state.evalError` with the call, not by the promise resolving
- [x] On success in-Scope Live code := current text (and deleted Parts dropped on a full Apply); on failure previous Live code keeps playing
- [x] Unapplied = current text ≠ Live code, or absent from the Source but holding Live code; published per Part in the view model
- [x] Ctrl-Enter is a human Apply with Scope = every Part; the façade can also Apply a given Scope
- [x] Node tests over compose/commit with a fake repl, including a deletion and a scoped Apply that leaves an Unapplied Part silent

## Comments

**Implemented (2026-09-30).**

- `src/core/liveCode.ts` is pure: `LiveCode`, `Scope` (`"every"` or a list of Part identities and `preambleId`), `compose`, `liveCodeAfter`, `deleted` and `isUnapplied`.
- `src/core/LiveCodeStore.ts` holds the Live code. Its `apply(scope)` composes, evaluates and, on success, updates the Live code, one Apply at a time.
- `parsePerformance` now also returns `layout`: the Parts and the Preamble's segments in Source order.
- `PartView` gains `unapplied` and `deleted`.
- The façade's `apply(scope?)` defaults to every Part. Ctrl-Enter still calls it with no Scope.
- In `StrudelLive`, `onEvalError` is passed to `initStrudel` and read per call, under a semaphore, with `state.evalError` as the fallback. `resetVisuals()` is the no-op hook for ticket 13, called synchronously just before `repl.evaluate`.

Decisions beyond the spec:

- **The composition joins units with `\n`.** It isn't byte-identical to the Source, but Scope = every Part evaluates the same code. Ticket 05's offset mapping has to go through the composition's own layout.
- **Where the Preamble goes.** Its Live code is one text. While it matches the current Preamble, the Preamble's segments stay where they are in the Source. When it has Unapplied edits and is out of Scope, its Live code goes first, before every Part, so helpers are defined before the Parts that use them.
- **A deleted Part shows at the end of `parts`** with `deleted: true, unapplied: true`. Its muted, soloed and Surface are read from its Live code, which is what is playing.
- **Only the literal `"every"` applies a deletion.** A list that happens to name every current Part is still a narrow Scope, and so is a list that names the deleted Part (per ADR 0003). Ticket 07 may need an agent change that deletes a Part to apply that deletion. That would amend ADR 0003.
- The view model doesn't show whether the Preamble is Unapplied yet. The ticket asks only for Parts.
- ADR 0006 is amended: the core holds Live code.
