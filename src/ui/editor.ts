import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { Prec } from "@codemirror/state";
import { EditorView, drawSelection, keymap } from "@codemirror/view";
import type { Autonomy } from "../facade/facade";
import { proposalDiff, type ProposalCommands } from "./proposal";

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

/** What the performer's keys ask of the Performance (spec §10). */
export interface EditorCommands extends ProposalCommands {
  apply(): void;
  stopTransport(): void;
  setAutonomy(autonomy: Autonomy): void;
}

const autonomyKeys: ReadonlyArray<[string, Autonomy]> = [
  ["Alt-1", "propose"],
  ["Alt-2", "write"],
  ["Alt-3", "apply"],
];

/** A Stale Proposal can only be dismissed; the core refuses to accept it. */
const proposalKeys: ReadonlyArray<[string, keyof ProposalCommands]> = [
  ["Alt-a", "accept"],
  ["Alt-p", "acceptAndPlay"],
  ["Alt-r", "reject"],
];

/**
 * Ctrl, not Mod, as spec §10 says, and ahead of the default keymap, whose Mod-Enter would insert a
 * line. Focus stays in the editor.
 */
const performanceKeymap = (commands: EditorCommands) =>
  Prec.high(
    keymap.of([
      {
        key: "Ctrl-Enter",
        run: () => {
          commands.apply();
          return true;
        },
      },
      {
        key: "Ctrl-.",
        run: () => {
          commands.stopTransport();
          return true;
        },
      },
      ...autonomyKeys.map(([key, autonomy]) => ({
        key,
        run: () => {
          commands.setAutonomy(autonomy);
          return true;
        },
      })),
      ...proposalKeys.map(([key, command]) => ({
        key,
        run: () => {
          commands[command]();
          return true;
        },
      })),
    ]),
  );

/**
 * The editor whose document is the Source (ADR 0001, ADR 0006): the only copy of the text. Its DOM
 * is mounted by the Editor component.
 */
export const createEditor = (source: string, commands: EditorCommands): EditorView =>
  new EditorView({
    doc: source,
    extensions: [
      performanceKeymap(commands),
      history(),
      drawSelection(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      javascript(),
      proposalDiff(commands),
      theme,
    ],
  });
