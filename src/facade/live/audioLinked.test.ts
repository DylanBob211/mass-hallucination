import { describe, expect, it } from "vitest";
import {
  audibleTimeOf,
  audioLinkedHelpers,
  followParts,
  type Queryable,
  type Scheduler,
} from "./audioLinked";

/**
 * A scheduler whose last tick was for cycle 0 at audio time 0, which the cycle at audio time `t`
 * reaches `latency` seconds later: at 0.5 cycles per second, cycle 1 is heard at 2.1 s.
 */
const scheduler = (overrides: Partial<Scheduler> = {}): Scheduler => ({
  started: true,
  cps: 0.5,
  lastBegin: 0,
  lastTick: 0,
  latency: 0.1,
  ...overrides,
});

interface Event {
  readonly begin: number;
  readonly end: number;
  readonly value: unknown;
}

/** A pattern of `events`, queried as Strudel's are: an event cut by the query's start has no onset. */
const pattern = (...events: ReadonlyArray<Event>) => ({
  queryArc: (begin: number, end: number) =>
    events
      .filter((event) => event.begin < end && event.end > begin)
      .map((event) => ({
        whole: { begin: event.begin, end: event.end },
        value: event.value,
        hasOnset: () => event.begin >= begin,
      })),
});

/** `value` every quarter cycle, over the first `cycles` cycles. */
const fourToTheCycle = (cycles: number, value: unknown = { s: "bd" }) =>
  pattern(
    ...Array.from({ length: cycles * 4 }, (_, index) => ({
      begin: index / 4,
      end: (index + 1) / 4,
      value,
    })),
  );

/** The helpers, with the speaker playing audio time `audible.at` and `heard` Parts playing. */
const helpersHearing = (
  audible: { at: number },
  overrides: Partial<Scheduler> = {},
  heard: ReadonlyMap<string, Queryable> = new Map(),
  analysed: ReadonlyMap<string, ArrayLike<number>> = new Map(),
) =>
  audioLinkedHelpers({
    scheduler: scheduler(overrides),
    audibleTime: () => audible.at,
    heard: () => heard,
    analyzerData: (id) => analysed.get(id),
    noteToMidi: (name) => ({ c3: 48, eb3: 51 })[name],
  });

describe("cycle", () => {
  it("is the cycle heard now, behind the scheduler by its lead", () => {
    const audible = { at: 2.1 };
    const { cycle } = helpersHearing(audible);

    expect(cycle()).toBeCloseTo(1);
    audible.at = 2.6;
    expect(cycle()).toBeCloseTo(1.25);
  });

  it("follows the tempo the scheduler plays at", () => {
    const { cycle } = helpersHearing({ at: 2.1 }, { cps: 1, lastBegin: 4, lastTick: 1.1 });

    expect(cycle()).toBeCloseTo(4.9);
  });

  it("is 0 while stopped, and before the first cycle is heard", () => {
    expect(helpersHearing({ at: 2.1 }, { started: false }).cycle()).toBe(0);
    expect(helpersHearing({ at: 0.05 }).cycle()).toBe(0);
  });
});

describe("pulse", () => {
  // At 0.5 cycles per second the kick's onsets are heard every 0.5 s: cycle 1 at 2.1 s.
  const heard = new Map([["kick", fourToTheCycle(4)]]);

  it("is 1 when an onset of the Part is heard, and decays to 0 before the next", () => {
    const audible = { at: 2.1 };
    const { pulse } = helpersHearing(audible, {}, heard);
    const at = (time: number) => {
      audible.at = time;
      return pulse("kick");
    };

    expect(at(2.1)).toBeCloseTo(1);
    const soon = at(2.15);
    const later = at(2.25);
    expect(soon).toBeLessThan(1);
    expect(later).toBeGreaterThan(0);
    expect(later).toBeLessThan(soon);
    expect(at(2.5)).toBe(0);
    expect(at(2.6)).toBeCloseTo(1);
  });

  it("waits for the onset to be heard, though the scheduler has queued it", () => {
    // Cycle 1 is queued for 2.1 s; at 2.05 s the last onset heard was 0.45 s ago.
    expect(helpersHearing({ at: 2.05 }, {}, heard).pulse("kick")).toBe(0);
  });

  it("is 0 for a Part not heard, and while stopped", () => {
    expect(helpersHearing({ at: 2.1 }, {}, heard).pulse("hats")).toBe(0);
    expect(helpersHearing({ at: 2.1 }, {}, heard).pulse(7)).toBe(0);
    expect(helpersHearing({ at: 2.1 }, { started: false }, heard).pulse("kick")).toBe(0);
  });
});

