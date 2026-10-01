import { describe, expect, it } from "vitest";
import type { Sync } from "../../core/Strudel";
import { sampleSync } from "./sync";

/**
 * A page whose audio clock reads `now / 1000` and whose speaker plays it 100 ms behind by its
 * latencies (88 ms output, 12 ms base), and `outputTimestampBehind` seconds behind by its output
 * timestamp, with frames drawn when the test says. Suspended, its audio
 * clock stands still. The wall clock is the page's clock moved on by a day.
 */
const page = (outputTimestampBehind = 0.1) => {
  let now = 1000;
  let suspended = false;
  let waiting: Array<() => void> = [];
  const synced: Array<Sync> = [];
  const context = {
    get currentTime() {
      return suspended ? 1 : now / 1000;
    },
    outputLatency: 0.088,
    baseLatency: 0.012,
    getOutputTimestamp: () => ({
      contextTime: suspended ? 0.9 : now / 1000 - outputTimestampBehind,
      performanceTime: now,
    }),
  };
  const onset = sampleSync(
    {
      audioContext: () => context,
      now: () => now,
      wallClock: () => now + 86_400_000,
      frame: (draw) => waiting.push(draw),
    },
    (sync) => synced.push(sync),
  );
  return {
    onset,
    synced,
    /** Moves the clocks on to `at` and draws a frame. */
    frame: (at: number) => {
      now = at;
      const drawing = waiting;
      waiting = [];
      for (const draw of drawing) draw();
    },
    at: (at: number) => {
      now = at;
    },
    suspend: () => {
      suspended = true;
    },
    get waiting() {
      return waiting.length;
    },
  };
};

describe("sampleSync", () => {
  it("times the first frame that sees an onset from when the speaker plays it", () => {
    const p = page();

    // Queued 200 ms ahead; the speaker plays it at 1300 ms.
    p.onset(1.2);
    p.frame(1100);
    p.frame(1290);
    p.frame(1310);

    expect(p.synced).toEqual([
      { at: 1310 + 86_400_000, lead: 200, outputLatency: 88, baseLatency: 12, onsetToFlash: 10 },
    ]);
    expect(p.waiting).toBe(0);
  });

  it("shows where the output timestamp puts the speaker later than the latencies say", () => {
    const p = page(0.15);

    p.onset(1.2);
    p.frame(1340);
    p.frame(1360);

    expect(p.synced).toMatchObject([{ onsetToFlash: 60 }]);
  });

  it("takes one onset a second, and none while one is being timed", () => {
    const p = page();

    p.onset(1.2);
    p.at(1100);
    p.onset(1.3);
    p.frame(1300);
    p.at(1900);
    p.onset(2.1);
    p.at(2000);
    p.onset(2.2);
    p.frame(2310);

    expect(p.synced.map(({ lead }) => lead)).toEqual([200, 200]);
  });

  it("gives up on an onset the speaker has not played after two seconds", () => {
    const p = page();
    p.suspend();

    p.onset(1.2);
    p.frame(2000);
    p.frame(3001);
    p.onset(1.2);

    expect(p.synced).toEqual([]);
    expect(p.waiting).toBe(1);
  });

  it("gives up on an onset whose first frame came over two seconds later, as in a hidden tab", () => {
    const p = page();

    p.onset(1.2);
    p.frame(30_000);

    expect(p.synced).toEqual([]);
    expect(p.waiting).toBe(0);
  });
});
