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
    };
    readonly state: { readonly evalError?: { readonly message: string } };
  }

  /** Builds the repl and resolves once its eval scope is loaded. */
  export function initStrudel(options?: Record<string, unknown>): Promise<Repl>;
  /** Resolves once audio is initialised, which happens on the first `mousedown` on `document`. */
  export function initAudioOnFirstClick(): Promise<void>;
  export function getAudioContext(): AudioContext;

  /** A pattern of events. Controls such as `size` are methods, registered at load. */
  export class Pattern {
    /** The events in `state`'s span. Throws what the pattern throws, where `queryArc` logs it. */
    query(state: State): ReadonlyArray<unknown>;
    /** Registers the pattern under `id`; replaced by the repl on every evaluate. */
    p: (this: Pattern, id: unknown) => Pattern;
    /** Plays the pattern on the repl's scheduler. */
    play: (this: Pattern) => Pattern;
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
  /** The playing pattern, as last handed to the scheduler. */
  export function getPattern(): Pattern | undefined;
}
