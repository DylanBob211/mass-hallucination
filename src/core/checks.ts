import type { ChangePartsResult } from "./changeParts";
import { isUnapplied, type LiveCode, preambleId } from "./liveCode";
import type { Performance } from "./Performance";

/** One Part's change in a `change_parts` request: its whole new text, and the rev it replaces. */
export interface PartChange {
  readonly part: string;
  /** The rev of the text the agent read; `null` for a new Part. */
  readonly rev: string | null;
  readonly text: string;
}

export type Refusal = Extract<ChangePartsResult, { ok: false }>;

export const badRequest = (message: string): Refusal => ({
  ok: false,
  reason: "bad_request",
  message,
});

/**
 * Why the Source as it is now refuses the request, in the spec's order: a Part it does not know
 * or a new Part whose name is taken, then a Part changed since the agent read it, then a Part
 * holding the human's Unapplied edits.
 */
export const refusalOf = (
  performance: Performance,
  live: LiveCode,
  changes: ReadonlyArray<PartChange>,
): Refusal | undefined => {
  const unitOf = (id: string) =>
    id === preambleId ? performance.preamble : performance.parts.find((part) => part.id === id);
  for (const { part, rev } of changes) {
    const exists = unitOf(part) !== undefined;
    if (rev !== null && !exists) return badRequest(`there is no Part ${part}`);
    if (rev === null && exists) return badRequest(`${part} exists; send the rev you read`);
  }
  for (const { part, rev } of changes) {
    const unit = unitOf(part);
    if (rev !== null && unit !== undefined && unit.rev !== rev)
      return { ok: false, reason: "stale", part, rev: unit.rev, text: unit.text };
  }
  for (const { part } of changes) {
    const unapplied =
      part === preambleId
        ? live.preamble !== performance.preamble.text
        : performance.parts.some((p) => p.id === part && isUnapplied(p, live)) ||
          // A new Part on a deleted one still sounding would undo the human's deletion.
          (!performance.parts.some((p) => p.id === part) && live.parts.has(part));
    if (unapplied) return { ok: false, reason: "unapplied", part };
  }
  return undefined;
};
