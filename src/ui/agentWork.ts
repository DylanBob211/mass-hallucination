import { type EditorState, type Extension, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import {
  type DraftChange,
  locateUnits,
  type PartView,
  preambleId,
  type TurnView,
  turnEndings,
} from "../facade/facade";
import { blockPlace } from "./place";

/** What the editor shows of the agent's work, from the view model. */
export interface AgentWork {
  /** The running or latest Turn. */
  readonly turn: TurnView | undefined;
  /** The running Turn's change as far as the model has written it. */
  readonly draft: ReadonlyArray<DraftChange> | undefined;
  /** Every Part, the deleted ones still sounding included. */
  readonly parts: ReadonlyArray<PartView>;
}

/** Shows the view model's agent work in the editor. */
export const showAgentWork = StateEffect.define<AgentWork>();

/**
 * The agent working in the code (ADR 0007): its change streaming as a dashed block under its Part
 * (a new Part's at the end), a badge on the label line of the Part it works on while its Turn
 * runs, and each deleted Part still sounding as a struck-through ghost at the end. The Source
 * itself is untouched.
 */
export const agentWork: Extension = [
  StateField.define<{ work: AgentWork | undefined; decorations: DecorationSet }>({
    create: () => ({ work: undefined, decorations: Decoration.none }),
    update(value, transaction) {
      let { work } = value;
      for (const effect of transaction.effects) if (effect.is(showAgentWork)) work = effect.value;
      if (work === value.work && !transaction.docChanged) return value;
      return { work, decorations: decorationsOf(transaction.state, work) };
    },
    provide: (f) => EditorView.decorations.from(f, (value) => value.decorations),
  }),
  EditorView.theme({
    ".cm-draft": {
      margin: "0",
      font: "inherit",
      whiteSpace: "pre-wrap",
      color: "var(--color-fg)",
      backgroundColor: "var(--color-panel)",
      border: "1px dashed var(--color-caret)",
      padding: "2px 8px",
    },
    ".cm-agent-badge": {
      marginLeft: "12px",
      padding: "0 6px",
      fontSize: "0.8em",
      color: "var(--color-bg)",
      backgroundColor: "var(--color-caret)",
    },
    ".cm-ghost": {
      margin: "0",
      font: "inherit",
      whiteSpace: "pre-wrap",
      color: "var(--color-dim)",
      textDecoration: "line-through",
      textDecorationColor: "var(--color-removed)",
      backgroundColor: "var(--color-panel)",
      padding: "2px 8px",
    },
  }),
];

const decorationsOf = (state: EditorState, work: AgentWork | undefined): DecorationSet => {
  if (work === undefined) return Decoration.none;
  const { turn, draft = [], parts } = work;
  const units = locateUnits(state.doc.toString());
  const decorations = draft.map(({ part, text }) => {
    const { at, side } = blockPlace(
      state,
      part,
      units.find(({ id }) => id === part),
    );
    return Decoration.widget({ widget: new Block("cm-draft", text), block: true, side }).range(at);
  });
  if (turn !== undefined && !turnEndings.has(turn.state)) {
    // The Parts its change touches, once it names them; until then, the Part it was asked at.
    const touched = draft.map(({ part }) => part).filter((part) => part !== preambleId);
    const inSource = units.filter(({ id }) => touched.includes(id));
    const targets = inSource.length > 0 ? inSource : units.filter(({ id }) => id === turn.aim);
    for (const unit of targets) decorations.push(badge.range(labelLine(state, unit.from, unit.to)));
  }
  for (const { deleted, live } of parts)
    if (deleted && live !== undefined)
      decorations.push(
        Decoration.widget({ widget: new Block("cm-ghost", live), block: true, side: 2 }).range(
          state.doc.length,
        ),
      );
  return Decoration.set(decorations, true);
};

/** The end of a Part's label line: its first line that is not a leading comment. */
const labelLine = (state: EditorState, from: number, to: number): number => {
  let line = state.doc.lineAt(from);
  while (line.to < to && /^\s*(\/\/|\/\*|\*)/.test(line.text))
    line = state.doc.line(line.number + 1);
  return line.to;
};

/** A block of code the agent shows, on a solid panel (ADR 0007 amendment). */
class Block extends WidgetType {
  constructor(
    readonly className: string,
    readonly text: string,
  ) {
    super();
  }

  override eq(other: Block) {
    return other.className === this.className && other.text === this.text;
  }

  override toDOM() {
    const block = document.createElement("pre");
    block.className = this.className;
    block.textContent = this.text;
    return block;
  }

  /** The draft grows with every delta; its block is kept and only its text replaced. */
  override updateDOM(dom: HTMLElement) {
    if (!dom.classList.contains(this.className)) return false;
    dom.textContent = this.text;
    return true;
  }
}

class Badge extends WidgetType {
  override eq() {
    return true;
  }

  override toDOM() {
    const badge = document.createElement("span");
    badge.className = "cm-agent-badge";
    badge.textContent = "agent at work";
    return badge;
  }
}

const badge = Decoration.widget({ widget: new Badge(), side: 1 });
