import { type AnyNode, type Options, parse } from "acorn";
import type { Output, Source } from "hydra-synth";
import { parseOptions, parsePerformance } from "../../core/Performance";
import type { DryRunReport, DryRunWarning } from "../../core/Strudel";
import type { VisualOutput } from "../../core/viewModel";
import { childrenOf } from "./dryRun";
import {
  hydraScope,
  interpolationMessage,
  isSource,
  runBody,
  type VisualPart,
  VisualError,
  visualPartsIn,
} from "./visuals";

/**
 * The visual step of the dry-run (ADR 0004 visual amendment): each Visual Part's body runs on a
 * throwaway `hydra-synth` with a small WebGL context of its own, so the live canvas is never
 * touched. Its `.out()` draws nothing; it records the output.
 */
export interface VisualDryRun {
  /**
   * Runs every Visual Part in `code`, muted ones included, so unmuting one never breaks. Throws
   * a `VisualError` for the first Part that fails.
   */
  readonly check: (code: string) => DryRunReport;
  readonly dispose: () => void;
}

/** The cycles a parameter function is probed at, and the values the helpers are stubbed to. */
const probedCycles = [0, 0.37, 1.5, 3.9];
const helperValues = [0, 1, 0.5];
const helperNames = ["pulse", "value", "level"] as const;

/** The moment a probe stands for, and the helpers called in it. */
interface Probe {
  cycle: number;
  helperValue: number;
  readonly called: Set<(typeof helperNames)[number]>;
}

/** Builds the throwaway Hydra, on a canvas of its own that is never shown. */
export const createVisualDryRun = async (): Promise<VisualDryRun> => {
  const { default: Hydra } = await import("hydra-synth");
  const hydra = new Hydra({
    canvas: document.createElement("canvas"),
    width: 8,
    height: 8,
    makeGlobal: false,
    autoLoop: false,
    detectAudio: false,
    enableStreamCapture: false,
  });

  const gl = hydra.regl._gl;
  // What the running Part's `.out()` calls write.
  let written: Array<VisualOutput> = [];
  const source = Object.getPrototypeOf(hydra.synth.solid(0, 0, 0, 0)) as Source;
  // Where the running Part's body starts, which its errors name.
  let bodyStart = 0;
  // Outside a probe, the helpers stand for the start, silent.
  const probe: Probe = { cycle: 0, helperValue: 0, called: new Set() };
  /** Calls each parameter function in `source` at every probe; throws for the first that fails. */
  const probeFunctionsIn = (source: Source) => {
    for (const { name, transform, userArgs } of source.transforms)
      for (const [index, arg] of userArgs.entries()) {
        if (isSource(arg)) probeFunctionsIn(arg);
        if (typeof arg !== "function") continue;
        const input = transform.inputs[index]?.name ?? `argument ${String(index + 1)}`;
        for (const cycle of probedCycles)
          for (const helperValue of helperValues) {
            Object.assign(probe, { cycle, helperValue });
            probe.called.clear();
            // Hydra calls them with its time, in seconds; at 1 cycle per second it is the cycle.
            hydra.synth.time = cycle;
            let failure: string | undefined;
            try {
              const value: unknown = (arg as (props: object) => unknown)({
                time: cycle,
                bpm: hydra.synth.bpm,
              });
              if (typeof value !== "number" || !Number.isFinite(value))
                failure = `returned ${describe(value)}`;
            } catch (error) {
              failure = error instanceof Error ? error.message : String(error);
            } finally {
              hydra.synth.time = 0;
            }
            if (failure === undefined) continue;
            const helpers = [...probe.called].map((h) => `, ${h}=${String(helperValue)}`).join("");
            throw new VisualError(
              `${name}(): ${input}, at cycle ${String(cycle)}${helpers}: ${failure}`,
              bodyStart,
              "parameter",
            );
          }
      }
  };
  // Strict where Hydra's own `out` swallows every error.
  source.out = function (this: Source, output?: unknown) {
    const target = output ?? this.defaultOutput;
    if (!hydra.o.includes(target as Output))
      throw new VisualError(
        `.out() takes o0, o1, o2 or o3, not ${describe(target)}`,
        bodyStart,
        "argument",
      );
    const refused = refusedArgument(this);
    if (refused !== undefined) throw new VisualError(refused, bodyStart, "argument");
    let passes;
    try {
      passes = this.glsl();
    } catch (error) {
      throw new VisualError(
        error instanceof Error ? error.message : String(error),
        bodyStart,
        "argument",
      );
    }
    for (const { frag } of passes) {
      const failed = compileError(gl, (target as Output).vert, frag);
      if (failed !== undefined) throw new VisualError(`shader: ${failed}`, bodyStart, "shader");
    }
    probeFunctionsIn(this);
    const { label } = target as Output;
    if (!written.includes(label as VisualOutput)) written.push(label as VisualOutput);
  };

  return {
    check: (code) => {
      // Names a body assigns are kept per dry-run, as Parts may share them. What it assigns to
      // Hydra's names, `speed` or `update`, stays here too.
      const names = Object.create(hydra.synth) as Record<string, unknown>;
      names.cycle = () => probe.cycle;
      for (const helper of helperNames)
        names[helper] = () => {
          probe.called.add(helper);
          return probe.helperValue;
        };
      const scope = hydraScope(names, (_, value) => value);
      const outputs = new Map<string, ReadonlyArray<VisualOutput>>();
      const warnings: Array<DryRunWarning> = [];
      const texts = new Map(parsePerformance(code).parts.map(({ id, text }) => [id, text]));
      // The drawn Parts writing each output, in Source order: the last one's is what shows.
      const writers = new Map<VisualOutput, Array<string>>();
      for (const part of visualPartsIn(code)) {
        if (part.interpolated)
          throw new VisualError(interpolationMessage, part.firstInterpolationAt, "syntax");
        written = [];
        ({ bodyStart } = part);
        Object.assign(probe, { cycle: 0, helperValue: 0 });
        runBody(part.body, part.bodyStart, scope);
        outputs.set(part.id, written.sort());
        if (!part.skipped)
          for (const output of written)
            writers.set(output, [...(writers.get(output) ?? []), part.id]);
        if (written.length === 0)
          warnings.push({
            message: "writes no output; nothing shows without .out()",
            offset: part.bodyStart,
          });
        warnings.push(...unheardHelpers(part, texts));
      }
      for (const [output, ids] of [...writers].sort(([a], [b]) => a.localeCompare(b))) {
        const shown = ids.at(-1);
        // It names both Parts, so it needs no place.
        for (const hidden of ids.slice(0, -1))
          warnings.push({ message: `${String(shown)} hides ${hidden} on ${output}` });
      }
      return { warnings, outputs };
    },
    dispose: () => {
      hydra.regl.destroy();
    },
  };
};

