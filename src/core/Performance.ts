import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import {
  type Comment,
  type LabeledStatement,
  parse,
  type Program,
  type TaggedTemplateExpression,
} from "acorn";
import { parse as parseLoose } from "acorn-loose";

/**
 * The Performance model, derived from the Source on every change and never stored (spec §4,
 * ADR 0001). Pure: no Effect, so ticket 04's composition and the agent's snapshot can both call it.
 */
export interface Performance {
  readonly parts: ReadonlyArray<Part>;
  readonly preamble: Preamble;
  /** Every unit's text in Source order: each Part, and each segment of the Preamble. */
  readonly layout: ReadonlyArray<Segment>;
}

/** A Part, or one non-blank stretch of Preamble between Parts, trimmed. */
export type Segment = { readonly part: Part } | { readonly preamble: string };

/** One top-level labelled statement (CONTEXT.md). */
export interface Part {
  /** The label with its mute/solo marks stripped: how the Part is addressed. */
  readonly id: string;
  /** Its exact text, leading comment run and label included. */
  readonly text: string;
  readonly rev: Rev;
  readonly muted: boolean;
  readonly soloed: boolean;
  readonly surface: Surface;
}

/** The medium a Part produces output on (CONTEXT.md). */
export type Surface = "audio" | "visual";

/** Every other top-level text, addressed as a single unit. */
export interface Preamble {
  /** Its non-blank segments, trimmed and joined in Source order with `\n`. */
  readonly text: string;
  readonly rev: Rev;
}

/** The first 8 hex chars of SHA-256 over a unit's exact text (CONTEXT.md). */
export type Rev = string;

export const revOf = (text: string): Rev => bytesToHex(sha256(utf8ToBytes(text))).slice(0, 8);

/** Parses as Strudel 1.2.6's transpiler does. */
export const parseOptions = { ecmaVersion: 2022, allowAwaitOutsideFunction: true } as const;

export const parsePerformance = (source: string): Performance => {
  const parts: Array<Part> = [];
  const layout: Array<Segment> = [];
  for (const unit of locate(source)) {
    if ("part" in unit) {
      parts.push(unit.part);
      layout.push({ part: unit.part });
    } else {
      layout.push({ preamble: source.slice(unit.from, unit.to) });
    }
  }
  const preambleText = layout
    .flatMap((segment) => ("preamble" in segment ? [segment.preamble] : []))
    .join("\n");
  return { parts, preamble: { text: preambleText, rev: revOf(preambleText) }, layout };
};

/**
 * Where each unit of `parsePerformance(source).layout` sits in the Source, in the same order: a
 * Part's whole text, or a Preamble segment's trimmed text.
 */
export type Located = ({ readonly part: Part } | { readonly preamble: true }) & {
  readonly from: number;
  readonly to: number;
};

export const locate = (source: string): Array<Located> => {
  const { program, comments } = parseSource(source);
  const units: Array<Located> = [];
  let cursor = 0;
  const addPreamble = (from: number, to: number) => {
    const segment = source.slice(from, to);
    const start = from + (segment.length - segment.trimStart().length);
    const end = from + segment.trimEnd().length;
    if (end > start) units.push({ preamble: true, from: start, to: end });
  };
  for (const statement of program.body) {
    if (statement.type !== "LabeledStatement") continue;
    const label = readLabel(statement.label.name);
    // A later Part with a taken identity is Preamble, so each identity addresses one Part.
    if (label === undefined || units.some((unit) => "part" in unit && unit.part.id === label.id))
      continue;
    const from = leadingCommentsStart(source, comments, cursor, statement.start);
    const to = trailingCommentEnd(source, comments, codeEnd(source, comments, statement));
    addPreamble(cursor, from);
    const text = source.slice(from, to);
    units.push({
      part: { ...label, text, rev: revOf(text), surface: surfaceOf(statement) },
      from,
      to,
    });
    cursor = to;
  }
  addPreamble(cursor, source.length);
  return units;
};

/**
 * Mid-keystroke the Source is often not valid JavaScript. Then the loose parser recovers, so a
 * half-typed Part stays that Part and the Parts around it stay whole.
 */