describe("value", () => {
  // Heard at 0.5 cycles per second: cycle 0.5 at 1.1 s, cycle 1 at 2.1 s.
  const heard = new Map([
    [
      "chords",
      pattern(
        { begin: 0, end: 0.5, value: { note: "c3", gain: 0.6, s: "sawtooth" } },
        { begin: 1, end: 2, value: { note: "eb3", gain: "0.4" } },
      ),
    ],
  ]);
  const at = (time: number, control: unknown, part: unknown = "chords") =>
    helpersHearing({ at: time }, {}, heard).value(part, control);

  it("is the control's value in the event heard now", () => {
    expect(at(0.6, "gain")).toBe(0.6);
    expect(at(2.1, "gain")).toBe(0.4);
  });

  it("gives a note name as its MIDI number", () => {
    expect(at(0.6, "note")).toBe(48);
    expect(at(2.1, "note")).toBe(51);
  });

  it("waits for the event to be heard, though the scheduler has queued it", () => {
    expect(at(2.05, "note")).toBe(0);
  });

  it("is 0 between events, for a control the event lacks or that is not a number", () => {
    expect(at(1.6, "gain")).toBe(0);
    expect(at(0.6, "lpf")).toBe(0);
    expect(at(0.6, "s")).toBe(0);
  });

  it("is 0 for a Part not heard, and while stopped", () => {
    expect(at(0.6, "gain", "bass")).toBe(0);
    expect(helpersHearing({ at: 0.6 }, { started: false }, heard).value("chords", "gain")).toBe(0);
  });
});

describe("level", () => {
  const heard = new Map([["kick", fourToTheCycle(4)]]);
  /** A square wave of `amplitude`, as an analyser's samples. */
  const square = (amplitude: number) =>
    Float32Array.from({ length: 256 }, (_, index) => (index % 2 === 0 ? amplitude : -amplitude));
  const levelOf = (samples: ArrayLike<number> | undefined, overrides: Partial<Scheduler> = {}) =>
    helpersHearing(
      { at: 2.1 },
      overrides,
      heard,
      new Map(samples === undefined ? [] : [["kick", samples]]),
    ).level("kick");

  it("is the loudness of what the Part's analyser hears, 0..1", () => {
    expect(levelOf(square(1))).toBeCloseTo(1);
    const loud = levelOf(square(0.5));
    const quiet = levelOf(square(0.05));
    expect(loud).toBeLessThan(1);
    expect(quiet).toBeGreaterThan(0);
    expect(quiet).toBeLessThan(loud);
    expect(levelOf(square(0.001))).toBe(0);
    expect(levelOf(square(0))).toBe(0);
  });

  it("is 0 for a Part with no analyser", () => {
    expect(levelOf(undefined)).toBe(0);
  });

  it("is 0 for a Part not heard, and while stopped, whatever its analyser last held", () => {
    expect(
      helpersHearing({ at: 2.1 }, {}, new Map(), new Map([["kick", square(1)]])).level("kick"),
    ).toBe(0);
    expect(levelOf(square(1), { started: false })).toBe(0);
  });
});

describe("followParts", () => {
  /** Strudel's `Pattern.prototype`, whose `.p` the repl puts back before each evaluate. */
  const silence = pattern();
  const strudelP = function (this: Queryable, id: unknown) {
    return typeof id === "string" && (id.startsWith("_") || id.endsWith("_")) ? silence : this;
  };
  const prototype = { p: strudelP };
  const kick = pattern();
  const hats = pattern();
  const chords = pattern();

  /** An evaluate of Parts, label to pattern, as the repl runs it; `fails` skips `afterEval`. */
  const evaluate = (
    parts: ReturnType<typeof followParts>,
    labelled: ReadonlyArray<readonly [string, Queryable]>,
    fails = false,
  ) => {
    prototype.p = strudelP;
    parts.beforeEval();
    const results = labelled.map(([label, pattern]) => prototype.p.call(pattern, label));
    if (!fails) parts.afterEval();
    return results;
  };

  it("hears each Part labelled in the last evaluate, by identity, as Strudel's .p still does", () => {
    const parts = followParts(prototype);

    const results = evaluate(parts, [
      ["kick", kick],
      ["_hats", hats],
      ["chords_", chords],
    ]);

    expect(results).toEqual([kick, silence, silence]);
    expect(parts.heard()).toEqual(new Map([["kick", kick]]));
  });

  it("hears only the soloed Parts while one is", () => {
    const parts = followParts(prototype);

    evaluate(parts, [
      ["Skick", kick],
      ["hats", hats],
      ["_Schords", chords],
    ]);

    expect(parts.heard()).toEqual(new Map([["kick", kick]]));
  });

  it("keeps hearing what plays when an evaluate fails", () => {
    const parts = followParts(prototype);

    evaluate(parts, [["kick", kick]]);
    evaluate(parts, [["hats", hats]], true);

    expect(parts.heard()).toEqual(new Map([["kick", kick]]));
  });
});

describe("audibleTimeOf", () => {
  // Read from headless Chromium (ticket 14 spike).
  const context = {
    currentTime: 1.4977,
    baseLatency: 0.0116,
    outputLatency: 0.088,
    getOutputTimestamp: () => ({ contextTime: 1.3963, performanceTime: 2392.8 }),
  };

  it("is the audio time the speaker plays, from the context's last output timestamp", () => {
    expect(audibleTimeOf(context, 2396.5)).toBeCloseTo(1.4, 3);
  });

  it("is the current time less the latencies before the context has output", () => {
    const silent = { ...context, getOutputTimestamp: () => ({}) };

    expect(audibleTimeOf(silent, 2396.5)).toBeCloseTo(1.3981, 4);
  });
});
