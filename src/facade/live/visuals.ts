import { parse } from "acorn";
import { hydraTemplateOf, parseOptions, readLabel } from "../../core/Performance";

/**
 * The host's Hydra glue in place of `@strudel/hydra` (spec §8, ADR 0002 amendment): one live
 * `hydra-synth` drawing on a fixed, full-screen canvas behind the page, and the `hydra` tag that
 * runs each Visual Part's body on it.
 */
export interface Visuals {
  /**
   * The `hydra` tag, for Strudel's eval scope. Strudel's transpiler leaves a tagged template's body
   * alone and turns ``viz: hydra`…` `` into ``hydra`…`.p('viz')``, so the body runs in that `.p`,
   * once the tag knows its Part. It gives `silence` and registers nothing with the repl, so
   * soloing a Visual Part leaves the Audio Parts playing.
   */
  readonly hydra: (
    strings: TemplateStringsArray,
    ...values: ReadonlyArray<unknown>
  ) => { readonly p: (label: unknown) => unknown };
  /**
   * Readies the canvas for evaluating `code`: every output back to transparent, `render(o0)`, and
   * `update`/`afterUpdate` cleared (spec §5 step 2). Call it synchronously before every evaluate.
   */
  readonly prepare: (code: string) => void;
  readonly dispose: () => void;
}

/** An error in a Visual Part's body, at `offset` in the code being evaluated. */
export class VisualError extends Error {
  constructor(
    message: string,
    readonly offset: number,
  ) {
    super(message);
    this.name = "VisualError";
  }
}

/** A Visual Part in the code being evaluated. */
interface VisualPart {
  /** Its label as written, marks included, as the transpiler passes it to `.p`. */
  readonly label: string;
  /** Where its body starts in the code. */
  readonly bodyStart: number;
  /** Where the body's first `${` is, if it has one. */
  readonly firstInterpolationAt: number;
  /** Muted, or soloed out within the Visual Surface: its body does not run. */
  readonly skipped: boolean;
}

/** Builds the canvas and the live Hydra; `silence` is what the tag gives Strudel. */
export const createVisuals = async (silence: unknown): Promise<Visuals> => {
  const { default: Hydra } = await import("hydra-synth");
  const canvas = document.createElement("canvas");
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    // Behind the page's content, above its background.
    zIndex: "-1",
  });
  document.body.prepend(canvas);
  const hydra = new Hydra({
    canvas,
    width: innerWidth,
    height: innerHeight,
    // Hydra's globals would overwrite Strudel's `speed`, `shape`, `time`, `hush`, `noise` and `src`.
    makeGlobal: false,
    // Hydra's own loop has no way to stop it.
    autoLoop: false,
    detectAudio: false,
    enableStreamCapture: false,
  });
  let frame = requestAnimationFrame(function draw(then: number) {
    frame = requestAnimationFrame((now) => {
      hydra.tick(now - then);
      draw(now);
    });
  });
  const resize = () => {
    hydra.setResolution(innerWidth, innerHeight);
  };
  addEventListener("resize", resize);

  const scope = hydraScope(hydra.synth);
  let parts: Array<VisualPart> = [];

  return {
    hydra: (strings, ...values) => ({
      p: (label) => {
        const index = parts.findIndex((part) => part.label === label);
        const part = parts[index];
        // A `hydra` template anywhere but as a Part's whole expression draws nothing.
        if (part === undefined) return silence;
        parts.splice(index, 1);
        if (part.skipped) return silence;
        if (values.length > 0)
          throw new VisualError(
            "a hydra template takes no ${…}: only Hydra's names are in scope",
            part.firstInterpolationAt,
          );
        run(strings.raw[0] ?? "", part.bodyStart, scope);
        return silence;
      },
    }),
    prepare: (code) => {
      const { synth } = hydra;
      for (const output of hydra.o) synth.solid(0, 0, 0, 0).out(output);
      synth.render(hydra.o[0]);
      synth.update = () => {};
      synth.afterUpdate = () => {};
      parts = visualPartsIn(code);
    },
    dispose: () => {
      cancelAnimationFrame(frame);
      removeEventListener("resize", resize);
      hydra.regl.destroy();
      canvas.remove();
    },
  };
};

/**
 * The Visual Parts in `code`, in order, by the parser's rules: a later Part with a taken identity
 * is Preamble, so its body never runs. Code that does not parse has none; its evaluation fails
 * before any body could run.
 */
const visualPartsIn = (code: string): Array<VisualPart> => {
  let program;
  try {
    program = parse(code, parseOptions);
  } catch {
    return [];
  }
  const taken = new Set<string>();
  const parts = program.body.flatMap((statement) => {
    if (statement.type !== "LabeledStatement") return [];
    const marks = readLabel(statement.label.name);
    if (marks === undefined || taken.has(marks.id)) return [];
    taken.add(marks.id);
    const [first] = hydraTemplateOf(statement)?.quasi.quasis ?? [];
    if (first === undefined) return [];
    const { name: label } = statement.label;
    return [{ label, bodyStart: first.start, firstInterpolationAt: first.end, ...marks }];
  });
  const soloing = parts.some((part) => part.soloed);
  return parts.map(({ label, bodyStart, firstInterpolationAt, muted, soloed }) => ({
    label,
    bodyStart,
    firstInterpolationAt,
    skipped: muted || (soloing && !soloed),
  }));
};

/** Runs a Visual Part's `body`, which starts at `from` in the code, with only `scope`'s names. */
const run = (body: string, from: number, scope: object) => {
  try {
    parse(body, { ecmaVersion: 2022, allowReturnOutsideFunction: true });
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/ \(\d+:\d+\)$/, "") : "";
    const pos = error instanceof SyntaxError && "pos" in error ? Number(error.pos) : 0;
    throw new VisualError(message, from + pos);
  }
  try {
    // Sloppy mode, as Strudel's own eval is, for `with`.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    (Function("scope", `with (scope) {${body}\n}`) as (scope: object) => void)(scope);
  } catch (error) {
    throw new VisualError(error instanceof Error ? error.message : String(error), from);
  }
};

/**
 * The names a Visual Part's body sees: Hydra's, and JavaScript's own. Everything else on
 * `globalThis`, Strudel's names included, is hidden, so `speed` or `sine` is not defined there. A
 * name the body assigns without declaring it is kept here, not on `globalThis`, so nothing leaks.
 */
const hydraScope = (synth: Record<string, unknown>): object => {
  const assigned = new Map<string, unknown>();
  return new Proxy(Object.create(null) as object, {
    has: (_, name) => typeof name === "string" && !languageGlobals.has(name),
    get: (_, name) => {
      if (typeof name !== "string") return undefined;
      if (name in synth) return synth[name];
      if (assigned.has(name)) return assigned.get(name);
      throw new ReferenceError(`${name} is not defined`);
    },
    set: (_, name, value) => {
      if (typeof name !== "string") return false;
      if (name in synth) synth[name] = value;
      else assigned.set(name, value);
      return true;
    },
  });
};

/** The globals a Visual Part may use besides Hydra's: the language's own. */
const languageGlobals = new Set([
  "Array",
  "BigInt",
  "Boolean",
  "Date",
  "Error",
  "Infinity",
  "JSON",
  "Map",
  "Math",
  "NaN",
  "Number",
  "Object",
  "Promise",
  "RangeError",
  "ReferenceError",
  "RegExp",
  "Set",
  "String",
  "Symbol",
  "TypeError",
  "WeakMap",
  "WeakSet",
  "console",
  "globalThis",
  "isFinite",
  "isNaN",
  "parseFloat",
  "parseInt",
  "undefined",
]);
