/**
 * The part of `hydra-synth@1.4.0` the host uses. The package ships no types; these are read from
 * its source (`src/hydra-synth.js`, `src/output.js`, research 14).
 */
declare module "hydra-synth" {
  export default class Hydra {
    constructor(options: {
      readonly canvas: HTMLCanvasElement;
      readonly width: number;
      readonly height: number;
      /** When true (the default), Hydra's names overwrite Strudel's on `window`. */
      readonly makeGlobal: boolean;
      readonly autoLoop: boolean;
      /** Opens the microphone when true. */
      readonly detectAudio: boolean;
      readonly enableStreamCapture: boolean;
    });
    /**
     * Every name Hydra code sees: its sources and transforms (`osc`, `solid`, …), the outputs
     * `o0`–`o3`, `render`, `update`, `afterUpdate`, `time` and the rest.
     */
    readonly synth: Record<string, unknown> & {
      solid(r: number, g: number, b: number, a: number): { out(output: Output): void };
      render(output?: Output): void;
      update: (dt: number) => void;
      afterUpdate: (dt: number) => void;
    };
    /** The outputs `o0`–`o3`. */
    readonly o: ReadonlyArray<Output>;
    readonly regl: { destroy(): void };
    /** Draws one frame, `dt` milliseconds after the last. */
    tick(dt: number): void;
    /** Resizes the canvas and every output's framebuffers. */
    setResolution(width: number, height: number): void;
  }
  export interface Output {
    readonly label: string;
  }
}
