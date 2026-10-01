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

/** The end of a Part's label line: its first line that is not a leading comment. */
export const labelLine = (state: EditorState, from: number, to: number): number => {
  let line = state.doc.lineAt(from);
  while (line.to < to && /^\s*(\/\/|\/\*|\*)/.test(line.text))
    line = state.doc.line(line.number + 1);
  return line.to;
};
