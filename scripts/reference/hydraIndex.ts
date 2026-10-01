/** One entry of hydra-synth's `src/glsl/glsl-functions.js`: the parts the index reads. */
export interface HydraFunction {
  readonly name: string;
  /** `src`, `coord`, `color`, `combine` or `combineCoord`. */
  readonly type: string;
  readonly inputs: ReadonlyArray<HydraInput>;
}

export interface HydraInput {
  readonly name: string;
  /** `float`, `vec4`, or `sampler2D` for a texture. */
  readonly type: string;
  readonly default: unknown;
}

/**
 * Each registry type's heading, in the order the index lists them, and whether its functions take
 * the texture they combine with first. Hydra generates that argument, so the registry omits it.
 */
const types: Readonly<Record<string, { readonly heading: string; readonly texture: boolean }>> = {
  src: { heading: "sources", texture: false },
  coord: { heading: "geometry", texture: false },
  color: { heading: "colour", texture: false },
  combine: { heading: "blend (texture first)", texture: true },
  combineCoord: { heading: "modulate (texture first)", texture: true },
};

/**
 * The prompt's Hydra index (spec §9.4): every function of hydra-synth's registry as
 * `name(tex?, input=default, …)`, grouped under its type.
 */
export function hydraIndex(registry: ReadonlyArray<HydraFunction>): ReadonlyArray<string> {
  const unknown = registry.find((f) => !Object.hasOwn(types, f.type));
  if (unknown)
    throw new Error(
      `hydra-synth's ${unknown.name} has a type the index does not know: ${unknown.type}`,
    );
  return Object.entries(types).flatMap(([type, { heading, texture }]) => {
    const functions = registry.filter((f) => f.type === type);
    if (!functions.length) return [];
    return [
      `## ${heading}`,
      ...functions.map(({ name, inputs }) => {
        const params = inputs.map((input) =>
          input.type === "sampler2D" ? input.name : `${input.name}=${String(input.default)}`,
        );
        if (texture) params.unshift("tex");
        return `${name}(${params.join(", ")})`;
      }),
    ];
  });
}

/**
 * What a Visual Part can use of Hydra besides the registry, read from hydra-synth's
 * `src/hydra-synth.js`, `src/hydra-source.js` and `src/lib/array-utils.js`. Hand-kept: review it
 * when the hydra-synth pin moves. Left out, though in scope: what belongs to the host (`render`,
 * `hush`, `tick`, `setResolution`, `screencap`, `setFunction`, `fps`), sources that ask for a
 * device (`initCam`, `initScreen`, `initStream`), and `mouse`, which the canvas never receives.
 */
export const hydraRuntime: ReadonlyArray<string> = [
  "## runtime (not in the registry)",
  ".out(output=o0) — ends a chain: draws it into an output",
  "o0 o1 o2 o3 — the outputs; src(o1) reads one, and src(o0) inside a chain into o0 is feedback",
  "s0 s1 s2 s3 — sources: s0.initImage(url), s0.initVideo(url), s0.clear(); src(s0) reads one",
  "time — Hydra's seconds, times speed; not the music's time",
  "speed=1 — how fast time runs",
  "bpm=30 — how fast an array parameter steps through its values",
  "width height — the canvas size in pixels",
  "update=(dt)=>{} afterUpdate=(dt)=>{} — assign a function to run before / after each frame",
  "[1, 2, 3] as a parameter steps through its values; arrays have .fast(speed=1) .smooth(smooth=1) .ease(ease='linear') .offset(offset=0.5) .fit(low=0, high=1)",
];
