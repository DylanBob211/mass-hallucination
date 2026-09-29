import type { Part } from "./Performance";

/**
 * What the UI renders from: one immutable object, replaced whole on each update, with the
 * references of unchanged sub-objects reused (ADR 0006). Plain types only, no Effect, so the UI may
 * import it. Later tickets add fields (spec §10).
 */
export interface ViewModel {
  readonly transport: Transport;
  /** The whole cycle the scheduler is in; 0 while stopped. Host machinery, not Transport. */
  readonly cycle: number;
  /** The Source's Parts in Source order, re-derived on every edit (spec §4). */
  readonly parts: ReadonlyArray<PartView>;
}

/** A Part as the UI shows it. */
export type PartView = Pick<Part, "id" | "muted" | "soloed" | "surface">;

/** Whether the Performance is running, and at what tempo (CONTEXT.md). */
export interface Transport {
  readonly started: boolean;
  /** Cycles per second. */
  readonly cps: number;
}

/** Strudel's scheduler starts stopped at 0.5 cps. */
export const initialViewModel: ViewModel = Object.freeze({
  transport: Object.freeze({ started: false, cps: 0.5 }),
  cycle: 0,
  parts: Object.freeze([]),
});
