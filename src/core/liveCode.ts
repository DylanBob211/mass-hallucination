import { applyChanges, type TextChange } from "./Editor";
import {
  locate,
  type Part,
  type Performance,
  parsePerformance,
  revOf,
  type Segment,
} from "./Performance";

/**
 * What is actually running (CONTEXT.md): per Part identity, and for the Preamble, the text as of
 * the last successful Apply that had it in Scope. The only thing stored besides the Source
 * (spec §4). Absent means never applied.
 */
export interface LiveCode {
  readonly parts: ReadonlyMap<string, string>;
  readonly preamble: string | undefined;
}

export const noLiveCode: LiveCode = Object.freeze({ parts: new Map(), preamble: undefined });

/** How a Scope names the Preamble; no Part can have it as its identity. */
export const preambleId = "(preamble)";

/**
 * The Parts an Apply makes live (CONTEXT.md): every Part, or the named ones. Only every Part
 * applies a deletion (ADR 0003).
 */
export type Scope = "every" | ReadonlyArray<string>;

const inScope = (scope: Scope, id: string) => scope === "every" || scope.includes(id);

/** The transient document an Apply evaluates, and where each unit sits in it. */
export interface Composition {
  readonly code: string;
  /** Where each unit's text sits in `code`, by Part identity or `preambleId`. */
  readonly units: ReadonlyArray<{
    readonly id: string;
    readonly from: number;
    readonly to: number;
  }>;
}

/**
 * The composition an Apply of `scope` evaluates (spec §5, ADR 0002): the Source's units in order,
 * in-Scope ones as their current text and the rest as their Live code, then the deleted Parts
 * still sounding. Never written back.
 */
export const compose = (performance: Performance, live: LiveCode, scope: Scope): Composition => {
  const preambleInPlace =
    inScope(scope, preambleId) || sameCode(performance.preamble.text, live.preamble);
  // Out of Scope and diverged, the Preamble's Live code is one text with no place between Parts;
  // it goes first, where helpers must be defined before the Parts that use them.
  const units: Array<[string, string | undefined]> = preambleInPlace
    ? []
    : [[preambleId, live.preamble]];
  for (const segment of performance.segments) {
    if ("preamble" in segment) {
      if (preambleInPlace) units.push([preambleId, segment.preamble]);
    } else {
      const { id, text } = segment.part;
      const running = live.parts.get(id);
      // Text whose Layout alone changed plays as written, so what plays is what the Source shows.
      units.push([id, inScope(scope, id) || sameCode(text, running) ? text : running]);
    }
  }
  if (scope !== "every") units.push(...deleted(performance, live));
  let code = "";
  const placed: Array<Composition["units"][number]> = [];
  for (const [id, text] of units) {
    if (text === undefined) continue;
    if (code !== "") code += "\n";
    placed.push({ id, from: code.length, to: code.length + text.length });
    code += text;
  }
  return { code, units: placed };
};

/**
 * The unit whose text holds `offset` in the composition. An offset just past a unit's end, where
 * an unfinished last line is found, is that unit's.
 */
export const unitAt = ({ units }: Composition, offset: number): string | undefined =>
  units.find(({ from, to }) => from <= offset && offset <= to)?.id;

/** The Live code once `compose(performance, live, scope)` has evaluated successfully. */
export const liveCodeAfter = (performance: Performance, live: LiveCode, scope: Scope): LiveCode => {
  const parts = new Map(live.parts);
  for (const { id, text } of performance.parts) if (inScope(scope, id)) parts.set(id, text);
  if (scope === "every") for (const [id] of deleted(performance, live)) parts.delete(id);
  return Object.freeze({
    parts,
    preamble: inScope(scope, preambleId) ? performance.preamble.text : live.preamble,
  });
};

/** Parts absent from the Source that still hold Live code: deletions, still sounding. */
export const deleted = (performance: Performance, live: LiveCode): Array<[string, string]> =>
  [...live.parts].filter(([id]) => !performance.parts.some((part) => part.id === id));

/**
 * Whether each of `written`, keyed as in `withTexts`, is still its unit's code in `performance`:
 * the human has neither edited, undone nor deleted it, though they may have changed its Layout.
 */
export const holds = (performance: Performance, written: ReadonlyMap<string, string>): boolean =>
  [...written].every(([id, text]) => {
    const unit =
      id === preambleId ? performance.preamble : performance.parts.find((part) => part.id === id);
    return unit !== undefined && sameCode(unit.text, id === preambleId ? text.trim() : text);
  });

/** Written but not yet running (CONTEXT.md): its current code is not its Live code. */
export const isUnapplied = (part: Part, live: LiveCode): boolean =>
  !sameCode(part.text, live.parts.get(part.id));

/** Whether the Preamble's current code is not its Live code. */
export const isPreambleUnapplied = (performance: Performance, live: LiveCode): boolean =>
  !sameCode(performance.preamble.text, live.preamble);

