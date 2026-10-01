import type { Sync } from "../../core/Strudel";
import { audibleTimeOf } from "./audioLinked";

/** The clocks an onset-to-flash estimate reads. */
export interface Clocks {
  /** The audio context that plays, read when an onset is taken. */
  readonly audioContext: () => Parameters<typeof audibleTimeOf>[0];
  /** `performance.now()`, the clock the audio-linked helpers read the audible time by. */
  readonly now: () => number;
  /** `Date.now()`, which the log is timed by. */
  readonly wallClock: () => number;
  /** `requestAnimationFrame`: runs `draw` with the next frame. */
  readonly frame: (draw: () => void) => void;
}

/** How long, in ms, after one onset is taken before the next is. */
const sampleEveryMillis = 1000;

/**
 * How long, in ms, an onset is waited for before it is given up on, as on a suspended context or
 * in a hidden tab.
 */
const giveUpAfterMillis = 2000;

/** `millis` to the tenth of a millisecond, as finer is noise. */
const tenths = (millis: number) => Math.round(millis * 10) / 10;

/**
 * Call the returned function with the audio time of each onset as the scheduler queues it.
 * About once a second it takes one, and gives `onSync` the onset-to-flash estimate (spec §11
 * item 4): from when the speaker plays the onset, by the scheduler's time and the context's
 * reported latencies, until the first frame that sees it as the audio-linked helpers do, by the
 * context's output timestamp when the frame runs. Where those two clocks disagree, the estimate
 * shows it.
 */
export const sampleSync = (
  { audioContext, now, wallClock, frame }: Clocks,
  onSync: (sync: Sync) => void,
) => {
  let timing = false;
  let last = -Infinity;
  return (time: number) => {
    const queuedAt = now();
    if (timing || queuedAt - last < sampleEveryMillis) return;
    timing = true;
    last = queuedAt;
    const context = audioContext();
    const { currentTime, outputLatency, baseLatency } = context;
    const lead = (time - currentTime) * 1000;
    const heardAt = queuedAt + lead + (outputLatency + baseLatency) * 1000;
    const wait = () => {
      frame(() => {
        const drawnAt = now();
        // No frame for that long, as in a hidden tab, says nothing about sync.
        if (drawnAt - queuedAt >= giveUpAfterMillis) {
          timing = false;
          return;
        }
        if (audibleTimeOf(context, drawnAt) < time) {
          wait();
          return;
        }
        timing = false;
        onSync({
          at: wallClock(),
          lead: tenths(lead),
          outputLatency: tenths(outputLatency * 1000),
          baseLatency: tenths(baseLatency * 1000),
          onsetToFlash: tenths(drawnAt - heardAt),
        });
      });
    };
    wait();
  };
};
