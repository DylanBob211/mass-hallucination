import { readLabel } from "../../core/Performance";

/**
 * The four helpers a Visual Part's body sees besides Hydra's names (spec §8): `cycle()`,
 * `pulse(p)`, `value(p, ctl)` and `level(p)`. Each follows what is heard: the scheduler queues
 * notes ahead of the audio clock, and the speaker plays the clock behind, so they read the
 * patterns at the cycle reaching the speaker now.
 */
export interface AudioLinkedHelpers {
  /** The cycle heard now; 0 while stopped. */
  readonly cycle: () => number;
  /** 1 on each onset of the Part's pattern as it is heard, decaying to 0. */
  readonly pulse: (part: unknown) => number;
  /** The control's value in the Part's event heard now, as a number; 0 between events. */
  readonly value: (part: unknown, control: unknown) => number;
  /** The Part's heard loudness, 0..1, from its `.analyze(part)`. */
  readonly level: (part: unknown) => number;
}

/**
 * What the helpers read of Strudel's scheduler (`cyclist.mjs`); internals of 1.3.0. This and
 * `Hap` are narrower than `@strudel/web`'s declarations, so Node tests can fake them.
 */
export interface Scheduler {
  readonly started: boolean;
  readonly cps: number;
  /** The cycle its last tick began at, and the audio time it was for. */
  readonly lastBegin: number;
  readonly lastTick: number;
  /** How far ahead of a tick's time, in seconds, its notes are played. */
  readonly latency: number;
}

/** An event of a pattern, as Strudel's `queryArc` gives it. */
export interface Hap {
  /** Its whole span, in cycles; a continuous signal's has none. */
  readonly whole?: { readonly begin: unknown };
  readonly value: unknown;
  /** Whether it starts within the span queried. */
  hasOnset(): boolean;
}

/** A pattern, as the helpers query it. */
export interface Queryable {
  queryArc(begin: number, end: number): ReadonlyArray<Hap>;
}

/** How long, in seconds, `pulse` takes to fall from 1 to 0 after an onset. */
const pulseDecay = 0.3;

/** The decibels below full scale, of a signal's RMS, at which `level` reaches 0. */
const levelRange = 48;

/** A span of cycles too short to hear, so a query reaching just past one cycle takes its events. */
const instant = 1e-9;

/** What the helpers follow. */
export interface Hearing {
  readonly scheduler: Scheduler;
  /** The audio clock's time the speaker plays now. */
  readonly audibleTime: () => number;
  /** The pattern of each heard Part, by identity. */
  readonly heard: () => ReadonlyMap<string, Queryable>;
  /** The latest samples of the analyser `.analyze(id)` feeds, if there is one. */
  readonly analyzerData: (id: string) => ArrayLike<number> | undefined;
  /** The MIDI number of a note name such as `eb3`, if it is one. */
  readonly noteToMidi: (name: string) => number | undefined;
}

