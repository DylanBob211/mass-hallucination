import { javascriptLanguage } from "@codemirror/lang-javascript";
import { type Extension, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import type { SyntaxNodeRef, Tree } from "@lezer/common";
import { highlightTree, tagHighlighter, tags } from "@lezer/highlight";
import { locateUnits } from "../facade/facade";

/** A stretch of the Source and the classes it is coloured with. */
export interface Span {
  readonly from: number;
  readonly to: number;
  readonly classes: string;
}

/**
 * The colouring of a Source, or of any text from one: JavaScript throughout, and Mini-notation in
 * the strings Strudel turns into it (ticket 21). Pure, so the editor and the agent's widgets
 * colour code the same way.
 */
export const highlight = (source: string): ReadonlyArray<Span> => {
  const token: Array<string | undefined> = Array.from({ length: source.length });
  const tree = javascriptLanguage.parser.parse(source);
  highlightTree(tree, highlighter, (from, to, classes) => token.fill(classes, from, to));
  for (const { from, to } of hydraBodies(source, tree)) {
    const body = source.slice(from, to);
    const bodyTree = javascriptLanguage.parser.parse(body);
    token.fill(undefined, from, to);
    highlightTree(bodyTree, highlighter, (start, end, classes) =>
      token.fill(classes, from + start, from + end),
    );
    for (const helper of linkHelpers(body, bodyTree))
      addClass(token, "cm-link-helper", from + helper.from, from + helper.to);
  }
  for (const { from, to } of miniStrings(source, tree)) {
    token.fill(undefined, from, to);
    for (const mini of miniTokens(source.slice(from, to)))
      token.fill(`cm-t-mini-${mini.kind}`, from + mini.from, from + mini.to);
  }
  // A muted Part keeps its label bright: the mark that mutes it stays readable.
  for (const unit of locateUnits(source)) {
    if (!unit.muted) continue;
    const label = labelIn(tree, unit.from, unit.to);
    addClass(token, "cm-muted", unit.from, label?.from ?? unit.to);
    if (label !== undefined) addClass(token, "cm-muted", label.to, unit.to);
  }
  return spansOf(token);
};

const addClass = (
  token: Array<string | undefined>,
  added: string,
  from: number,
  to: number,
): void => {
  for (let at = from; at < to; at++) {
    const classes = token[at];
    token[at] = classes === undefined ? added : `${classes} ${added}`;
  }
};

/** The first label between `from` and `to`: a Part's own, after its leading comments. */
const labelIn = (
  tree: Tree,
  from: number,
  to: number,
): { from: number; to: number } | undefined => {
  let label: { from: number; to: number } | undefined;
  tree.iterate({
    from,
    to,
    enter: (node: SyntaxNodeRef) => {
      if (label !== undefined) return false;
      if (node.name === "Label" && node.from >= from) label = { from: node.from, to: node.to };
      return undefined;
    },
  });
  return label;
};

/** JavaScript's tokens, as classes the editor theme colours. */
const highlighter = tagHighlighter([
  { tag: [tags.keyword, tags.bool, tags.null, tags.self], class: "cm-t-keyword" },
  { tag: tags.string, class: "cm-t-string" },
  { tag: tags.number, class: "cm-t-number" },
  { tag: tags.comment, class: "cm-t-comment" },
  { tag: tags.labelName, class: "cm-t-label" },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
    class: "cm-t-function",
  },
]);

/**
 * The inside of each `hydra` template, as far as its first `${…}`. The transpiler leaves it
 * alone, so it holds no Mini-notation (ticket 21).
 */
const hydraBodies = (source: string, tree: Tree): ReadonlyArray<{ from: number; to: number }> => {
  const bodies: Array<{ from: number; to: number }> = [];
  tree.iterate({
    enter: (node: SyntaxNodeRef) => {
      if (node.name !== "TaggedTemplateExpression") return;
      const tag = node.node.firstChild;
      const template = node.node.getChild("TemplateString");
      if (tag?.name !== "VariableName" || source.slice(tag.from, tag.to) !== "hydra") return;
      if (template === null) return;
      bodies.push({
        from: template.from + 1,
        to: template.getChild("Interpolation")?.from ?? template.to - 1,
      });
    },
  });
  return bodies;
};

/** Where a Visual Part reads the music (spec §8). */
const linkHelperNames: ReadonlySet<string> = new Set(["cycle", "pulse", "value", "level"]);

/** Each call of a link helper in a Visual Part's body, by its name. */
const linkHelpers = (body: string, tree: Tree): ReadonlyArray<{ from: number; to: number }> => {
  const found: Array<{ from: number; to: number }> = [];
  tree.iterate({
    enter: (node: SyntaxNodeRef) => {
      if (node.name !== "CallExpression") return;
      const callee = node.node.firstChild;
      if (
        callee?.name === "VariableName" &&
        linkHelperNames.has(body.slice(callee.from, callee.to))
      )
        found.push({ from: callee.from, to: callee.to });
    },
  });
  return found;
};

