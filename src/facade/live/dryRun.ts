import type * as StrudelWeb from "@strudel/web";
import { type AnyNode, parse } from "acorn";
import { parseOptions } from "../../core/Performance";
import type { DryRunWarning } from "../../core/Strudel";

/**
 * The audio dry-run (spec §6.3, ADR 0004): evaluates `code` as `repl.evaluate` would, but touches
 * nothing that plays. It runs the transpiler and a copy of `@strudel/core@1.2.6`'s eval step
 * (`evaluate.mjs`), with the names that act on the repl shadowed, `.p` collecting patterns instead
 * of registering them and `.play` doing nothing. Then it queries what was collected over
 * `dryRunCycles` cycles. Throws what a real evaluate would report, or a refusal of its own.
 *
 * Call it only while no real evaluate runs, as it swaps `Pattern.prototype.p` for the duration.
 */
export const evaluateDry = async (
  strudel: typeof StrudelWeb,
  code: string,
  now: () => number = () => performance.now(),
): Promise<void> => {
  const { Pattern, isPattern, silence, stack, State, TimeSpan, transpiler } = strudel;
  const methods = Pattern.prototype;
  const { p, play } = methods;
  // By `repl.evaluate`'s rules: muted ids give silence, `$` ids are numbered, a later id replaces
  // an earlier one.
  const collected = new Map<unknown, StrudelWeb.Pattern>();
  let anonymous = 0;
  let hushed = false as boolean;
  methods.p = function (this: StrudelWeb.Pattern, id: unknown) {
    if (typeof id === "string" && (id.startsWith("_") || id.endsWith("_"))) return silence;
    // The repl's `.p` throws on the numbered ids `d1`…`d9` pass it; so does this one.
    if (typeof id !== "string") throw new TypeError("id.includes is not a function");
    collected.set(id.includes("$") ? `${id}${String(anonymous++)}` : id, this);
    return this;
  };
  methods.play = function (this: StrudelWeb.Pattern) {
    return this;
  };
  let evaluated: unknown;
  try {
    const { output } = transpiler(code, {});
    const stubs = shadowed.map((name) =>
      name === "hush"
        ? () => {
            hushed = true;
            return silence;
          }
        : name === "samples"
          ? () => Promise.resolve()
          : name === "hydra"
            ? () => ({ p: () => silence })
            : () => silence,
    );
    // The eval step itself, as core runs it, with the shadowing names as parameters.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const run = Function(...shadowed, `"use strict";return ((async ()=>{${output}})())`) as (
      ...args: ReadonlyArray<unknown>
    ) => Promise<unknown>;
    evaluated = await run(...stubs);
  } finally {
    methods.p = p;
    methods.play = play;
  }
  if (hushed) throw new Error("hush() is not allowed: it would silence every Part");

  const soloed = [...collected].filter(([id]) => isSoloId(id));
  const patterns = (soloed.length > 0 ? soloed : [...collected]).map(([, pattern]) => pattern);
  const pattern =
    patterns.length > 0 ? stack(...patterns) : isPattern(evaluated) ? evaluated : silence;
  // `query`, never `queryArc`, which logs a pattern's error and returns no events. A query is
  // synchronous, so the cap is checked between cycles: one cycle that never ends hangs the page.
  const started = now();
  for (let cycle = 0; cycle < dryRunCycles; cycle++) {
    pattern.query(new State(new TimeSpan(cycle, cycle + 1)));
    if (now() - started > dryRunTimeCap)
      throw new Error(
        `querying cycles 0–${String(dryRunCycles)} took over ${String(dryRunTimeCap)} ms`,
      );
  }
};

/**
 * Names that act on the repl, the network or the canvas; in a dry-run they are parameters that do
 * nothing.
 */
const shadowed = [
  "hush",
  "all",
  "each",
  "setcps",
  "setCps",
  "setcpm",
  "setCpm",
  "samples",
  "evaluate",
  // Visual Parts draw on the live canvas; their dry-run is Hydra's own (ticket 16).
  "hydra",
] as const;

export const dryRunCycles = 8;

/** Milliseconds the query may take (spec §6.3). A query is synchronous, so it is checked per cycle. */
export const dryRunTimeCap = 250;

/** `repl.evaluate`'s solo rule: an id longer than one character starting with `S`. */
const isSoloId = (id: unknown) => typeof id === "string" && id.length > 1 && id.startsWith("S");

/**
 * Where one method chain sets a control under two of its registered names (`size` and `roomsize`,
 * `legato` and `clip`): one silently overrides the other. `sameControl` tells whether two
 * different names are one control. Code that does not parse gets no warnings; its evaluation
 * fails anyway.
 */
export const synonymsSetTwice = (
  code: string,
  sameControl: (a: string, b: string) => boolean,
): Array<Required<DryRunWarning>> => {
  let program: AnyNode;
  try {
    program = parse(code, parseOptions);
  } catch {
    return [];
  }
  const warnings: Array<Required<DryRunWarning>> = [];
  const visit = (node: AnyNode): void => {
    if (!isChainLink(node)) {
      for (const child of childrenOf(node)) visit(child);
      return;
    }
    // Down the chain from its last call to its start; each argument starts chains of its own.
    const names: Array<string> = [];
    let link: AnyNode = node;
    while (isChainLink(link)) {
      const member = link.type === "CallExpression" ? link.callee : link;
      if (link.type === "CallExpression") {
        if (member.type === "MemberExpression" && member.property.type === "Identifier")
          names.unshift(member.property.name);
        for (const argument of link.arguments) visit(argument);
      }
      if (member.type !== "MemberExpression") break;
      if (member.computed) visit(member.property);
      link = member.object;
    }
    visit(link);
    const warned = new Set<string>();
    names.forEach((first, i) => {
      for (const second of names.slice(i + 1)) {
        const pair = `${first} and ${second}`;
        if (first === second || warned.has(pair) || !sameControl(first, second)) continue;
        warned.add(pair);
        warnings.push({
          message: `${pair} set the same control; only the last one counts`,
          offset: node.start,
        });
      }
    });
  };
  visit(program);
  return warnings.sort((a, b) => a.offset - b.offset);
};

/** Whether `a` and `b` are registered names of one control: an alias shares its control's method. */
export const sameControlIn =
  ({ isControlName, Pattern }: typeof StrudelWeb) =>
  (a: string, b: string): boolean => {
    const methods = Pattern.prototype as unknown as Record<string, unknown>;
    return isControlName(a) && isControlName(b) && methods[a] === methods[b];
  };

/** A method call or a property read on a value: one link of a chain. */
const isChainLink = (node: AnyNode) =>
  node.type === "MemberExpression" ||
  (node.type === "CallExpression" && node.callee.type === "MemberExpression");

/** The nodes directly under `node`, in the order acorn keeps them. */
export const childrenOf = (node: AnyNode): Array<AnyNode> =>
  (Object.values(node) as ReadonlyArray<unknown>).flatMap((value) =>
    (Array.isArray(value) ? (value as ReadonlyArray<unknown>) : [value]).filter(isNode),
  );

const isNode = (value: unknown): value is AnyNode =>
  typeof value === "object" && value !== null && "type" in value && typeof value.type === "string";
