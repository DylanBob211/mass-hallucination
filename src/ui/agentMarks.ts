import { type Extension, type Range, StateField, type Transaction } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import { agentWriteEvent, locateUnits } from "../facade/facade";

/**
 * Agent-written text, tinted (ADR 0007): what an agent write changed stays marked until the human
 * edits that Part. Editor state only, derived from the transactions an agent write tags.
 */
export const agentMarks: Extension = [
  StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(marks, transaction) {
      if (!transaction.docChanged) return marks;
      const mapped = marks.map(transaction.changes);
      return transaction.isUserEvent(agentWriteEvent)
        ? mapped.update({ add: written(transaction), sort: true })
        : untouched(mapped, transaction);
    },
    provide: (f) => EditorView.decorations.from(f),
  }),
  EditorView.theme({ ".cm-agent-text": { color: "var(--color-agent)" } }),
];

const tint = Decoration.mark({ class: "cm-agent-text" });

/**
 * What an agent write changed: each inserted text less what it shares at either end with the text
 * it replaced, since a write replaces whole Parts.
 */
const written = (transaction: Transaction) => {
  const ranges: Array<Range<Decoration>> = [];
  transaction.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
    const before = transaction.startState.sliceDoc(fromA, toA);
    const after = inserted.toString();
    let start = 0;
    while (start < before.length && start < after.length && before[start] === after[start]) start++;
    let end = 0;
    while (
      end < before.length - start &&
      end < after.length - start &&
      before[before.length - 1 - end] === after[after.length - 1 - end]
    )
      end++;
    if (fromB + start < toB - end) ranges.push(tint.range(fromB + start, toB - end));
  });
  return ranges;
};

/** `marks` less those in every unit a human change touched. */
const untouched = (marks: DecorationSet, transaction: Transaction): DecorationSet => {
  const units = locateUnits(transaction.state.doc.toString());
  const edited: Array<{ from: number; to: number }> = [];
  transaction.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
    edited.push(...units.filter(({ from, to }) => from <= toB && fromB <= to));
  });
  if (edited.length === 0) return marks;
  return marks.update({
    filter: (from, to) => !edited.some((unit) => unit.from <= to && from <= unit.to),
  });
};
