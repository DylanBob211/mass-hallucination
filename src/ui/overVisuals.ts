import { type EditorState, type Extension, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import {
  type DraftChange,
  type ErrorSlot,
  locateUnits,
  preambleId,
  type ProposalView,
  type TurnView,
  turnEndings,
} from "../facade/facade";
import { showAgentWork } from "./agentWork";
import type { CodeView, VisualError } from "./codeView.svelte";
import { labelLine } from "./place";
import { showProposal } from "./proposal";

/** Sets how much code shows: the view Alt-H chose, as an open Proposal reveals it. */
export const showCodeView = StateEffect.define<CodeView>();

/** Badges a Visual Part's error on its label line, or clears the badge with `undefined`. */
export const showVisualError = StateEffect.define<VisualError | undefined>();

/** Where a unit of the Source sits: a Part by its identity, a Preamble segment as `preambleId`. */
type Unit = ReturnType<typeof locateUnits>[number];

/** What decides the Parts in focus besides the cursor. */
export interface FocusWork {
  /** The running or latest Turn. */
  readonly turn: TurnView | undefined;
  readonly draft: ReadonlyArray<DraftChange> | undefined;
  readonly proposal: ProposalView | undefined;
}

/**
 * The units in focus, by identity (ADR 0007 amendment): what the agent works on while a Turn runs
 * (the Parts its draft changes, or else the Part it was asked at), what an open Proposal changes,
 * otherwise the Part the cursor is in. The agent's may include the Preamble; a new Part, not yet
 * in `units`, is passed over.
 */
export const inFocus = (
  units: ReadonlyArray<Unit>,
  cursor: number,
  { turn, draft, proposal }: FocusWork,
): ReadonlyArray<string> => {
  const inSource = (ids: ReadonlyArray<string>) =>
    ids.filter((id) => units.some((u) => u.id === id));
  if (turn !== undefined && !turnEndings.has(turn.state)) {
    const drafted = inSource((draft ?? []).map(({ part }) => part));
    const target = drafted.length > 0 ? drafted : inSource(turn.aim === null ? [] : [turn.aim]);
    if (target.length > 0) return target;
  }
  const proposed = inSource((proposal?.changes ?? []).map(({ part }) => part));
  if (proposed.length > 0) return proposed;
  const at = units.find(({ from, to }) => from <= cursor && cursor <= to);
  return at === undefined || at.id === preambleId ? [] : [at.id];
};

interface OverVisualsState {
  readonly units: ReadonlyArray<Unit>;
  readonly work: FocusWork;
  readonly shown: CodeView;
  readonly error: VisualError | undefined;
  readonly decorations: DecorationSet;
}

/**
 * The code readable over the visuals (ADR 0007 amendment). The Parts in focus sit on a solid,
 * full-width band; every other line on a lighter box as wide as its text. The canvas is never
 * dimmed or blurred: only the code's own backgrounds change, in plain CSS. The view shows all the
 * code, the Parts in focus only, or none, and focus stays in the editor in every view.
 */
export const overVisuals: Extension = [
  StateField.define<OverVisualsState>({
    create: (state) =>
      decorate(state, {
        units: locateUnits(state.doc.toString()),
        work: { turn: undefined, draft: undefined, proposal: undefined },
        shown: "all",
        error: undefined,
      }),
    update(value, transaction) {
      let { units, work, shown, error } = value;
      if (transaction.docChanged) units = locateUnits(transaction.state.doc.toString());
      for (const effect of transaction.effects) {
        if (effect.is(showAgentWork))
          work = { ...work, turn: effect.value.turn, draft: effect.value.draft };
        if (effect.is(showProposal)) work = { ...work, proposal: effect.value };
        if (effect.is(showCodeView)) shown = effect.value;
        if (effect.is(showVisualError)) error = effect.value;
      }
      const same =
        units === value.units &&
        work === value.work &&
        shown === value.shown &&
        error === value.error;
      if (same && transaction.selection === undefined) return value;
      return decorate(transaction.state, { units, work, shown, error });
    },
    provide: (f) => [
      EditorView.decorations.from(f, (value) => value.decorations),
      EditorView.editorAttributes.from(f, (value) => ({ class: `cm-code-${value.shown}` })),
    ],
  }),
  EditorView.theme({
    // Every line on its own lighter box, as wide as its text.
    ".cm-line": {
      width: "fit-content",
      minWidth: "1ch",
      backgroundColor: "rgb(12 12 16 / 0.6)",
    },
    // The Parts in focus on a solid band, the width of the editor.
    ".cm-line.cm-focus-line": {
      width: "auto",
      backgroundColor: "rgb(12 12 16 / 0.88)",
    },
    // Above the line boxes, which would otherwise hide it.
    ".cm-selectionLayer": { zIndex: "1 !important", pointerEvents: "none" },
    // The view hides with `visibility` on what is drawn, never on the content element itself, so
    // the editor keeps focus and its keys. The Instruction input stays in every view.
    "&.cm-code-focus .cm-line:not(.cm-focus-line), &.cm-code-focus .cm-ghost": {
      visibility: "hidden",
    },
    "&.cm-code-none .cm-content > :not(.cm-instruction), &.cm-code-none .cm-layer": {
      visibility: "hidden",
    },
    ".cm-error-badge": {
      marginLeft: "12px",
      padding: "0 6px",
      fontSize: "0.8em",
      color: "var(--color-bg)",
      backgroundColor: "var(--color-error)",
    },
  }),
];

const decorate = (
  state: EditorState,
  over: Omit<OverVisualsState, "decorations">,
): OverVisualsState => {
  const { units, work, error } = over;
  const decorations = [];
  const focus = inFocus(units, state.selection.main.head, work);
  for (const { from, to } of units.filter(({ id }) => focus.includes(id)))
    for (let line = state.doc.lineAt(from); ; line = state.doc.line(line.number + 1)) {
      decorations.push(band.range(line.from));
      if (line.to >= to) break;
    }
  const broken = error && units.find(({ id }) => id === error.part);
  if (broken !== undefined && error !== undefined)
    decorations.push(
      Decoration.widget({ widget: new ErrorBadge(error.phase), side: 2 }).range(
        labelLine(state, broken.from, broken.to),
      ),
    );
  return { ...over, decorations: Decoration.set(decorations, true) };
};

const band = Decoration.line({ class: "cm-focus-line" });

class ErrorBadge extends WidgetType {
  constructor(readonly phase: ErrorSlot["phase"]) {
    super();
  }

  override eq(other: ErrorBadge) {
    return other.phase === this.phase;
  }

  override toDOM() {
    const badge = document.createElement("span");
    badge.className = "cm-error-badge";
    // As the status line words it.
    badge.textContent = `✕ ${this.phase === "eval" ? "eval" : "playing"}`;
    return badge;
  }
}
