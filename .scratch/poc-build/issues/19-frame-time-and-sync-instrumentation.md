# 19: Frame-time and sync instrumentation

**What to build:** The log also records frame stutter after each Apply and an onset-to-flash sync estimate, so the visual rows of the budget can be judged. See [spec §11 items 3–4](../../ai-live-coding-poc/spec.md).

**Blocked by:** 12 (Turn and no-freeze instrumentation), 14 (Audio-linked helpers).

**Status:** ready-for-agent

- [x] Frame times for the second after each Apply, with the number of Visual Parts
- [x] Onset-to-flash estimate from scheduler time vs `AudioContext.outputLatency` vs `requestAnimationFrame`
- [x] Both included in the downloaded JSON
- [x] A short note on how to do the one-off slow-motion film check

## Comments

**Implemented (2026-10-01).** Nobody has done the film check yet (below), and nobody has read a real log's `frameTimes` and `syncs` by eye in the dev app.

The log gains two arrays: `frameTimes` and `syncs`.

**`frameTimes`** has one entry for each Apply that evaluated, human or agent:

- `at` is when the Apply began to evaluate, in epoch ms.
- `visualParts` counts the Visual Parts drawing after it: none muted, and only the soloed ones while one is.
- `frames` are the gaps between frames in ms, to 0.1 ms. They run from the last frame before `at` until `at + 1000`, so the first gap spans the evaluate itself.
- `longest` is the largest gap.
- `dropped` counts the frames the gaps left out. One frame is the median gap in the second *before* the Apply, which is the rate the display ran at. For example, a 50 ms gap at 60 Hz is 2 dropped frames. Falling to a steady 30 fps counts too: the window's own median would hide it (found in review). With no frames before the Apply, the window's own median is used instead.

So the row "≤ 1 dropped frame, never > 100 ms" reads straight off `dropped` and `longest` for the entries with `visualParts: 4`.

- `LiveCodeStore` gains an `applied` stream. Each Apply that evaluated publishes `{ at, code }` on it, with `at` stamped just before the evaluate. A failed Apply publishes nothing. So does an agent Apply on a stopped transport, which evaluates nothing.
- `Page` gains `frames(from, to)`. `Instrumentation` asks it for the frames from 1 s before the Apply until 1 s after. `PageLive` keeps the times of the last 5 s of frames from its own `requestAnimationFrame` loop, and waits until `to` before it answers. Each frame is timed by `performance.now()` when its callback runs. rAF's own timestamp is when the frame was due, so a frame a stall held up would show no gap (found in the browser test). The times move onto the wall clock the way long tasks do.
- `Instrumentation` watches each Apply's second in its own fiber, so Applies close together each get their own window.

**`syncs`** has one onset-to-flash estimate about once a second while playing. Each entry has:

- `at`: when the estimate was taken, in epoch ms.
- `lead`: how far ahead of the audio clock the scheduler queued the onset.
- `outputLatency` and `baseLatency`: the context's reported latencies.
- `onsetToFlash`: from when the speaker plays the onset until the first frame whose audio-linked helpers see it.

All are in ms.

