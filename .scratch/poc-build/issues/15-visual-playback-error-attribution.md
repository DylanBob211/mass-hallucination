# 15: Visual playback-error attribution

**What to build:** When a Visual Part fails while running (not at evaluate), the performer sees one error naming that Part, and nothing is reverted. See [spec §8 playback-error attribution](../../ai-live-coding-poc/spec.md).

**Blocked by:** 13 (Hydra canvas and the `hydra` tag).

**Status:** ready-for-agent

- [x] Each Visual Part's parameter functions are wrapped; a throw sets the error slot once (`phase: 'playback'`, with its Part)
- [x] `gl.getError()` is checked after ticks; a frozen output is blamed on the Part that last wrote it
- [x] Nothing is reverted; the next successful Apply clears the slot
- [x] Browser-mode test for a throwing parameter function

## Comments

**Implemented (2026-10-01).**

- **`src/facade/live/visuals.ts`.** `createVisuals` now takes `onPlaybackError`. While a Part's body runs, the host knows which Part it is (`running`, set in `.p`).
  - **Parameter functions.** `out` is replaced on Hydra's source prototype. When a Part's chain reaches it, every function in the chain's `userArgs` is wrapped, nested sources included (`blend(solid(() => …))`). Hydra reads `userArgs[i]` on every frame, so swapping the function in place is enough. The wrapper reports the throw and rethrows it. Hydra still catches it and draws that parameter at its default, so nothing is reverted.
  - **`update`/`afterUpdate`.** An assignment to either from a body is wrapped the same way. Hydra calls them every frame and swallows their throws too.
  - **Frozen outputs.** `out` also records which Part last wrote each output. Each output's `tick` is wrapped: if it throws, or if `gl.getError()` is set after it draws, the Part that last wrote that output is blamed (`WebGL INVALID_ENUM while drawing o0`). Only outputs a Part wrote are checked, as each check waits on the GPU. Errors still pending from before are drained in `prepare`.
  - **Once.** Each Part is reported at most once per evaluate. `prepare` clears this along with the writers.
- **`Strudel.playbackErrors`** now carries `{ message, part? }`. `StrudelLive` merges the `strudel.log` audio errors, which have no Part, with the Visuals' errors. `ErrorSlotStore` reports either as `phase: 'playback'`.
- **The error slot is cleared only of the error it held before the Apply** (`clearIfStill`). The frame after `.out` can run while `repl.evaluate` is still settling. Without this, the successful Apply would wipe its own Part's playback error, and "once" would keep it from coming back. A core test covers this with a held evaluate. In the browser it is timing-dependent, so I could not get it to fail there on demand.
- **ADR 0002** gains a bullet. These are replacements of methods on Hydra's objects at run time, still not patches to the package. "No output is tracked per Part" now names the reset, which still doesn't track outputs.
- **Tests** (`visuals.browser.test.ts`, real bundle):
  - a throwing parameter function is reported once, with its Part, and the Part still draws red;
  - a nested source's function is blamed on its Part;
  - a throwing `update` is blamed on its Part;
  - an injected WebGL error is blamed on the Part that wrote the output checked;
  - a second evaluate reports afresh;
  - end to end through `LiveCodeStore`, the slot holds `{ phase: 'playback', part: 'viz' }`.

  I broke the once-gating, the nested walk and the per-evaluate reset in turn to confirm that their tests fail.

Known limits (from review):

- **A WebGL error is blamed when it is read, not where it was raised.** Flags persist until read, so one raised by Hydra's final render or by an output no Part wrote lands on the next written output checked. The test injects its error between frames, so it can only show the wiring.
- **The checked regl build throws rather than set GL flags** for most draw problems, so the `getError` path may rarely fire on its own. The throw path is covered by the same wrapper.
- **A shader that fails to compile at `.out` is swallowed by Hydra** (`shader could not compile`). It happens at evaluate, not while playing, so it is out of scope here. For agent changes, ticket 16's dry-run catches it. A human Apply still shows nothing.
- **Every Apply re-runs every Visual Part**, so a still-broken Visual Part is reported again after any Apply, even an unrelated audio one.
- **A source shared between Parts through an undeclared name** keeps the first Part's wrappers.
- **An audio playback error from the old pattern, thrown while the Apply is evaluating,** now survives that Apply. This is the cost of `clearIfStill`.
- **`gl.getError()` costs one GPU round-trip per written output per frame.** Ticket 19's frame-time measure should show whether that matters.
