import type { ErrorSlot, PartView } from "../facade/facade";

/**
 * How much code shows over the visuals (ADR 0007 amendment): all of it, only the Part in focus, or
 * none. The status line stays in every view, and keys keep working.
 */
export type CodeView = "all" | "focus" | "none";

const cycleOrder: Readonly<Record<CodeView, CodeView>> = {
  all: "focus",
  focus: "none",
  none: "all",
};

/** The view the performer chose with Alt-H. UI state, outside the view model (spec §10). */
export class CodeViewState {
  chosen = $state<CodeView>("all");

  /** Alt-H: all code → the Part in focus only → no code → all. */
  cycle() {
    this.chosen = cycleOrder[this.chosen];
  }
}

/**
 * The view shown: the one chosen, except that hidden code reveals itself for an open Proposal, and
 * only as far as the Part in focus, since accepting or rejecting it needs the diff in view.
 */
export const shownCodeView = (chosen: CodeView, proposalOpen: boolean): CodeView =>
  proposalOpen && chosen === "none" ? "focus" : chosen;

/** An error slot holding a Visual Part's error. */
export type VisualError = ErrorSlot & { readonly part: string };

/**
 * The error slot when it holds a Visual Part's error, which is also badged on that Part's label
 * line, or on a corner chip while the code is hidden (ADR 0007 amendment). The failure is already
 * on screen; the badge names the Part that caused it. The slot itself is returned, so its
 * reference holds while only the cycle changes.
 */
export const visualErrorOf = (
  error: ErrorSlot | undefined,
  parts: ReadonlyArray<PartView>,
): VisualError | undefined => {
  const part = error?.part;
  const visual = parts.some((p) => p.id === part && p.surface === "visual" && !p.deleted);
  return visual ? (error as VisualError) : undefined;
};
