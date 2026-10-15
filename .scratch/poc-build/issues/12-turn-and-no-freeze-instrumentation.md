# 12: Turn and no-freeze instrumentation

**What to build:** Every Turn and every main-thread stall is recorded in memory and downloadable as JSON from the peek, so the budget in spec §12.5 can be judged. See [spec §11 items 1–2](../../ai-live-coding-poc/spec.md), map ticket 10.

**Blocked by:** 11 (Seeing the agent work).

**Status:** ready-for-agent

- [x] Spike first (spec §13.5): find a late-note hook on the trigger path of `@strudel/web@1.3.0`; record the outcome
- [x] Per Turn: timestamps for Enter, first streamed character, landed, heard (agent Apply's cycle boundary, separate); calls, retries, input/output/cache-read/cache-write tokens; ending
- [x] `PerformanceObserver` on `longtask` and a late-note count, each entry marked with whether a Turn was running
- [x] Façade `downloadLog()` and a download control in the peek produce the JSON

## Comments

**Implemented (2026-09-30).**

**Spike outcome (spec §13.5):** a hook exists. `webaudioRepl` spreads `initStrudel`'s options over `{ defaultOutput: webaudioOutput }`, so passing our own `defaultOutput` puts a wrapper on the trigger path just before superdough, which drops a note whose time is before `currentTime` (`cannot schedule sounds in the past`). **But that hook alone would be blind.** Measured in headless Chromium, playing `s("hh*16")`, with main-thread stalls of 60, 150, 300 and 600 ms: the output hook saw 0 late notes each time. The default cyclist dropped 0, 1, 3 and 8 whole ticks instead. Its clock callback skips a tick whose time has passed (`console.log("skip query: too late")`) before querying it, so those notes never reach the trigger path. A note that does reach it is 100–200 ms ahead of the audio clock, so it is almost never late there. So the late-note count covers both places a late note is lost:

- **`output`**: the spec's definition, through the `defaultOutput` wrapper (`lateAtOutput`). `lateBy` is how far past the note's time it arrived.
- **`scheduler`**: each note in a tick the scheduler skipped. Strudel only logs the skip, so `watchSkippedTicks` listens to `console.log` for that exact line and queries the playing pattern over the tick's arc (`scheduler.lastBegin`–`lastEnd`, set before the check) for onsets. `lateBy` is how far past the tick's time (`lastTick`) the scheduler got to it. These are internals of the pinned `@strudel/web@1.3.0` bundle, declared in `src/types/strudel-web.d.ts`.

The implementation:

- **`Instrumentation`** (`src/core/Instrumentation.ts`): kept in memory for the session. `began(instruction, aim)` stamps Enter and returns the Turn's record id. `record(id, event)` takes `Streamed` (only the first counts), `Called`, `Used` (tokens, summed), `Ended` (ending and retries; `landed` is stamped too when the ending is `landed`), and `Heard`. `log` returns `{ turns, longTasks, lateNotes }`. The layer also collects `Page.longTasks` and `Strudel.lateNotes`, marking each with `duringTurn`: whether any Turn ran at some point between the stall's start and its end, from Enter until the Turn ended. `downloadLog` hands the log over through `Page.download` as `mass-hallucination-log-<ISO time>.json`.
- **Times** are epoch milliseconds from Effect's `Clock` (Turns) and from the host (late notes: `Date.now()`; long tasks: `startTime` moved onto the wall clock by `Date.now() - performance.now()` when the entries arrive, since `timeOrigin + startTime` drifts from `Date.now()` over hours or a sleep), so they share one timeline. Anything that hasn't happened is `null`.
- **The Agent** calls `began` before it waits for the running Turn to stop, so Enter is when the Instruction was sent. Each request records `Called`. The first non-empty text or tool input records `Streamed`, and each `Usage` records `Used`. An ending records `Ended` whenever the Turn's view first reaches an ending state, whether from inside the Turn or from `stop`/supersession.
- **Heard:** `changeParts(input, onLanded, onHeard)` passes `onHeard` through `land` to `AgentApplies.schedule`, which runs it once the Apply at the cycle boundary has evaluated successfully. `LiveCodeStore.apply` now succeeds with whether it evaluated, so an Apply that does nothing (the human took the Part back in that last cycle) records no `heard`. It is recorded against the Turn even after the Turn has ended.
- **Tokens:** the live `Model` emits a `Usage` event at `message_start` and at `message_delta`, each carrying what was used since the last one. The API's running totals are turned into increments, and a count it leaves out is taken as unchanged. A stopped request still counts its input.
- **`Page`** (`src/core/Page.ts`, live in `src/facade/live/page.ts`): a new host service beside the editor, the repl and the model. `longTasks` comes from a `PerformanceObserver` on `longtask`, and `download` from an object-URL link. `createFacade` now takes it in the host layer.
- **UI:** the façade gains `downloadLog()`. The peek has a "download log (Alt-L)" button, and Alt-L does the same from the editor (ADR 0007: every mouse control is also a key).
- **Tests:** `Agent.test.ts` (Enter/first character/landed/ended with TestClock, calls, retries and summed tokens, superseded and stopped endings, heard at the cycle boundary after the Turn). `model.test.ts` covers the usage increments. `facade.test.ts` covers the downloaded JSON, with long tasks and late notes marked by whether a Turn ran. `strudel.test.ts` covers `lateAtOutput`. Browser tests cover a real 500 ms stall showing as scheduler late notes, a real 120 ms block showing as a long task, and Alt-L.

Decisions beyond the spec:

- **Late notes include the scheduler's skipped ticks** (above), each entry saying `where` it was lost. Without them the "0 late notes" row of §12.5 would pass by construction.
- **`duringTurn` is by overlap**, so a long task that began before Enter and ran into the Turn counts as during it. The observer reports a task only after it ends, so marking it when the report arrives would be wrong.
- **`retries` is the Turn's own count** (as the status line shows it), so a Turn out of retries logs 4 calls and 3 retries.
- **Alt-L** is the key for the peek's download control. It works whether or not the peek is open.

Known limits:

- **Esc → stopped (≤ 200 ms) can't be read from the log.** `ended` is stamped once the Turn's fiber has stopped, but the Esc press isn't recorded. §11 doesn't ask for it.
- **A late note from the scheduler is placed when it was detected**, just after the stall, not at the tick it was due. `duringTurn` for it is judged at that moment.
- **A skipped tick's notes** are counted by querying the pattern again, once per skipped tick. That work lands on a main thread that is already late. It happens only after a stall, and never in steady play.
- **Watching skipped ticks replaces `console.log`** for as long as the repl lives. The replacement passes every call through and is restored when the Strudel layer is released.
- **Relies on bundle internals** (`lastTick`/`lastBegin`/`lastEnd`/`pattern`, and the exact log line). They hold for the pinned 1.3.0. A version bump must re-check them. The browser stall test would catch the log line changing.
- A backgrounded tab throttles the scheduler's timer to about once a second, which shows up as scheduler late notes too. It is a real dropout, but not one the agent caused.
- Not yet checked by eye in the running app: download a log after a real Turn and read it.

