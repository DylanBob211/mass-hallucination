import { parse, tokenizer } from "acorn";
import { Data, Effect, Either } from "effect";
import type { Options } from "prettier";
import * as acornPlugin from "prettier/plugins/acorn";
import * as estreePlugin from "prettier/plugins/estree";
import { formatWithCursor } from "prettier/standalone";
import { hydraBodyOf, hydraTemplateOf, parseOptions, parsePerformance } from "./Performance";

/** A Format's outcome (CONTEXT.md): the Source with its Layout rewritten, or why it was refused. */
export type Formatted =
  | { readonly ok: true; readonly source: string; readonly cursor: number }
  | { readonly ok: false; readonly reason: string };

const printWidth = 80;
/** How far a Visual Part's code is indented inside its template. */
const bodyIndent = "  ";

const prettierOptions: Options = {
  parser: "acorn",
  plugins: [acornPlugin, estreePlugin],
  printWidth,
  semi: false,
  arrowParens: "avoid",
  quoteProps: "preserve",
  // Template strings are Mini-notation or a Visual Part's code, never Prettier's to touch.
  embeddedLanguageFormatting: "off",
};

interface Laid {
  readonly source: string;
  readonly cursor: number;
}

/**
 * Rewrites the Layout of the whole Source, Visual Parts' code included, and keeps `cursor` on the
 * code it was on.
 */
export const formatSource = (source: string, cursor: number): Effect.Effect<Formatted> =>
  Effect.gen(function* () {
    const laid = yield* Effect.either(layOut(source, cursor, printWidth));
    if (Either.isLeft(laid)) return { ok: false, reason: syntaxErrorOf(laid.left) };
    const formatted = yield* withVisualCodeLaidOut(laid.right);
    // What makes a Format safe (ADR 0008): refused, not landed, should it ever change code.
    if (revsOf(formatted.source) !== revsOf(source))
      return { ok: false, reason: "it would change the code" };
    return { ok: true, ...formatted };
  });

const revsOf = (source: string) => {
  const { preamble, parts } = parsePerformance(source);
  return JSON.stringify([preamble.rev, ...parts.map(({ id, rev }) => [id, rev])]);
};

/**
 * `code` laid out by Prettier. Prettier rewrites every string to one quote style, but quotes
 * decide what is Mini-notation, so each string is given back exactly as it was written.
 */
const layOut = (code: string, cursor: number, width: number): Effect.Effect<Laid, Unparsed> =>
  Effect.tryPromise({
    try: () =>
      formatWithCursor(code, { ...prettierOptions, printWidth: width, cursorOffset: cursor }),
    catch: unparsed,
  }).pipe(
    Effect.map(({ formatted, cursorOffset }) => withStringsOf(code, formatted, cursorOffset)),
  );

/** Code Prettier could not parse; `line` is where, when it says. */
class Unparsed extends Data.TaggedError("Unparsed")<{ readonly line: number | undefined }> {}

const unparsed = (error: unknown) => {
  const line = (error as { loc?: { start?: { line?: unknown } } }).loc?.start?.line;
  return new Unparsed({ line: typeof line === "number" ? line : undefined });
};

/** The status line's words for a refused Format. */
const syntaxErrorOf = ({ line }: Unparsed): string =>
  line === undefined ? "syntax error" : `syntax error at line ${String(line)}`;

/**
 * `formatted` with each string as `original` writes it. Prettier neither adds, drops nor reorders
 * strings, so the nth string of one is the nth of the other.
 */
const withStringsOf = (original: string, formatted: string, cursor: number): Laid => {
  const written = stringsIn(original);
  let source = "";
  let at = 0;
  let movedCursor = cursor;
  stringsIn(formatted).forEach(({ start, end }, index) => {
    const raw = written[index]?.raw ?? formatted.slice(start, end);
    source += formatted.slice(at, start) + raw;
    at = end;
    if (cursor >= end) movedCursor += raw.length - (end - start);
    // Inside a string, the cursor keeps its distance from the nearer quote: escapes may differ.
    else if (cursor > start)
      movedCursor =
        cursor - start <= end - cursor
          ? source.length - raw.length + (cursor - start)
          : source.length - (end - cursor);
  });
  return { source: source + formatted.slice(at), cursor: movedCursor };
};

const stringsIn = (code: string) =>
  [...tokenizer(code, { ...parseOptions, allowReturnOutsideFunction: true })]
    .filter((token) => token.type.label === "string")
    .map(({ start, end }) => ({ start, end, raw: code.slice(start, end) }));

/**
 * `laid` with each Visual Part's code laid out inside its template: on the label's line when it
 * fits, else on lines of its own, indented. Code that does not parse, or that holds a template of
 * its own (whose text indenting would change), is left as it is.
 */
const withVisualCodeLaidOut = ({ source, cursor }: Laid): Effect.Effect<Laid> =>
  Effect.gen(function* () {
    const bodies = parse(source, parseOptions).body.flatMap((statement) => {
      const template =
        statement.type === "LabeledStatement" ? hydraTemplateOf(statement) : undefined;
      const body = template === undefined ? undefined : hydraBodyOf(template);
      const quasi = template?.quasi.quasis[0];
      return body === undefined || quasi === undefined || body.includes("`")
        ? []
        : [{ body, from: quasi.start, to: quasi.end }];
    });
    let laid = "";
    let at = 0;
    let movedCursor = cursor;
    for (const { body, from, to } of bodies) {
      const inside = cursor >= from && cursor <= to;
      const laidCode = yield* Effect.either(
        layOut(body, inside ? cursor - from : 0, printWidth - bodyIndent.length),
      );
      if (Either.isLeft(laidCode)) continue;
      const code = laidCode.right;
      laid += source.slice(at, from);
      const lines = code.source.trimEnd().split("\n");
      const [first = ""] = lines;
      const lineStart = source.lastIndexOf("\n", from - 1) + 1;
      const lineEnd = source.indexOf("\n", to);
      const after = source.slice(to, lineEnd === -1 ? source.length : lineEnd);
      // Inline, the closing backtick and whatever follows it stay on the label's line.
      const inline =
        lines.length === 1 && from - lineStart + first.length + after.length <= printWidth;
      const insert = inline
        ? first
        : `\n${lines.map((line) => (line === "" ? "" : bodyIndent + line)).join("\n")}\n`;
      if (inside) {
        const before = code.source.slice(0, code.cursor);
        // Every line up to the cursor's is indented, but for blank ones.
        const indented = lines
          .slice(0, before.split("\n").length)
          .filter((line) => line !== "").length;
        movedCursor =
          laid.length + (inline ? before.length : 1 + before.length + indented * bodyIndent.length);
      } else if (cursor > to) movedCursor += insert.length - (to - from);
      laid += insert;
      at = to;
    }
    return { source: laid + source.slice(at), cursor: movedCursor };
  });
