import type { Part, Performance } from "./Performance";

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
  const preambleInPlace = inScope(scope, preambleId) || live.preamble === performance.preamble.text;
  // Out of Scope and diverged, the Preamble's Live code is one text with no place between Parts;
  // it goes first, where helpers must be defined before the Parts that use them.
  const units: Array<[string, string | undefined]> = preambleInPlace
    ? []
    : [[preambleId, live.preamble]];
  for (const segment of performance.layout) {
    if ("preamble" in segment) {
      if (preambleInPlace) units.push([preambleId, segment.preamble]);
    } else {
      const { id, text } = segment.part;
      units.push([id, inScope(scope, id) ? text : live.parts.get(id)]);
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

/** Written but not yet running (CONTEXT.md): its current text is not its Live code. */
export const isUnapplied = (part: Part, live: LiveCode): boolean =>
  live.parts.get(part.id) !== part.text;