/**
 * Throws where `code` names `hydra` other than as the tag of a Visual Part, the only place the
 * tag draws. Static, so it runs before the audio step, which such code may fail less clearly.
 * Code that does not parse passes, to fail the audio step.
 */
export const checkHydraShape = (code: string): void => {
  const misplaced = misplacedHydra(code, visualPartsIn(code));
  if (misplaced !== undefined)
    throw new VisualError(
      "hydra`…` must be a Part's whole expression, as in viz: hydra`osc().out()`",
      misplaced,
      "syntax",
    );
};

const misplacedHydra = (code: string, parts: ReadonlyArray<VisualPart>): number | undefined => {
  const tags = new Set(parts.map((part) => part.tagStart));
  // A property named `hydra` is not the tag. A parent is visited before its children.
  const properties = new Set<AnyNode>();
  let found: number | undefined;
  walk(code, parseOptions, (node) => {
    if (node.type === "MemberExpression" && !node.computed) properties.add(node.property);
    if (node.type === "Property" && !node.computed) properties.add(node.key);
    if (
      found === undefined &&
      node.type === "Identifier" &&
      node.name === "hydra" &&
      !tags.has(node.start) &&
      !properties.has(node)
    )
      found = node.start;
  });
  return found;
};

/**
 * Why Hydra cannot take an argument in `source`'s chain, or in the sources it is given, if it
 * cannot: Hydra would write it into the shader as it is, or fail on it while drawing.
 */
const refusedArgument = (source: Source): string | undefined => {
  for (const { name, transform, userArgs } of source.transforms)
    for (const [index, arg] of userArgs.entries()) {
      const input = transform.inputs[index];
      if (input === undefined) continue;
      const refused =
        input.type === "float"
          ? isNumbers(arg) || typeof arg === "function" || isSource(arg)
            ? undefined
            : `${input.name} must be a number, an array of numbers or a function`
          : input.type === "vec4"
            ? isSource(arg) || hasTexture(arg)
              ? undefined
              : `its ${ordinals[index] ?? `${String(index + 1)}th`} argument must be a source such as osc(), or an output such as o1`
            : hasTexture(arg)
              ? undefined
              : `${input.name} must be an output such as o1`;
      if (refused !== undefined) return `${name}(): ${refused}, not ${describe(arg)}`;
      if (isSource(arg)) {
        const inner = refusedArgument(arg);
        if (inner !== undefined) return inner;
      }
    }
  return undefined;
};

