import type { Landed } from "./changeParts";
import type { DraftChange } from "./draft";

/** One change of the streamed draft (ADR 0007): its Part, and its text so far. */
export type { DraftChange } from "./draft";
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
  /**
   * The Source's Parts in Source order, re-derived on every edit (spec §4), then the deleted Parts
   * still sounding.
   */
  readonly parts: ReadonlyArray<PartView>;
  /** The error slot; `undefined` while empty. */
  readonly error: ErrorSlot | undefined;
  /** Where the agent's changes land (ADR 0003). */
  readonly autonomy: Autonomy;
  /** The next cycle boundary an agent Apply is waiting for; `undefined` while none waits. */
  readonly waitingApply: { readonly cycle: number } | undefined;
  /** The open Proposal (ADR 0003); `undefined` while none is open. */
  readonly proposal: ProposalView | undefined;
  /** This session's Turns, oldest first; the last is the running or latest one. */
  readonly turns: ReadonlyArray<TurnView>;
  /**
   * The running Turn's change as the model writes it (ADR 0007): each Part it changes, with its
   * text so far. `undefined` unless a change is being written or checked.
   */
  readonly draft: ReadonlyArray<DraftChange> | undefined;
}

/** The agent's work on one Instruction (CONTEXT.md), as the status line shows it. */
export interface TurnView {
  readonly instruction: string;
  /** The Part it was asked at, or `null` for all of them. */
  readonly aim: string | null;
  readonly state: TurnState;
  /**
   * What the model wrote in words on its latest call: the one-line note on what it is about to
   * do, or, once it has answered, its answer.
   */
  readonly note: string;
  /** How many times it retried a change `change_parts` refused. */
  readonly retries: number;
  /** How its change landed, once it has. */
  readonly landed?: Landed;
  /** What the dry-run warned of in the change that landed, each with its Part when known. */
  readonly warnings?: ReadonlyArray<string>;
  /** What went wrong, when the model or the network failed. */
  readonly error?: string;
}

/**
 * Where a Turn is (spec §10): working (`thinking`, `writing` its change, `dry-running` it), or how
 * it ended (spec §7).
 */
export type TurnState =
  | "thinking"
  | "writing"
  | "dry-running"
  | "landed"
  | "answered"
  | "superseded"
  | "stopped"
  | "timed out"
  | "out of retries"
  | "failed";

/** The states a Turn ends in. */
export const turnEndings: ReadonlySet<TurnState> = new Set<TurnState>([
  "landed",
  "answered",
  "superseded",
  "stopped",
  "timed out",
  "out of retries",
  "failed",
]);

/** An agent's change offered for review, as the inline diff shows it (ADR 0007). */
export interface ProposalView {
  /**
   * Each Part it changes, by identity or `(preamble)`, with its whole new text; `added` for a Part
   * the Source does not have, which goes at the end.
   */
  readonly changes: ReadonlyArray<{
    readonly part: string;
    readonly text: string;
    readonly added: boolean;
  }>;
  /** Its Parts were edited since it was made: it can only be dismissed. */
  readonly stale: boolean;
}

/**
 * How far an agent's change goes (CONTEXT.md): a Proposal, a write into the Source, or a write
 * that is then Applied. Set by the human only.
 */
export type Autonomy = "propose" | "write" | "apply";

/** A Part as the UI shows it; a deleted one as its Live code plays it. */
export interface PartView extends Pick<Part, "id" | "muted" | "soloed" | "surface"> {
  /** Written but not yet running (CONTEXT.md), a deletion included. */
  readonly unapplied: boolean;
  /** Gone from the Source but still sounding, until an Apply of every Part. */
  readonly deleted: boolean;
  /** A deleted Part's Live code: the text still sounding, shown as its ghost (ADR 0007). */
  readonly live?: string;
  /** A Visual Part's outputs, as the last dry-run of its exact text found them. */
  readonly outputs?: ReadonlyArray<VisualOutput>;
}

/**
 * The Performance's one error (spec §4): the latest failure, until a successful Apply clears it.
 * `part` is the identity of the Part it came from, or the Preamble's `(preamble)`, when known.
 */
export interface ErrorSlot {
  readonly message: string;
  /** Failed at evaluate, or while playing. */
  readonly phase: "eval" | "playback";
  readonly part?: string;
}

/** One of Hydra's four outputs, which a Visual Part writes with `.out()`. */
export type VisualOutput = "o0" | "o1" | "o2" | "o3";

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
  error: undefined,
  autonomy: "propose",
  waitingApply: undefined,
  proposal: undefined,
  turns: Object.freeze([]),
  draft: undefined,
});
