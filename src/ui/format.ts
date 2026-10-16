import { isolateHistory } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { format } from "../facade/facade";

/** What a Format asks of the rest of the page. */
export interface FormatCommands {
  /** Shows why a Format was refused, until the next edit; `undefined` takes it away. */
  showFormatRefusal(reason: string | undefined): void;
}

/**
 * Shift-Alt-F: a Format of the whole Source (CONTEXT.md), as one undo step, the cursor kept on its
 * code. A Format that lands after the human typed again is dropped, never written over their text.
 */
export const formatKey = (commands: FormatCommands) => {
  let refusalShown = false;
  const run = (view: EditorView) => {
    const { doc, selection } = view.state;
    const before = doc.toString();
    // A key handler answers at once; the Format lands, or is dropped, when Prettier is done.
    void format(before, selection.main.head).then((formatted) => {
      if (view.state.doc !== doc) return;
      if (!formatted.ok) {
        refusalShown = true;
        commands.showFormatRefusal(formatted.reason);
        return;
      }
      view.dispatch({
        changes: changed(before, formatted.source),
        // A selection the human moved meanwhile is theirs, mapped through the Format instead.
        ...(view.state.selection.eq(selection) && { selection: { anchor: formatted.cursor } }),
        annotations: isolateHistory.of("full"),
        userEvent: "format",
        scrollIntoView: true,
      });
    });
    return true;
  };
  const extension = EditorView.updateListener.of((update) => {
    if (!refusalShown || !update.docChanged) return;
    refusalShown = false;
    commands.showFormatRefusal(undefined);
  });
  return { key: { key: "Shift-Alt-f", run }, extension };
};

/** The one change from `before` to `after`, narrowed to the stretch between what they share. */
const changed = (before: string, after: string) => {
  let from = 0;
  while (from < before.length && from < after.length && before[from] === after[from]) from++;
  let end = 0;
  while (
    end < before.length - from &&
    end < after.length - from &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  )
    end++;
  return { from, to: before.length - end, insert: after.slice(from, after.length - end) };
};
