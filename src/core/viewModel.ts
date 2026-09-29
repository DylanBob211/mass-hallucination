/**
 * What the UI renders from: one immutable object, replaced whole on each update, with the
 * references of unchanged sub-objects reused (ADR 0006). Plain types only, no Effect, so the UI may
 * import it. Empty until the Performance model lands; later tickets add its fields (spec §10).
 */
export type ViewModel = Readonly<Record<string, never>>;

export const emptyViewModel: ViewModel = Object.freeze({});
