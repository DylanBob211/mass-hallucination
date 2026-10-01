/** hydra-synth's registry of GLSL functions, which its package exports by path. */
declare module "hydra-synth/src/glsl/glsl-functions.js" {
  const registry: () => ReadonlyArray<import("./hydraIndex.ts").HydraFunction>;
  export default registry;
}
