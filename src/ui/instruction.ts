import { type Extension, StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, type KeyBinding, WidgetType } from "@codemirror/view";
import { locateUnits, preambleId } from "../facade/facade";

/** What the Instruction input asks of the agent (spec §10). */
export interface InstructionCommands {
  /** Asks the agent `instruction`, aimed at the Part `part`, or at all of them with `null`. */
  instruct(instruction: string, part: string | null): void;
}

/** Where the input is open: under the line holding `at`, first aimed at `part`. */
interface Open {
  readonly at: number;
  readonly part: string | null;
}

const open = StateEffect.define<Open>();
const close = StateEffect.define();

/**
 * The Part the cursor is in, by identity; `null` on a blank line, in the Preamble, or between
 * units (ADR 0007).
 */
const partAt = (view: EditorView, position: number): string | null => {
  const line = view.state.doc.lineAt(position);
  if (line.text.trim() === "") return null;
  const unit = locateUnits(view.state.doc.toString()).find(
    ({ from, to }) => from <= position && position <= to,
  );
  return unit === undefined || unit.id === preambleId ? null : unit.id;
};

/**
 * The one-line Instruction input at the cursor (ADR 0007): Ctrl-K opens it aimed at the Part
 * there, Tab switches the aim to `@all` and back, Enter sends, Esc cancels. Either way focus goes
 * back to the editor.
 */
export const instructionInput = (
  commands: InstructionCommands,
): { readonly extension: Extension; readonly keys: ReadonlyArray<KeyBinding> } => {
  const field = StateField.define<Open | undefined>({
    create: () => undefined,
    update(value, transaction) {
      let next = value && { ...value, at: transaction.changes.mapPos(value.at) };
      for (const effect of transaction.effects) {
        if (effect.is(open)) next = effect.value;
        if (effect.is(close)) next = undefined;
      }
      return next;
    },
    provide: (f) =>
      EditorView.decorations.from(f, (value) => {
        if (value === undefined) return Decoration.none;
        return Decoration.set(
          Decoration.widget({
            widget: new InstructionWidget(value.part, commands),
            block: true,
            side: 1,
          }).range(value.at),
        );
      }),
  });

  const keys: ReadonlyArray<KeyBinding> = [
    {
      key: "Ctrl-k",
      run: (view) => {
        const { head } = view.state.selection.main;
        view.dispatch({
          effects: open.of({ at: view.state.doc.lineAt(head).to, part: partAt(view, head) }),
        });
        view.dom.querySelector<HTMLInputElement>(".cm-instruction input")?.focus();
        return true;
      },
    },
  ];
  return { extension: [field, theme], keys };
};

/** The input itself. It keeps its own aim, so switching it doesn't redraw what was typed. */
class InstructionWidget extends WidgetType {
  constructor(
    readonly part: string | null,
    readonly commands: InstructionCommands,
  ) {
    super();
  }

  override eq(other: InstructionWidget) {
    return other.part === this.part;
  }

  override toDOM(view: EditorView) {
    const { part, commands } = this;
    let aimed = part !== null;
    const block = document.createElement("div");
    block.className = "cm-instruction";
    const aim = document.createElement("span");
    aim.className = "cm-instruction-aim";
    const showAim = () => {
      aim.textContent = aimed && part !== null ? `@${part}` : "@all";
    };
    showAim();
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "ask the agent · Tab aim · Enter send · Esc cancel";
    input.spellcheck = false;
    let closed = false;
    const done = () => {
      if (closed) return;
      closed = true;
      view.dispatch({ effects: close.of(null) });
      view.focus();
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        const instruction = input.value.trim();
        done();
        if (instruction !== "") commands.instruct(instruction, aimed ? part : null);
      } else if (event.key === "Escape") {
        event.preventDefault();
        done();
      } else if (event.key === "Tab") {
        event.preventDefault();
        if (part !== null) aimed = !aimed;
        showAim();
      }
    });
    // Clicking back into the code leaves the input, as Esc does.
    input.addEventListener("blur", done);
    block.append(aim, input);
    return block;
  }

  override ignoreEvent() {
    return true;
  }
}

/** Agent widgets sit on solid panels, readable over the visuals (ADR 0007). */
const theme = EditorView.theme({
  ".cm-instruction": {
    display: "flex",
    gap: "8px",
    backgroundColor: "var(--color-panel)",
    borderLeft: "2px solid var(--color-caret)",
    padding: "2px 8px",
  },
  ".cm-instruction-aim": { color: "var(--color-caret)" },
  ".cm-instruction input": {
    flex: "1",
    font: "inherit",
    color: "var(--color-fg)",
    backgroundColor: "transparent",
    border: "none",
    outline: "none",
  },
});