export const audioLinkedHelpers = ({
  scheduler,
  audibleTime,
  heard,
  analyzerData,
  noteToMidi,
}: Hearing): AudioLinkedHelpers => {
  /** The cycle heard now, before any limit: negative before the first is heard. */
  const heardCycle = () =>
    scheduler.lastBegin + (audibleTime() - scheduler.latency - scheduler.lastTick) * scheduler.cps;

  /** The Part's pattern and the cycle heard now, if the Part is heard. */
  const heardNow = (part: unknown) => {
    if (!scheduler.started || typeof part !== "string") return undefined;
    const pattern = heard().get(part);
    const cycle = heardCycle();
    return pattern === undefined || cycle < 0 ? undefined : { pattern, cycle };
  };

  return {
    cycle: () => (scheduler.started ? Math.max(0, heardCycle()) : 0),
    pulse: (part) => {
      const now = heardNow(part);
      if (now === undefined) return 0;
      const { pattern, cycle } = now;
      const { cps } = scheduler;
      // The latest onset heard, if it was within the decay.
      let last: number | undefined;
      for (const hap of pattern.queryArc(cycle - pulseDecay * cps, cycle + instant)) {
        const begin = Number(hap.whole?.begin);
        if (hap.hasOnset() && begin <= cycle + instant && (last === undefined || begin > last))
          last = begin;
      }
      if (last === undefined) return 0;
      const elapsed = Math.max(0, (cycle - last) / cps);
      return Math.max(0, 1 - elapsed / pulseDecay) ** 2;
    },
    value: (part, control) => {
      const now = heardNow(part);
      if (now === undefined || typeof control !== "string") return 0;
      const { pattern, cycle } = now;
      // Of the events sounding, as in a chord, the latest to start.
      let latest: Hap | undefined;
      for (const hap of pattern.queryArc(cycle, cycle + instant))
        if (latest === undefined || Number(hap.whole?.begin) > Number(latest.whole?.begin))
          latest = hap;
      const value: unknown =
        typeof latest?.value === "object" && latest.value !== null
          ? (latest.value as Record<string, unknown>)[control]
          : undefined;
      if (typeof value === "number") return Number.isFinite(value) ? value : 0;
      if (typeof value !== "string" || value.trim() === "") return 0;
      const number = Number(value);
      return Number.isFinite(number) ? number : (noteToMidi(value) ?? 0);
    },
    level: (part) => {
      if (typeof part !== "string" || heardNow(part) === undefined) return 0;
      const samples = analyzerData(part);
      if (samples === undefined || samples.length === 0) return 0;
      let sum = 0;
      for (let index = 0; index < samples.length; index++) sum += (samples[index] ?? 0) ** 2;
      const decibels = 10 * Math.log10(sum / samples.length);
      return Math.min(1, Math.max(0, 1 + decibels / levelRange));
    },
  };
};

/**
 * Follows which pattern each heard Part plays (spec §13.1): give `beforeEval` and `afterEval` to
 * the repl. The repl puts its own `.p` on `prototype` before each evaluate, then calls
 * `beforeEval`, which wraps it to note each label's pattern; `afterEval` runs only once the
 * evaluate succeeded. Strudel's own `.p` still mutes and registers as it did.
 */
export const followParts = <P extends Queryable>(prototype: { p: (this: P, id: unknown) => P }) => {
  let labelled = new Map<string, P>();
  let heard: ReadonlyMap<string, P> = new Map();
  return {
    beforeEval: () => {
      labelled = new Map();
      const { p } = prototype;
      const noted = labelled;
      prototype.p = function (id) {
        const result = p.call(this, id);
        if (typeof id === "string") noted.set(id, this);
        return result;
      };
    },
    afterEval: () => {
      heard = heardParts(labelled);
    },
    heard: () => heard,
  };
};

/**
 * The Parts heard of those `labelled` in an evaluate, by identity: none muted, and only the
 * soloed ones while one is. Solo is Strudel's rule (`repl.mjs`), over every label it registered,
 * anonymous ones included; the identities are the parser's.
 */
const heardParts = <P>(labelled: ReadonlyMap<string, P>) => {
  const registered = [...labelled].filter(
    ([label]) => !label.startsWith("_") && !label.endsWith("_"),
  );
  const soloing = registered.some(([label]) => label.length > 1 && label.startsWith("S"));
  const heard = new Map<string, P>();
  for (const [label, pattern] of registered) {
    const marks = readLabel(label);
    if (marks !== undefined && (!soloing || marks.soloed)) heard.set(marks.id, pattern);
  }
  return heard;
};

/**
 * The audio clock's time the speaker plays at `now` (`performance.now()`): the context's last
 * output timestamp, moved on to `now`. Before the context has output one, its current time less
 * the latencies after it. In Chromium both agree within 2 ms (spike, ticket 14).
 */
export const audibleTimeOf = (
  context: Pick<AudioContext, "currentTime" | "baseLatency" | "outputLatency"> & {
    getOutputTimestamp(): AudioTimestamp;
  },
  now: number,
) => {
  const { contextTime, performanceTime } = context.getOutputTimestamp();
  if (contextTime !== undefined && performanceTime !== undefined && performanceTime > 0)
    return contextTime + (now - performanceTime) / 1000;
  return context.currentTime - context.baseLatency - context.outputLatency;
};