- **Heard** is the spec's sum: scheduler time + `outputLatency` + `baseLatency`, put on `performance.now()` through `currentTime` when the onset is queued.
- **Flash** is the first rAF callback where `audibleTimeOf` (the helpers' clock, from `getOutputTimestamp`) has reached the onset. That is when `pulse` first jumps.
- So `onsetToFlash` is frame quantisation and jank, plus however far the helpers' clock is from the reported latencies. A first version took "heard" from `getOutputTimestamp` too, which would only have measured itself.
- `src/facade/live/sync.ts` (`sampleSync`) does this. The repl's output gets it through `withOnsets`, which passes on each onset's audio time (the cyclist only triggers events with an onset) and drops anything it throws, so a note is never lost to the instrumentation. It takes one onset at a time, at most one a second. It gives up on an onset if no frame sees it within 2 s, which covers a suspended context, a hidden tab and a stall over 2 s. `Strudel` gains a `syncs` stream.
- **In Chromium this is close to circular.** Ticket 14 found `getOutputTimestamp` agrees with `currentTime − latencies` to within 2 ms. So `onsetToFlash` mostly shows frame quantisation and jank. It can't catch an `outputLatency` that is wrong, and it doesn't include the time from Hydra's draw to the panel. **The ±40 ms row (§12.4) can only be judged by the film check.** The estimate is still worth having: it catches jank, and any browser or device where the two clocks drift apart.

**Tests:**

- `facade.test.ts` checks frame times, Visual Parts and `dropped` in the downloaded JSON. It also checks that only soloed Visual Parts count and that a failed Apply is not recorded, and that sync estimates come through.
- `facade.test.ts` also checks that 30 fps after a 60 Hz second counts as dropped frames.
- `sync.test.ts` (Node, fake clocks and frames) checks the estimate, one-a-second sampling, giving up (a suspended context, and a first frame over 2 s late), and the case where the output timestamp puts the speaker later than the latencies do.
- `strudel.test.ts` checks that `withOnsets` plays the note even when the hook throws.
- Browser tests check that a real 120 ms stall shows as a gap ≥ 120 ms in `frames`, and that real playback yields 2–3 estimates in 2.5 s. In headless Chromium `outputLatency` read 304, then 424 ms, and `onsetToFlash` read 55 and 111 ms. Headless audio isn't a real sink, so the test only checks that an estimate was taken. Judging ±40 ms needs real Chrome on real speakers.

Decisions beyond the spec:

- **Every Apply that evaluated is recorded**, audio-only ones too (`visualParts: 0`). It's cheap, and it gives a baseline to compare against.
- **The window starts when the evaluate begins**, not when it ends. The stutter is the evaluate, mostly Hydra compiling shaders. A window starting after the evaluate would miss it.
- **The agent's dry-run is not in the window.** It runs before the Apply, and the long-task monitor already covers its stalls.
- **One onset a second, from any audio Part.** All Parts share one clock, so the Part a Visual Part follows needs no special case.

Known limits:

- **The display's own delay is not in `onsetToFlash`.** That covers the compositor, vsync and the panel, usually 1–3 frames. Only the film check sees it.
- **A hidden tab draws no frames.** Its `frames` come back empty or nearly so, and its sync estimates give up.
- **`dropped` takes the median gap of the second before as one frame.** If that second stuttered too, for example right after another Apply, it under-counts. `frames` is there to check by eye.
- **A gap that crosses the end of the window is cut off.** It ends after `at + 1000`, so it isn't in `frames`. If it is over 50 ms, the long-task monitor still records it.
- The mute/solo rule for Visual Parts is now written twice: once in `Instrumentation` (counting) and once in `visuals.ts` (drawing). They work on different shapes, so I left them separate. A shared helper in `Performance.ts` would be the next tidy-up.

### The one-off film check (spec §11 item 4)

Do this once, on the laptop and speakers used for the acceptance runs (§12), in real Chrome:

1. Play a kick and a full-screen white flash that follows it:
   ```js
   samples('github:tidalcycles/dirt-samples')
   setcps(0.5)
   kick: s("bd*4")
   flash: hydra`solid(() => pulse('kick'), () => pulse('kick'), () => pulse('kick')).out()`
   ```
2. Film the screen and the speaker together in slow motion, at 240 fps if the phone can (4.2 ms a frame). Keep the phone's microphone within about 30 cm of the speaker, since sound takes about 1 ms per 34 cm. Film at least 10 kicks, then download the log (Alt-L).
3. Open the raw clip in a video editor that steps frame by frame at the real frame rate and shows the audio waveform. Don't use the phone's slowed-down playback. For each kick, note the frame where the kick's attack starts in the waveform, and the first frame where the screen brightens.
4. Onset-to-flash = (flash frame − kick frame) × 1000 / fps. Take the mean and the spread over the kicks. **Pass (§12.4): within ±40 ms.**
5. Compare the result with the log's `syncs` entries from the same minute. The filmed figure should be about `onsetToFlash` plus 1–3 display frames. If it differs by much more, the context's reported `outputLatency` is wrong for that output (Bluetooth is the usual culprit). Record both figures, and the output device, here.

