import { type EditorState, type Extension, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { locateUnits, type ProposalView } from "../facade/facade";
import { highlightedText } from "./highlight";
import { blockPlace } from "./place";

/** What the Proposal's buttons ask of the Performance; each duplicates a key (spec §10). */
export interface ProposalCommands {
  accept(): void;
  acceptAndPlay(): void;
  reject(): void;
}

/** Shows the view model's open Proposal in the editor, or clears it with `undefined`. */
export const showProposal = StateEffect.define<ProposalView | undefined>();

/**
 * The open Proposal as an inline diff (ADR 0007): each changed Part's lines struck through, its new
 * text in a block beneath, and a new Part's at the end of the Source. A Stale one is greyed out
 * and offers only to be dismissed. The Source itself is untouched.
 */
export const proposalDiff = (commands: ProposalCommands): Extension => {
  const field = StateField.define<{
    proposal: ProposalView | undefined;
    decorations: DecorationSet;
  }>({
    create: () => ({ proposal: undefined, decorations: Decoration.none }),
    update(value, transaction) {
      let { proposal } = value;
      for (const effect of transaction.effects)
        if (effect.is(showProposal)) proposal = effect.value;
      if (proposal === value.proposal && !transaction.docChanged) return value;
      return { proposal, decorations: decorationsOf(transaction.state, proposal, commands) };
    },
    provide: (f) => EditorView.decorations.from(f, (value) => value.decorations),
  });
  return [field, theme];
};

const decorationsOf = (
  state: EditorState,
  proposal: ProposalView | undefined,
  commands: ProposalCommands,
): DecorationSet => {
  if (proposal === undefined) return Decoration.none;
  const units = locateUnits(state.doc.toString());
  const struck: Array<{ from: number; to: number }> = [];
  const blocks: Array<{ at: number; side: number; text: string }> = [];
  for (const { part, text, added } of proposal.changes) {
    // A new Part replaces nothing, even once the human has taken its name (it is then Stale).
    const ranges = added ? [] : units.filter(({ id }) => id === part);
    struck.push(...ranges);
    blocks.push({ ...blockPlace(state, part, ranges[0]), text });
  }
  // The buttons go under the last block, where the eye ends reading the diff.
  blocks.sort((a, b) => a.at - b.at || a.side - b.side);
  const last = blocks.at(-1);
  return Decoration.set(
    [
      ...struck.filter(({ from, to }) => to > from).map(({ from, to }) => oldText.range(from, to)),
      ...blocks.map((block) =>
        Decoration.widget({
          widget: new NewText(block.text, proposal.stale, block === last ? commands : undefined),
          block: true,
          side: block.side,
        }).range(block.at),
      ),
    ],
    true,
  );
};

const oldText = Decoration.mark({ class: "cm-proposal-old" });

/** A changed Part's new text, beneath it; the last one also carries the buttons. */
class NewText extends WidgetType {
  constructor(
    readonly text: string,
    readonly stale: boolean,
    readonly commands: ProposalCommands | undefined,
  ) {
    super();
  }

  override eq(other: NewText) {
    return (
      other.text === this.text &&
      other.stale === this.stale &&
      (other.commands === undefined) === (this.commands === undefined)
    );
  }

  override toDOM() {
    const block = document.createElement("div");
    block.className = this.stale ? "cm-proposal cm-proposal-stale" : "cm-proposal";
    const text = document.createElement("pre");
    text.className = "cm-proposal-new";
    text.append(highlightedText(this.text));
    block.append(text);
    const { commands } = this;
    if (commands !== undefined) {
      const keys = document.createElement("div");
      keys.className = "cm-proposal-keys";
      const buttons: ReadonlyArray<[string, keyof ProposalCommands]> = this.stale
        ? [["Alt-R dismiss", "reject"]]
        : [
            ["Alt-A accept", "accept"],
            ["Alt-P accept & play", "acceptAndPlay"],
            ["Alt-R reject", "reject"],
          ];
      for (const [label, command] of buttons) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        // Focus stays in the editor (ADR 0007).
        button.addEventListener("mousedown", (event) => {
          event.preventDefault();
        });
        button.addEventListener("click", () => {
          commands[command]();
        });
        keys.append(button);
      }
      block.append(keys);
    }
    return block;
  }
}

/** Agent widgets sit on solid panels, readable over the visuals (ADR 0007). */
const theme = EditorView.theme({
  // The text it replaces stays grey, its colours too.
  ".cm-proposal-old, .cm-proposal-old *": {
    textDecoration: "line-through",
    textDecorationColor: "var(--color-removed)",
    color: "var(--color-dim)",
  },
  ".cm-proposal": {
    backgroundColor: "var(--color-panel)",
    borderLeft: "2px solid var(--color-proposal)",
    padding: "2px 8px",
  },
  ".cm-proposal-new": {
    margin: "0",
    font: "inherit",
    whiteSpace: "pre-wrap",
    color: "var(--color-proposal)",
  },
  ".cm-proposal-keys": { display: "flex", gap: "12px", color: "var(--color-dim)" },
  ".cm-proposal-keys button": { font: "inherit", cursor: "pointer" },
  ".cm-proposal-keys button:hover": { color: "var(--color-fg)" },
  ".cm-proposal-stale": { borderLeftColor: "var(--color-dim)", opacity: "0.5" },
  ".cm-proposal-stale .cm-proposal-new, .cm-proposal-stale .cm-proposal-new *": {
    color: "var(--color-dim)",
  },
});