const ordinals = ["first", "second", "third"];

/** Finite numbers only: Hydra writes a number into the shader as it is, `Infinity` included. */
const isNumbers = (value: unknown) =>
  Number.isFinite(value) || (Array.isArray(value) && value.every((item) => Number.isFinite(item)));

/** An output, or one of Hydra's external sources `s0`–`s3`. */
const hasTexture = (value: unknown) =>
  typeof value === "object" && value !== null && "getTexture" in value;

/** A value as an error message shows it. */
const describe = (value: unknown) =>
  typeof value === "string"
    ? JSON.stringify(value)
    : typeof value === "function"
      ? "a function"
      : isSource(value)
        ? "a source"
        : String(value);

/**
 * Why the shaders `vert` and `frag` do not compile and link on `gl`, if they do not: the first
 * line of the driver's log, without its place in the generated code, which the performer never
 * sees.
 */
const compileError = (gl: WebGLRenderingContext, vert: string, frag: string) => {
  const program = gl.createProgram();
  const shaders = (
    [
      [gl.VERTEX_SHADER, vert],
      [gl.FRAGMENT_SHADER, frag],
    ] as const
  ).map(([type, text]) => {
    const shader = gl.createShader(type);
    if (shader === null) return shader;
    gl.shaderSource(shader, text);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
    return shader;
  });
  try {
    for (const shader of shaders)
      if (shader === null || !gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        return firstLineOf(shader === null ? "" : gl.getShaderInfoLog(shader));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      return firstLineOf(gl.getProgramInfoLog(program));
    return undefined;
  } finally {
    for (const shader of shaders) gl.deleteShader(shader);
    gl.deleteProgram(program);
  }
};

const firstLineOf = (log: string | null) =>
  (log ?? "")
    .trim()
    .split("\n")[0]
    ?.replace(/^ERROR: \d+:\d+: /, "") || "it does not compile";

/**
 * Where `part` calls a helper that can follow nothing: one naming a Part that is not among
 * `texts` (each Part's text in the code, by identity), or `level` of a Part with no `.analyze`
 * of its name, whose loudness is never measured. Only names written as strings are checked.
 */
const unheardHelpers = (
  part: VisualPart,
  texts: ReadonlyMap<string, string>,
): Array<DryRunWarning> => {
  const warnings: Array<DryRunWarning> = [];
  for (const { helper, named, at } of helperCallsIn(part.body)) {
    const offset = part.bodyStart + at;
    const text = texts.get(named);
    if (text === undefined)
      warnings.push({ message: `${helper}('${named}') names no Part`, offset });
    else if (helper === "level" && !analyzes(text, named))
      warnings.push({
        message: `level('${named}') hears nothing: ${named} has no .analyze('${named}')`,
        offset,
      });
  }
  return warnings;
};

/** Each helper call in `body` whose Part is a string, and where in `body` it is. */
const helperCallsIn = (body: string) => {
  const calls: Array<{ helper: string; named: string; at: number }> = [];
  walk(body, { ecmaVersion: 2022, allowReturnOutsideFunction: true }, (node) => {
    if (node.type !== "CallExpression" || node.callee.type !== "Identifier") return;
    const helper = node.callee.name;
    const [first] = node.arguments;
    if (
      (helperNames as ReadonlyArray<string>).includes(helper) &&
      first?.type === "Literal" &&
      typeof first.value === "string"
    )
      calls.push({ helper, named: first.value, at: node.start });
  });
  return calls;
};

/** Whether a Part's `text` calls `.analyze(id)`, so `level(id)` can hear it. */
const analyzes = (text: string, id: string) => {
  let found = false;
  walk(text, parseOptions, (node) => {
    if (
      node.type === "CallExpression" &&
      node.callee.type === "MemberExpression" &&
      !node.callee.computed &&
      node.callee.property.type === "Identifier" &&
      node.callee.property.name === "analyze" &&
      node.arguments[0]?.type === "Literal" &&
      node.arguments[0].value === id
    )
      found = true;
  });
  return found;
};

/** Visits every node of `code`, if it parses. */
const walk = (code: string, options: Options, visit: (node: AnyNode) => void) => {
  let program: AnyNode;
  try {
    program = parse(code, options);
  } catch {
    return;
  }
  const visitAll = (node: AnyNode) => {
    visit(node);
    for (const child of childrenOf(node)) visitAll(child);
  };
  visitAll(program);
};
