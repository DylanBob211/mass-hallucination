/**
 * The part of `@strudel/web@1.3.0` the host uses. The package ships no types; these are read from
 * its source (`web.mjs`, `@strudel/core@1.2.6` `repl.mjs` and `cyclist.mjs`, research 01).
 */
declare module "@strudel/web" {
  export interface Repl {
    /**
     * Resolves to the new pattern, or to `undefined` when the code failed: user-code errors never
     * reject, they land in `state.evalError`. Rejects only for empty code.
     */
    evaluate(code: string, autostart?: boolean): Promise<unknown>;
    /** Stops scheduling and resets the cycle count to 0. */
    stop(): void;
    readonly scheduler: {
      readonly started: boolean;
      /** Also moved by `setcps` in evaluated code, without any notification. */
      readonly cps: number;
      /** Fractional cycles; 0 while stopped. */
      now(): number;
      /**
       * Internals of the default cyclist, set on each tick before it checks whether it is too
       * late: the tick's time on the audio clock, and the cycles it queries.
       */
      readonly lastTick: number;
      readonly lastBegin: number;
      readonly lastEnd: number;
      /** How far ahead of a tick's time, in seconds, its notes are played. */
      readonly latency: number;
      /** The pattern it plays, once one is set. */
      readonly pattern?: Pattern;
    };
    readonly state: { readonly evalError?: { readonly message: string } };
  }

  /** Builds the repl and resolves once its eval scope is loaded. */
  export function initStrudel(options?: Record<string, unknown>): Promise<Repl>;
  /** Puts each module's exports on `globalThis`, where evaluated code finds them. */
  export function evalScope(...modules: ReadonlyArray<Record<string, unknown>>): Promise<unknown>;
  /** Resolves once audio is initialised, which happens on the first `mousedown` on `document`. */
  export function initAudioOnFirstClick(): Promise<void>;
  export function getAudioContext(): AudioContext;
  /**
   * The repl's default output: plays `hap` through superdough at `time` on the audio clock, or
   * drops it if `time` has passed. `initStrudel`'s `defaultOutput` option replaces it.
   */
  export function webaudioOutput(
    hap: unknown,
    deadline: number,
    duration: number,
    cps: number,
    time: number,
  ): Promise<void>;

  /** A pattern of events. Controls such as `size` are methods, registered at load. */
  export class Pattern {
    /** The events in `state`'s span. Throws what the pattern throws, where `queryArc` logs it. */
    query(state: State): ReadonlyArray<unknown>;
    /** The events from cycle `begin` to `end`, logging and swallowing what the pattern throws. */
    queryArc(begin: number, end: number): ReadonlyArray<Hap>;
    /** Registers the pattern under `id`; replaced by the repl on every evaluate. */
    p: (this: Pattern, id: unknown) => Pattern;
    /** Plays the pattern on the repl's scheduler. */
    play: (this: Pattern) => Pattern;
  }
  /** An event: its value, such as `{ s: "bd" }`, over its whole span, in cycles (`Fraction`s). */
  export interface Hap {
    /** A continuous signal's event has none. */
    readonly whole?: { readonly begin: unknown; readonly end: unknown };
    readonly value: unknown;
    /** Whether it starts within the span queried. */
    hasOnset(): boolean;
  }
  /** What a query asks for: a span of cycles. */
  export interface State {
    readonly span: TimeSpan;
  }
  export const State: new (span: TimeSpan) => State;
  export interface TimeSpan {
    readonly begin: unknown;
    readonly end: unknown;
  }
  export const TimeSpan: new (begin: number, end: number) => TimeSpan;
  export const silence: Pattern;
  export function stack(...patterns: ReadonlyArray<Pattern>): Pattern;
  export function isPattern(value: unknown): value is Pattern;
  /** Whether `name` is a registered control or one of its synonyms. */
  export function isControlName(name: string): boolean;
  /** Turns Strudel code into JavaScript: strings to mini-notation, labels to `.p(label)`. */
  export function transpiler(
    code: string,
    options?: Record<string, unknown>,
  ): { readonly output: string };
  /**
   * superdough's latest samples, `type` `"time"`, of the analyser that `.analyze(id)` feeds, any
   * string `id` (spike, ticket 14); `undefined` before a note with it has played.
   */
  export function getAnalyzerData(type: "time", id: string): Float32Array | undefined;
  /** Whether `name` is a note name such as `eb3`. */
  export function isNote(name: string): boolean;
  /** The MIDI number of a note name; throws for anything else. */
  export function noteToMidi(name: string): number;
  /** The playing pattern, as last handed to the scheduler. */
  export function getPattern(): Pattern | undefined;
}
