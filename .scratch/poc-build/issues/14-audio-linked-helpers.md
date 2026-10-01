# 14: Audio-linked helpers

**What to build:** A Visual Part can follow the music: `cycle()`, `pulse('part')`, `value('part','ctl')` and `level('part')` track what is heard. See [spec §8 helpers](../../ai-live-coding-poc/spec.md).

**Blocked by:** 13 (Hydra canvas and the `hydra` tag).

**Status:** ready-for-agent

- [x] Spikes first (spec §13.1, §13.2): wrapping `Pattern.prototype.p` in `beforeEval` collects label → pattern; string ids work in `.analyze('kick')` / `getAnalyzerData`. Record outcomes
- [x] `cycle()` follows the Strudel cycle position and `setcps`
- [x] `pulse(p)` is 1 on each onset of the Part's live pattern, decaying to 0; `value(p, ctl)` gives the control's current value; both compensate the scheduler's ~100 ms lead
- [x] `level(p)` gives heard loudness 0..1 from `.analyze('p')`
- [x] All four give 0 for a muted or soloed-out Part
- [ ] Manually verified: a Visual Part pulses with `kick`

## Comments

**Implemented (2026-10-01).** The by-eye check is still open: someone needs to watch a Visual Part pulse with `kick` in the dev app.

**Spike outcomes (spec §13.1, §13.2)**, checked in headless Chromium against the pinned bundle:

- **§13.1 holds.** On every evaluate the repl reinstalls its own `Pattern.prototype.p` and then calls `beforeEval`. A wrapper installed there sees every label, muted ones included, together with its pattern. `afterEval` runs only after an evaluate succeeds, so a failed Apply leaves the helpers following what still plays.
- **§13.2 holds.** After `note("c2*4").s("sine").analyze('kick')`, `getAnalyzerData('time', 'kick')` gave 4096 samples, peaking at 0.14. superdough keys its analysers by any value, so string ids are fine. With `bd` there was no analyser, because no samples were loaded.
- **Audible time.** `getOutputTimestamp()`, moved on to `performance.now()`, agreed with `currentTime − outputLatency − baseLatency` to within 2 ms. In headless Chromium the output latency was 88 ms and the base latency 12 ms.

What was built:

- **`src/facade/live/audioLinked.ts`** contains three pieces:
  - `followParts(Pattern.prototype)` gives the repl its `beforeEval`/`afterEval` and keeps a map from each heard Part's identity to its pattern. It applies Strudel's own rules from `repl.mjs`: muted labels never register, and while any label is soloed, only soloed labels count. The identities come from the parser's `readLabel`.
  - `audioLinkedHelpers` builds the four helpers. They read the scheduler's fields (`lastBegin`, `lastTick`, `latency`, `cps`, `started`) when called, so they follow `setcps`.
  - `audibleTimeOf(context, now)` gives the audio time the speaker is playing now.
- **How "what is heard" is worked out.** The scheduler plays cycle `c` at audio time `(c − lastBegin)/cps + lastTick + latency`. That is the exact inverse of `cyclist.mjs`'s `targetTime`, so the heard cycle is `lastBegin + (audible − latency − lastTick)·cps`. This covers the scheduler's 100 ms lead and the output latency too.
  - `cycle()` is that heard cycle: 0 while stopped and before the first note is heard.
  - `pulse(p)` is `(1 − t/0.3 s)²`, where `t` is the time since the Part's latest onset heard. So it is 1 at the onset and 0 after 0.3 s.
  - `value(p, ctl)` is the control's value in the event sounding now. If several events sound, as in a chord, it takes the one that started last. Between events it is 0.
  - `level(p)` is the RMS of the Part's analyser samples on a −48..0 dBFS scale, mapped to 0..1.
  - All three Part helpers give 0 for a Part not heard (muted, soloed out, unknown or not a string) and while stopped.
- **Wiring.** `boot` builds the helpers next to the repl and passes them to `createVisuals`. `hydraScope` takes them as a third set of names, looked up after Hydra's and before names the body assigns. That is the same order as the visual dry-run, whose stubs are unchanged.
- **Tests.**
  - `audioLinked.test.ts` (Node, fake scheduler and patterns) covers lead compensation and tempo for `cycle`, onset and decay for `pulse`, a queued-but-not-yet-heard onset, `value` between events and on note names, the `level` scale, not-heard and stopped cases, `followParts` with mute, solo and a failed evaluate, and `audibleTimeOf`.
  - `visuals.browser.test.ts` (real bundle, read from screenshots) checks that a Visual Part's helpers follow a playing Part, and that they give 0 when that Part is muted or soloed out.
  - I broke the wiring twice (dropped `afterEval`; let muted Parts through) to confirm the browser tests fail.

Decisions beyond the spec:

- **`value` gives numbers.** Numeric strings are parsed, note names such as `eb3` become MIDI numbers (Strudel's `isNote`/`noteToMidi`), and anything else is 0. A Hydra parameter needs a number, and the dry-run already refuses a function that returns anything else.
- **`value` is 0 between events**, rather than holding the last value, because nothing of that Part is heard then.
- **The pulse decay (0.3 s, squared) and the `level` floor (−48 dBFS)** are my own choices. Both are constants in `audioLinked.ts`, so change them freely.
- **Output latency is compensated as well as the scheduler's lead.** "Follows what is heard" means what the speaker plays. Ticket 19 measures how far off that still is.

Known limits:

- **`all(...)` and `each(...)` are not followed.** The helpers read each Part's pattern as `.p` got it, before the repl applies those transforms.
- **The switch to the new patterns comes early.** It happens at `afterEval`, while about 150–250 ms of the old pattern is still queued. For that moment `pulse` and `value` follow the new pattern.
- **A `setcps` change jumps for about 0.25 s.** The heard cycle is projected back from the newest tick using the new tempo, while the notes already queued use the old one.
- **`level` is about one output latency early.** The analyser reads what is being rendered now, not what the speaker is playing.
- **Solo follows Strudel's rule across every audio label**, anonymous `S$:` included. That matches what is heard. A Visual Part never registers with the repl, so soloing one never silences audio, as before.
- **ADR 0002's "zero patches"**: `followParts` wraps Strudel's `Pattern.prototype.p` at run time on every evaluate, as spec §8 asked. Like ticket 12's `defaultOutput` and `console.log` wraps, it changes no files, but it relies on 1.3.0 internals (`beforeEval` running after the `.p` injection, and `scheduler.latency`/`lastBegin`/`lastTick`).
