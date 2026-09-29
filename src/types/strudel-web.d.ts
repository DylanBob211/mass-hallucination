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
}
