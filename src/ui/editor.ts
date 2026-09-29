import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { EditorView, drawSelection, keymap } from "@codemirror/view";

/**
 * Tailwind classes cannot reach CodeMirror's internals, so the theme reads the same CSS variables
 * the Tailwind tokens define (src/app.css). The background stays transparent so the visuals canvas
 * can show through later (ADR 0006).
 */
const theme = EditorView.theme(
  {
    "&": {
      height: "100%",
      color: "var(--color-fg)",
      backgroundColor: "transparent",
      fontSize: "var(--editor-font-size)",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.6" },
    ".cm-content": { caretColor: "var(--color-caret)" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--color-caret)" },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground":
      { backgroundColor: "var(--color-selection)" },
  },
  { dark: true },
);

/**
 * The editor whose document is the Source (ADR 0001, ADR 0006): the only copy of the text.
 */
export const createEditor = (parent: HTMLElement, source: string): EditorView =>
  new EditorView({
    parent,
    doc: source,
    extensions: [
      history(),
      drawSelection(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      javascript(),
      theme,
    ],
  });
