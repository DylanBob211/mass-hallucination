import type { EditorState } from "@codemirror/state";
import { preambleId } from "../facade/facade";

/**
 * Where a block widget about `part` goes (ADR 0007): under the last line of `unit`, the Part's
 * first range in the Source; with no such unit, at the top for the Preamble and at the end of the
 * Source for a new Part.
 */
export const blockPlace = (
  state: EditorState,
  part: string,
  unit: { readonly to: number } | undefined,
): { readonly at: number; readonly side: number } => {
  if (unit !== undefined) return { at: state.doc.lineAt(unit.to).to, side: 1 };
  if (part === preambleId) return { at: 0, side: -1 };
  return { at: state.doc.length, side: 1 };
};