const parseSource = (source: string): { program: Program; comments: ReadonlyArray<Comment> } => {
  const comments: Array<Comment> = [];
  try {
    return { program: parse(source, { ...parseOptions, onComment: comments }), comments };
  } catch {
    const looseComments: Array<Comment> = [];
    const program = parseLoose(source, { ...parseOptions, onComment: looseComments });
    return { program, comments: looseComments };
  }
};

/**
 * Where a statement's code ends. The loose parser can end a broken statement after the whitespace
 * and comments that follow it; those are given back, to be attached by the comment rules.
 */
const codeEnd = (
  source: string,
  comments: ReadonlyArray<Comment>,
  statement: LabeledStatement,
): number => {
  let end = statement.end;
  for (;;) {
    end = statement.start + source.slice(statement.start, end).trimEnd().length;
    const last = comments.find((comment) => comment.end === end && comment.start > statement.start);
    if (last === undefined) return end;
    end = last.start;
  }
};

/**
 * A label's identity and marks, by the rules of `Pattern.prototype.p` and `repl.evaluate` in
 * `@strudel/core@1.2.6` (the transpiler itself only turns `x: y` into `y.p('x')`):
 * - a label starting or ending with `_` is muted, and never soloed;
 * - a label longer than one character starting with `S` is soloed, so `Snare:` is `nare`, soloed;
 * - a label containing `$` is numbered rather than named, so it is no Part.
 * The identity strips those marks. `undefined` means the label addresses no Part.
 */
export const readLabel = (label: string): Pick<Part, "id" | "muted" | "soloed"> | undefined => {
  if (label.includes("$")) return undefined;
  const muted = label.startsWith("_") || label.endsWith("_");
  const bare = label.replace(/^_+|_+$/g, "");
  const soloMarked = bare.length > 1 && bare.startsWith("S");
  const id = soloMarked ? bare.slice(1) : bare;
  if (id === "") return undefined;
  return { id, muted, soloed: soloMarked && !muted };
};

/** Visual when the expression is exactly a host `hydra` tagged template (ADR 0001 amendment). */
const surfaceOf = (statement: LabeledStatement): Surface =>
  hydraTemplateOf(statement) === undefined ? "audio" : "visual";

/** The labelled statement's expression, when it is exactly a host `hydra` tagged template. */
export const hydraTemplateOf = ({
  body,
}: LabeledStatement): TaggedTemplateExpression | undefined =>
  body.type === "ExpressionStatement" &&
  body.expression.type === "TaggedTemplateExpression" &&
  body.expression.tag.type === "Identifier" &&
  body.expression.tag.name === "hydra"
    ? body.expression
    : undefined;

/**
 * Where a Part starts: at the first of the comments that sit alone on the lines directly above its
 * label, with no blank line between. Nothing before `floor` (the previous unit's end) is taken.
 */
const leadingCommentsStart = (
  source: string,
  comments: ReadonlyArray<Comment>,
  floor: number,
  labelStart: number,
): number => {
  let start = labelStart;
  for (const comment of [...comments].reverse()) {
    if (comment.end > start) continue;
    const aloneOnItsLine =
      source.slice(lineStart(source, comment.start), comment.start).trim() === "";
    if (
      comment.start < floor ||
      !aloneOnItsLine ||
      !isOneLineBreak(source.slice(comment.end, start))
    )
      break;
    start = comment.start;
  }
  return start;
};

/** Where a Part ends: after any comments on the same line as the end of its statement. */
const trailingCommentEnd = (
  source: string,
  comments: ReadonlyArray<Comment>,
  statementEnd: number,
): number => {
  let end = statementEnd;
  for (const comment of comments) {
    if (comment.start < end) continue;
    if (!/^[ \t]*$/.test(source.slice(end, comment.start))) break;
    end = comment.end;
  }
  return end;
};

const lineStart = (source: string, offset: number) => source.lastIndexOf("\n", offset - 1) + 1;

/** Whitespace holding exactly one line break: the next line, with no blank line between. */
const isOneLineBreak = (between: string) => /^[ \t]*\r?\n[ \t]*$/.test(between);