/** The inside of each string Strudel 1.2.6's transpiler reads as Mini-notation. */
const miniStrings = (source: string, tree: Tree): ReadonlyArray<{ from: number; to: number }> => {
  const strings: Array<{ at: number; from: number; to: number }> = [];
  const comments: Array<{ from: number; to: number; text: string }> = [];
  tree.iterate({
    enter: (node: SyntaxNodeRef) => {
      if (node.name === "String" && source[node.from] === '"')
        strings.push({ at: node.from, from: node.from + 1, to: node.to - 1 });
      // Only the text before the first `${…}` is read, as the transpiler's `quasis[0]`.
      if (node.name === "TemplateString" && node.node.parent?.name !== "TaggedTemplateExpression")
        strings.push({
          at: node.from,
          from: node.from + 1,
          to: node.node.getChild("Interpolation")?.from ?? node.to - 1,
        });
      if (node.name === "LineComment")
        comments.push({ from: node.from, to: node.to, text: source.slice(node.from + 2, node.to) });
      if (node.name === "BlockComment")
        comments.push({
          from: node.from,
          to: node.to,
          text: source.slice(node.from + 2, node.to - 2),
        });
    },
  });
  const off = miniOff(comments, source.length);
  return strings.filter(({ at }) => !off.some(([from, to]) => at >= from && at < to));
};

/** Where `mini-off` and `mini-on` comments turn Mini-notation off, as `findMiniDisableRanges`. */
const miniOff = (
  comments: ReadonlyArray<{ from: number; to: number; text: string }>,
  end: number,
): ReadonlyArray<[number, number]> => {
  const ranges: Array<[number, number]> = [];
  const open: Array<number> = [];
  for (const { from, to, text } of comments) {
    if (text.trim().startsWith("mini-off")) open.push(from);
    else if (text.trim().startsWith("mini-on")) {
      const start = open.pop();
      // The transpiler's range then starts at `undefined`, which no offset is at or after.
      if (start !== undefined) ranges.push([start, to]);
    }
  }
  for (const start of open) ranges.push([start, end]);
  return ranges;
};

type MiniKind = "word" | "number" | "rest" | "structure";

const miniRules: ReadonlyArray<[RegExp, MiniKind]> = [
  [/^-?\d+(\.\d+)?(?![\w#.'])/, "number"],
  [/^[A-Za-z0-9][\w#.']*/, "word"],
  [/^[~-]/, "rest"],
  [/^[*/!@?:,.|[\]<>{}()%_=^]/, "structure"],
];

/** Mini-notation's tokens in `text`, by offset into it; anything else is left uncoloured. */
const miniTokens = (text: string): ReadonlyArray<{ from: number; to: number; kind: MiniKind }> => {
  const found: Array<{ from: number; to: number; kind: MiniKind }> = [];
  let at = 0;
  while (at < text.length) {
    const rest = text.slice(at);
    const rule = miniRules.find(([pattern]) => pattern.test(rest));
    const length = rule === undefined ? 1 : (rest.match(rule[0])?.[0].length ?? 1);
    if (rule !== undefined) found.push({ from: at, to: at + length, kind: rule[1] });
    at += length;
  }
  return found;
};

/** Runs of equal classes, without the uncoloured ones. */
const spansOf = (token: ReadonlyArray<string | undefined>): ReadonlyArray<Span> => {
  const spans: Array<Span> = [];
  let from = 0;
  for (let at = 1; at <= token.length; at++) {
    if (at < token.length && token[at] === token[from]) continue;
    const classes = token[from];
    if (classes !== undefined) spans.push({ from, to: at, classes });
    from = at;
  }
  return spans;
};

/** The Source coloured by `highlight`, again on every change (ticket 21). */
export const sourceHighlighting: Extension = [
  StateField.define<DecorationSet>({
    create: (state) => decorationsOf(state.doc.toString()),
    update: (decorations, transaction) =>
      transaction.docChanged ? decorationsOf(transaction.state.doc.toString()) : decorations,
    provide: (f) => EditorView.decorations.from(f),
  }),
  EditorView.theme({
    ".cm-t-keyword": { color: "var(--color-code-keyword)" },
    ".cm-t-function": { color: "var(--color-code-function)" },
    ".cm-t-string": { color: "var(--color-code-string)" },
    ".cm-t-mini-word": { color: "var(--color-code-mini)" },
    ".cm-t-number, .cm-t-mini-number": { color: "var(--color-code-number)" },
    ".cm-t-label": { color: "var(--color-code-label)" },
    ".cm-t-mini-structure": { color: "var(--color-code-structure)" },
    ".cm-t-comment, .cm-t-mini-rest": { color: "var(--color-dim)" },
    // After the token colours, so it wins on the same span.
    ".cm-link-helper": { color: "var(--color-code-helper)" },
    ".cm-muted": { opacity: "0.45" },
  }),
];

const decorationsOf = (source: string): DecorationSet =>
  Decoration.set(
    highlight(source).map(({ from, to, classes }) =>
      Decoration.mark({ class: classes }).range(from, to),
    ),
  );

/** `text` as coloured spans, for the agent's widgets inside the editor. */
export const highlightedText = (text: string): DocumentFragment => {
  const fragment = document.createDocumentFragment();
  let at = 0;
  for (const { from, to, classes } of highlight(text)) {
    if (from > at) fragment.append(text.slice(at, from));
    const span = document.createElement("span");
    span.className = classes;
    span.textContent = text.slice(from, to);
    fragment.append(span);
    at = to;
  }
  if (at < text.length) fragment.append(text.slice(at));
  return fragment;
};
