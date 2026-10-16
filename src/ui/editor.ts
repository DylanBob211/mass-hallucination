import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { Prec } from "@codemirror/state";
import { EditorView, drawSelection, type KeyBinding, keymap } from "@codemirror/view";
import type { Autonomy } from "../facade/facade";
import { agentMarks } from "./agentMarks";
import { agentWork } from "./agentWork";
import { type FormatCommands, formatKey } from "./format";
import { sourceHighlighting } from "./highlight";
import { type InstructionCommands, instructionInput } from "./instruction";
import { overVisuals } from "./overVisuals";
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
export interface EditorCommands extends ProposalCommands, InstructionCommands, FormatCommands {
  apply(): void;
  stopTransport(): void;
  setAutonomy(autonomy: Autonomy): void;
  /** Stops the running Turn. */
  stop(): void;
  /** Opens the peek if it is closed, and closes it if it is open (ADR 0007). */
  togglePeek(): void;
  /** Closes the peek; `false` if it was closed already. */
  closePeek(): boolean;
  /** Hands the performer the instrumentation log to save (spec §11). */
  downloadLog(): void;
  /** Steps the code over the visuals: all → the Part in focus only → none (ADR 0007). */
  cycleCodeView(): void;
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
const performanceKeymap = (commands: EditorCommands, extraKeys: ReadonlyArray<KeyBinding>) =>
  Prec.high(
    keymap.of([
      ...extraKeys,
      {
        key: "Escape",
        // Esc closes an open peek first, so dismissing it never stops a Turn. Either way it keeps
        // its default, collapsing a multiple selection.
        run: () => {
          if (!commands.closePeek()) commands.stop();
          return false;
        },
      },
      {
        key: "Ctrl-j",
        run: () => {
          commands.togglePeek();
          return true;
        },
      },
      {
        // The peek's download control, as a key (ADR 0007).
        key: "Alt-l",
        run: () => {
          commands.downloadLog();
          return true;
        },
      },
      {
        key: "Alt-h",
        run: () => {
          commands.cycleCodeView();
          return true;
        },
      },
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
export const createEditor = (source: string, commands: EditorCommands): EditorView => {
  const instruction = instructionInput(commands);
  const format = formatKey(commands);
  return new EditorView({
    doc: source,
    extensions: [
      performanceKeymap(commands, [...instruction.keys, format.key]),
      instruction.extension,
      format.extension,
      history(),
      drawSelection(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      javascript(),
      sourceHighlighting,
      proposalDiff(commands),
      agentWork,
      agentMarks,
      overVisuals,
      theme,
    ],
  });
};
