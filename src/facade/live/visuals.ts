import { parse } from "acorn";
import type { Output, Source } from "hydra-synth";
import { hydraTemplateOf, parseOptions, readLabel } from "../../core/Performance";
import type { PlaybackError, VisualErrorKind } from "../../core/Strudel";
import type { AudioLinkedHelpers } from "./audioLinked";

/**
 * The host's Hydra glue in place of `@strudel/hydra` (spec §8, ADR 0002 amendment): one live
 * `hydra-synth` drawing on a fixed, full-screen canvas behind the page, and the `hydra` tag that
 * runs each Visual Part's body on it. A Visual Part that fails while drawing is reported, once
 * per evaluate, and keeps drawing as Hydra lets it.
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

/** An error in a Visual Part's body, at `offset` in the code being evaluated, and its kind. */
export class VisualError extends Error {
  constructor(
    message: string,
    readonly offset: number,
    readonly kind: VisualErrorKind,
  ) {
    super(message);
    this.name = "VisualError";
  }
}

/** A function a Visual Part gives Hydra to call on every frame. */
type PerFrame = (...args: Array<unknown>) => unknown;

/** Why a `hydra` template with `${…}` is refused, at evaluate and in a dry-run alike. */
export const interpolationMessage =
  "a hydra template takes no ${…}: only Hydra's names are in scope";

/** A Visual Part in the code being evaluated. */
export interface VisualPart {
  /** Its label as written, marks included, as the transpiler passes it to `.p`. */
  readonly label: string;
  /** Its identity, which a playback error names. */
  readonly id: string;
  /** Its body, as written, up to the first `${` if it has one. */
  readonly body: string;
  /** Where its body starts in the code. */
  readonly bodyStart: number;
  /** Where the body's first `${` is, if it has one. */
  readonly firstInterpolationAt: number;
  /** Its template has a `${…}`, which the tag refuses. */
  readonly interpolated: boolean;
  /** Where its `hydra` tag is in the code. */
  readonly tagStart: number;
  /** Muted, or soloed out within the Visual Surface: its body does not run. */
  readonly skipped: boolean;
}

/**
 * Builds the canvas and the live Hydra; `silence` is what the tag gives Strudel, and `helpers`
 * are in scope in every Visual Part. Each Visual Part that fails while drawing goes to
 * `onPlaybackError` the first time it does after an evaluate.
 */
export const createVisuals = async (
  silence: unknown,
  onPlaybackError: (error: PlaybackError) => void,
  helpers: AudioLinkedHelpers,
): Promise<Visuals> => {
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

  // The Part whose body is running, if one is.
  let running: string | undefined;
  // The Part that last drew into each output since the evaluate.
  const writers = new Map<Output, string>();
  // The Parts reported since the evaluate.
  const failed = new Set<string>();
  const fail = (part: string, error: unknown) => {
    if (failed.has(part)) return;
    failed.add(part);
    onPlaybackError({ message: error instanceof Error ? error.message : String(error), part });
  };
  const blamed = new WeakSet();
  /** `fn`, telling `fail` of `part` when it throws; Hydra catches the throw and goes on. */
  const blaming = (part: string, fn: PerFrame) => {
    if (blamed.has(fn)) return fn;
    const wrapped = (...args: Array<unknown>) => {
      try {
        return fn(...args);
      } catch (error) {
        fail(part, error);
        throw error;
      }
    };
    blamed.add(wrapped);
    return wrapped;
  };

  // `out` is where a Part's chain, nested sources included, reaches Hydra: Hydra then calls its
  // parameter functions on every frame, and draws into the output on every tick.
  const source = Object.getPrototypeOf(hydra.synth.solid(0, 0, 0, 0)) as Source;
  const { out } = source;
  source.out = function (this: Source, output) {
    const part = running;
    if (part !== undefined) {
      blameFunctionsIn(this, (fn) => blaming(part, fn));
      writers.set(output ?? this.defaultOutput, part);
    }
    out.call(this, output);
  };
  const gl = hydra.regl._gl;
  for (const output of hydra.o) {
    const tick = output.tick.bind(output);
    output.tick = (props) => {
      const part = writers.get(output);
      if (part === undefined) {
        tick(props);
        return;
      }
      try {
        tick(props);
      } catch (error) {
        fail(part, error);
        throw error;
      }
      // A failed draw throws nothing and leaves the output as it was: frozen. WebGL keeps an
      // error until it is read, so one raised elsewhere since the last check (Hydra's own final
      // render, an output no Part wrote) is blamed here too. Only outputs a Part wrote are
      // checked, as each check waits on the GPU.
      const code = gl.getError();
      if (code !== gl.NO_ERROR)
        fail(part, `WebGL ${glErrorName(gl, code)} while drawing ${output.label}`);
    };
  }

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

  const scope = hydraScope(
    hydra.synth,
    (name, value) =>
      // Hydra calls these on every frame, as it does a parameter function.
      (name === "update" || name === "afterUpdate") && typeof value === "function" && running
        ? blaming(running, value as PerFrame)
        : value,
    // As a plain record of names.
    { ...helpers },
  );
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
          throw new VisualError(interpolationMessage, part.firstInterpolationAt, "syntax");
        running = part.id;
        try {
          runBody(strings.raw[0] ?? "", part.bodyStart, scope);
        } finally {
          running = undefined;
        }
        return silence;
      },
    }),
    prepare: (code) => {
      const { synth } = hydra;
      for (const output of hydra.o) synth.solid(0, 0, 0, 0).out(output);
      synth.render(hydra.o[0]);
      synth.update = () => {};
      synth.afterUpdate = () => {};
      writers.clear();
      failed.clear();
      // Errors are kept until read: drop those from before, so none is blamed on the new Parts.
      for (let left = 8; left > 0 && gl.getError() !== gl.NO_ERROR; left--);
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
export const visualPartsIn = (code: string): Array<VisualPart> => {
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
    const template = hydraTemplateOf(statement);
    const [first] = template?.quasi.quasis ?? [];
    if (template === undefined || first === undefined) return [];
    const { name: label } = statement.label;
    return [
      {
        label,
        body: first.value.raw,
        bodyStart: first.start,
        firstInterpolationAt: first.end,
        interpolated: template.quasi.expressions.length > 0,
        tagStart: template.tag.start,
        ...marks,
      },
    ];
  });
  const soloing = parts.some((part) => part.soloed);
  return parts.map(({ muted, soloed, ...part }) => ({
    ...part,
    skipped: muted || (soloing && !soloed),
  }));
};