/** Whether two texts are the same code, in whatever Layout (ADR 0008). */
export const sameCode = (text: string, other: string | undefined): boolean =>
  other !== undefined && (text === other || revOf(text) === revOf(other));

/**
 * The Performance once `texts` are written, each keyed by a Part's identity or by `preambleId`: a
 * Part's text replaces it where it stands, a new Part goes at the end, and the Preamble's text
 * replaces all its segments, where the first one stood (or at the top). A text keeps its key as
 * its identity even when its label says otherwise.
 */
export const withTexts = (
  performance: Performance,
  texts: ReadonlyMap<string, string>,
): Performance => {
  const preamble = texts.get(preambleId);
  const segments: Array<Segment> = [];
  let preamblePlaced = preamble === undefined;
  for (const segment of performance.segments) {
    if ("part" in segment) {
      const text = texts.get(segment.part.id);
      segments.push(text === undefined ? segment : { part: partOf(segment.part.id, text) });
    } else if (preamble === undefined) {
      segments.push(segment);
    } else if (!preamblePlaced) {
      preamblePlaced = true;
      if (preamble.trim() !== "") segments.push({ preamble: preamble.trim() });
    }
  }
  if (preamble !== undefined && !preamblePlaced && preamble.trim() !== "")
    segments.unshift({ preamble: preamble.trim() });
  for (const [id, text] of texts)
    if (id !== preambleId && !performance.parts.some((part) => part.id === id))
      segments.push({ part: partOf(id, text) });
  const parts = segments.flatMap((segment) => ("part" in segment ? [segment.part] : []));
  const preambleText = segments
    .flatMap((segment) => ("preamble" in segment ? [segment.preamble] : []))
    .join("\n");
  return { parts, preamble: { text: preambleText, rev: revOf(preambleText) }, segments };
};

/**
 * The composition an Apply of `scope` evaluates once `texts` are written (see `withTexts`). Every
 * text is in Scope, as a text left out would land unevaluated.
 */
export const composeWith = (
  performance: Performance,
  live: LiveCode,
  scope: Scope,
  texts: ReadonlyMap<string, string>,
): Composition =>
  compose(
    withTexts(performance, texts),
    live,
    scope === "every" ? scope : [...new Set([...scope, ...texts.keys()])],
  );

/**
 * The changes that write `texts` into `source`, laid out as `withTexts` lays them, so that the
 * Source written parses to the Performance the dry-run checked. A blank line is added where a
 * written text would otherwise run into its neighbour, such as a Preamble ending in a comment
 * directly above a Part, which would become that Part's.
 */
export const writeTexts = (
  source: string,
  texts: ReadonlyMap<string, string>,
): ReadonlyArray<TextChange> => {
  const expected = segmentsOf(withTexts(parsePerformance(source), texts));
  const tight = writeTextsWith(source, texts, "");
  return segmentsOf(parsePerformance(applyChanges(source, tight))) === expected
    ? tight
    : writeTextsWith(source, texts, "\n");
};

const segmentsOf = ({ segments }: Performance) =>
  JSON.stringify(
    segments.map((segment) =>
      "part" in segment ? [segment.part.id, segment.part.text] : segment.preamble,
    ),
  );

const writeTextsWith = (
  source: string,
  texts: ReadonlyMap<string, string>,
  padding: string,
): Array<TextChange> => {
  const preamble = texts.get(preambleId)?.trim();
  const changes: Array<TextChange> = [];
  let preamblePlaced = preamble === undefined;
  const units = locate(source);
  for (const unit of units) {
    if ("part" in unit) {
      const text = texts.get(unit.part.id);
      if (text !== undefined) changes.push({ from: unit.from, to: unit.to, insert: text });
    } else if (preamble !== undefined) {
      const insert = preamblePlaced || preamble === "" ? "" : preamble + padding;
      preamblePlaced = true;
      changes.push({ from: unit.from, to: unit.to, insert });
    }
  }
  if (preamble !== undefined && !preamblePlaced && preamble !== "")
    changes.push({ from: 0, to: 0, insert: `${preamble}\n${padding}` });
  const added = [...texts].filter(
    ([id]) => id !== preambleId && !units.some((unit) => "part" in unit && unit.part.id === id),
  );
  if (added.length > 0) {
    const before = source === "" ? "" : source.endsWith("\n") ? padding : `\n${padding}`;
    const insert = before + added.map(([, text]) => text).join(`\n${padding}`);
    changes.push({ from: source.length, to: source.length, insert });
  }
  return changes;
};

/** The Part `text` makes, addressed as `id`. */
const partOf = (id: string, text: string): Part => {
  const parsed = parsePerformance(text).parts[0];
  return {
    muted: parsed?.muted ?? false,
    soloed: parsed?.soloed ?? false,
    surface: parsed?.surface ?? "audio",
    id,
    text,
    rev: revOf(text),
  };
};