/** Runs a Visual Part's `body`, which starts at `from` in the code, with only `scope`'s names. */
export const runBody = (body: string, from: number, scope: object) => {
  try {
    parse(body, { ecmaVersion: 2022, allowReturnOutsideFunction: true });
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/ \(\d+:\d+\)$/, "") : "";
    const pos = error instanceof SyntaxError && "pos" in error ? Number(error.pos) : 0;
    throw new VisualError(message, from + pos, "syntax");
  }
  try {
    // Sloppy mode, as Strudel's own eval is, for `with`.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    (Function("scope", `with (scope) {${body}\n}`) as (scope: object) => void)(scope);
  } catch (error) {
    if (error instanceof VisualError) throw error;
    throw new VisualError(
      error instanceof Error ? error.message : String(error),
      from,
      isNameError(error) ? "name" : "argument",
    );
  }
};

/**
 * A name nothing defines, read or called: `osk(10)`, `osc().nope()`. Anything else a body throws
 * is taken as a value Hydra, or the body itself, cannot use.
 */
const isNameError = (error: unknown) =>
  error instanceof ReferenceError ||
  (error instanceof TypeError && error.message.endsWith("is not a function"));

/** Replaces each function in `source`'s chain, and in the sources it is given, by `wrap`'s. */
const blameFunctionsIn = (source: Source, wrap: (fn: PerFrame) => PerFrame) => {
  for (const { userArgs } of source.transforms)
    userArgs.forEach((arg, index) => {
      if (typeof arg === "function") userArgs[index] = wrap(arg as PerFrame);
      else if (isSource(arg)) blameFunctionsIn(arg, wrap);
    });
};

/** A Hydra source such as `osc()`, with the chain called on it. */
export const isSource = (value: unknown): value is Source =>
  typeof value === "object" && value !== null && "transforms" in value;

/** The WebGL constant's name for an error `code`. */
const glErrorName = (gl: WebGLRenderingContext, code: number) =>
  (
    [
      "INVALID_ENUM",
      "INVALID_VALUE",
      "INVALID_OPERATION",
      "INVALID_FRAMEBUFFER_OPERATION",
      "OUT_OF_MEMORY",
      "CONTEXT_LOST_WEBGL",
    ] as const
  ).find((name) => gl[name] === code) ?? `error ${String(code)}`;

/**
 * The names a Visual Part's body sees: Hydra's, the `helpers`, and JavaScript's own. Everything
 * else on `globalThis`, Strudel's names included, is hidden, so `speed` or `sine` is not defined
 * there. A name the body assigns without declaring it is kept here, not on `globalThis`, so
 * nothing leaks. What it assigns to one of Hydra's names goes through `assigning` first.
 */
export const hydraScope = (
  synth: Record<string, unknown>,
  assigning: (name: string, value: unknown) => unknown,
  helpers: Readonly<Record<string, unknown>> = {},
): object => {
  const assigned = new Map<string, unknown>();
  return new Proxy(Object.create(null) as object, {
    has: (_, name) => typeof name === "string" && !languageGlobals.has(name),
    get: (_, name) => {
      if (typeof name !== "string") return undefined;
      if (name in synth) return synth[name];
      if (Object.hasOwn(helpers, name)) return helpers[name];
      if (assigned.has(name)) return assigned.get(name);
      throw new ReferenceError(`${name} is not defined`);
    },
    set: (_, name, value) => {
      if (typeof name !== "string") return false;
      if (name in synth) synth[name] = assigning(name, value);
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
