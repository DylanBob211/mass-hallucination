# Hydra inside published Strudel: embedding, addressing, hot-swap, errors, dry-run

This is research for issue `14-hydra-in-published-strudel`. The question is how Hydra visuals fit the shape the earlier tickets closed on:

- published `@strudel/web@1.3.0` (12);
- raw CodeMirror 6 with no StrudelMirror, over a fixed canvas (08);
- Parts parsed from top-level `label:` statements (03);
- whole-Part replacement through `change_parts`, gated by a dry-run (04/05).

**Method.** Package claims come from the **published npm tarballs** (`npm pack`), read as source. Strudel repo claims come from codeberg, at the 1.2.6/1.3.0 publish commit and at `main`. Behaviour claims marked **[tested]** were run on 2026-09-29 against the real packages in headless Chromium 1217 (Playwright 1.59, SwiftShader WebGL, autoplay allowed). The scripts are in [`14-experiments/`](14-experiments/), and the parts of each claim that were only read are marked **[read]**. In the tests the render loop is driven by hand (`autoLoop:false`, `hydra.tick()` followed by `gl.readPixels`), so each frame can be inspected.

## Sources and versions read

| What | Version | Notes |
|---|---|---|
| `@strudel/hydra` | **1.2.6** (2026-01-18) | Ships `hydra.mjs` (51 lines) and `dist/index.mjs`. Deps: `hydra-synth ^1.3.29`, `@strudel/core 1.2.6`, `@strudel/draw 1.2.6`. |
| `hydra-synth` | **1.4.0** (2025-09-14, `latest`); 1.3.29 (2023-09-12) | `^1.3.29` **resolves to 1.4.0** today. Both were tested. |
| `@strudel/web` | 1.3.0 | Its `dist/index.mjs` **inlines all of `@strudel/core`**: `rollupOptions.external` is commented out in `vite.config.js`. |
| `@strudel/core`, `@strudel/draw`, `@strudel/transpiler` | 1.2.6 | |
| Strudel source at publish | codeberg `d198910a86` ("Publish", 2026-01-17) | |
| Strudel `main` | `c57320a2de` (2026-09-29) | `packages/hydra/hydra.mjs` on `main` is **byte-identical** to 1.2.6. The last commit touching `packages/hydra` is the publish commit. |

Short forms: `SH` = `@strudel/hydra@1.2.6/hydra.mjs`. `HS` = `hydra-synth@1.4.0/src/`. `CS` = `https://codeberg.org/uzu/strudel/src/commit/d198910a86/`.

---

## TL;DR — the answers that decide the design

1. **Don't ship `@strudel/hydra` as published. Own the roughly 40 lines instead.** It has three problems in our build:
   - **(a)** `initHydra` does not use its npm `hydra-synth` dependency. By default it runs `await import('https://unpkg.com/hydra-synth')` **at run time**, which unpkg currently redirects to `hydra-synth@1.4.0`. That is unpinned and a third-party fetch at perform time (`SH` L16, L29). **[read + tested: the redirect]**
   - **(b)** Next to `@strudel/web`'s dist it loads a **second `@strudel/core`**. `H(pattern)` imports `getTime` from that copy, which is never given a time source. So every `H()` throws `no time set!` on every frame. Hydra swallows the error and the uniform silently uses its default value. **[tested, E1]**
   - **(c)** Hydra's `makeGlobal:true` (the default, and what `initHydra` uses) **overwrites Strudel globals**: `speed`, `shape`, `time`, `hush`, `noise`, `src`. After init, `speed("1 2")` throws, `time.fast` throws, and `shape(0.5)` silently becomes a Hydra source. **[tested, E1]**

   Importing `hydra-synth@1.4.0` directly works: it bundles as ESM, about 448 kB. So does rebuilding `H` on `@strudel/web`'s own `reify`/`getTime`. **[tested, E3/E4]**
2. **A bare `label:` can't hold Hydra code, but a wrapper expression can.**
   - `viz: osc().out()` is transpiled to `osc().out().p('viz')`. The `.out()` side effect runs, then the evaluation throws `Cannot read properties of undefined (reading 'p')`. The result is a half-applied Source.
   - `viz: { … }` crashes the transpiler.
   - `viz: hydra\`…\``, a host-provided tagged template that returns `silence`, **works**. The transpiler leaves the template body alone, the Part registers as silence, and the host can evaluate the body with Hydra's names scoped to it (`makeGlobal:false`). That fixes the global clash while keeping `() => time` live. **[tested, E2/E4]**
3. **Hot-swap is seamless and unquantised.** `.out()` replaces one output's draw command. The canvas, framebuffers and feedback (`src(o0)`) survive, and the new chain draws on the **next animation frame**. There is no black frame and no cycle alignment. Nothing is torn down on re-evaluate, though:
   - **outputs the new Source no longer writes keep rendering their old chain;**
   - the last `render(oN)` choice persists;
   - `update` callbacks persist.

   "Delete the visual Part" is therefore a no-op on screen unless the host resets the outputs before evaluating. A reset done synchronously before the evaluate showed no intermediate frame. **[tested, E2]**
4. **Most Hydra failures never reach `repl.state.evalError`.** Only JS errors thrown while the code runs surface there: syntax errors, unknown methods, undefined names like `o7`. Three kinds are invisible:
   - A wrong argument type leaves a `console.warn` (1.4.0) or nothing at all (1.3.29), and the old visual stays.
   - A GLSL compile failure logs nothing from JS. The output **freezes on its last frame**, and the only signal is `gl.getError() === INVALID_OPERATION` after a tick.
   - A throwing or non-number parameter function warns on every frame and uses the parameter's default. In the tests this meant a black output. **[tested, E2/E3]**
5. **A dry-run is cheap and catches all of the above without touching the live canvas.** It uses a second, throwaway `hydra-synth` instance (`makeGlobal:false`, `autoLoop:false`, its own small WebGL context). The dry-run instance's `.out()` is overridden to:
   - generate the GLSL strictly;
   - compile it with `gl.compileShader`;
   - probe each parameter function at a few `time` values.

   It caught 10 of 10 seeded fault classes, and the live draw command, the globals and the rendering were unchanged. It averaged about 1.3 ms per Part. It **misses** errors in parameter functions that only happen at times it didn't probe, and it can't judge whether a visual *looks* right. **[tested, E3]**
6. **Audio-reactivity uses Strudel's own analyser, not `a.fft`.**
   - Hydra's `a.fft` / `detectAudio` opens the **microphone** in its own `AudioContext` via Meyda (`HS lib/audio.js` L48–69), so it hears the room, not Strudel's output. **[read]**
   - Strudel's `.analyze(id)` routes a pattern's post-effects signal into an `AnalyserNode` on Strudel's `AudioContext`. `getAnalyzerData('frequency', id)` (exported by `@strudel/web`) reads it with no permission prompt. **[tested: dB level rose from −59 to −36 while a saw played]**
   - `H(pattern)` gives pattern-synchronous values instead. **[tested: the rebuilt `H("0 1 2 3")` stepped with the scheduler]**

---

## 1. Embedding

### What `@strudel/hydra@1.2.6` does [read: `SH`]

```js
// SH L7–39 (identical on codeberg main)
export async function initHydra(options = {}) {
  if (latestOptions && JSON.stringify(latestOptions) !== JSON.stringify(options)) document.getElementById('hydra-canvas')?.remove();
  ...
  if (!document.getElementById('hydra-canvas')) {
    const { src = 'https://unpkg.com/hydra-synth', feedStrudel = false, contextType = 'webgl',
            pixelRatio = 1, pixelated = true, ...hydraConfig } = { detectAudio: false, ...options };
    const { canvas } = getDrawContext('hydra-canvas', { contextType, pixelRatio, pixelated });
    hydraConfig.canvas = canvas;
    await import(/* @vite-ignore */ src);     // expects the UMD build to set window.Hydra
    hydra = new Hydra(hydraConfig);
    if (feedStrudel) { const { canvas } = getDrawContext(); canvas.style.display = 'none'; hydra.synth.s0.init({ src: canvas }); }
  }
  return hydra;
}
export const H = (p) => () => reify(p).queryArc(getTime(), getTime())[0].value;   // SH L51
```

- **Canvas.** `@strudel/draw`'s `getDrawContext` prepends `<canvas id="hydra-canvas">` to `<body>` with `pointer-events:none; position:fixed; top:0; left:0; width:100%; height:100%`. It is sized `innerWidth × pixelRatio` (default **1**, with `image-rendering: pixelated`) and has no z-index ([`draw.mjs` L9–30](https://codeberg.org/uzu/strudel/src/commit/d198910a86/packages/draw/draw.mjs)). **[tested: one canvas, that exact style]** This fits 08's "transparent editor over a fixed canvas", but the host should create and size its own canvas rather than depend on that one.
- **Resize.** The draw helper resizes the canvas *element* on window resize. Hydra's framebuffers are only resized by `setResolution()` (`HS hydra-synth.js` L169–186), so after a resize the outputs are stretched. **[read, not tested]**
- **Options.** Everything except `src/feedStrudel/contextType/pixelRatio/pixelated` goes to `new Hydra()`. Hydra's own defaults are `makeGlobal:true`, `autoLoop:true`, `detectAudio:true` (which `initHydra` overrides to false), `enableStreamCapture:true` (calls `canvas.captureStream(25)`), `numOutputs:4`, `numSources:4` (`HS hydra-synth.js` L21–34).
- **`feedStrudel`** hides Strudel's 2D draw canvas and feeds it into `s0` as a texture.
- **Where Strudel wires it.** strudel.cc calls `clearHydra()` on stop and on reset ([`website/src/repl/useReplContext.jsx` L96–101, L196](https://codeberg.org/uzu/strudel/src/commit/d198910a86/website/src/repl/useReplContext.jsx)). `clearHydra` runs `hydra.hush()`, removes the canvas, and **puts `speed`/`shape` back** to Strudel's controls (`SH` L41–49). That is upstream's own acknowledgement of the global clash.

### Next to `initStrudel()` without StrudelMirror [tested, E1]

`initStrudel({ prebake: () => evalScope(SH) })` followed by evaluating `await initHydra({src})` **works**: there is no evaluation error, the canvas appears, and Hydra renders. Nothing depends on `@strudel/codemirror`. The problems are elsewhere:

- **Two cores.** `@strudel/web`'s dist inlines core; `@strudel/hydra` imports `@strudel/core` and `@strudel/draw` from `node_modules`. npm dedupes them *on disk*, but the running page has two copies. Core logs `@strudel/core was loaded more than once` (tested), and in the tests `S.reify !== CORE2.reify` and `S.Pattern !== CORE2.Pattern`. The second copy never receives `setTime`, so `H(...)` throws `no time set! use setTime to define a time source` on every frame. `repl.state.evalError` stayed `OK`. Upstream is unaffected because it builds from a monorepo with one core.
- **Globals Hydra writes to `window`** (`makeGlobal`, `HS eval-sandbox.js` L16–28). Observed changes:

  | name | before (Strudel) | after `initHydra` |
  |---|---|---|
  | `speed` | control fn | **number** (Hydra's `speed`; re-read from `window` on every tick, `eval-sandbox.js` L30–35) |
  | `shape` | control fn | Hydra source fn |
  | `time` | Strudel signal | **number, rewritten every frame** (`hydra-synth.js` L429) |
  | `hush` | Strudel `hush` | Hydra `hush` (blanks the visuals and leaves the audio playing) |
  | `noise`, `src` | Strudel controls | Hydra sources |
  | new | — | `osc solid gradient voronoi s0–s3 o0–o3 render update afterUpdate bpm width height mouse tick loadScript setResolution screencap …` |

  After this, Strudel code `s("bd").set(speed("1 2"))` fails with `speed is not a function`, and `.gain(time.fast(1))` fails with `time.fast is not a function`. Methods such as `.speed(2)` still work. The failure also runs the other way: if anything puts Strudel's `speed` function back on `window` while Hydra is running, Hydra's `time += dt*speed` becomes `NaN`.
- `Array.prototype` is patched with `fast`, `smooth`, `ease`, `offset`, `fit` by `ArrayUtils.init()` in *every* Hydra constructor, including `makeGlobal:false` (`HS hydra-synth.js` L36). **[read]** This is harmless to Strudel as far as I could see, but it is a global side effect.

### Pinning implications (12's lockfile-exact bundle)

- The npm dependency `hydra-synth ^1.3.29` is **dead weight** for `initHydra`: it loads whatever URL `src` names. Pinning takes one of two routes:
  - pass `src` pointing at a self-hosted copy of a pinned `hydra-synth/dist/hydra-synth.js` (a UMD build that sets `window.Hydra`);
  - skip `initHydra` and `import Hydra from 'hydra-synth'`. The package `exports.import` → `src/hydra-synth.js`, and esbuild bundled it without complaint (448 kB). **[tested]** Its deps are `regl ^1.3.9` (resolved 1.7.0), `meyda ^5.6.3`, `raf-loop`.
- **1.3.29 → 1.4.0 changes behaviour** (`CHANGELOG.md` in the npm tarball, and a diff of both tarballs):
  - `tick()` is wrapped in `try/catch → console.warn('Error during tick()')`;
  - the same time value is used across render passes;
  - "hard crashing when inputting invalid texture" is fixed, so a wrong-type argument now `console.warn`s where 1.3.29 said nothing (tested);
  - `afterUpdate` is new, and there are shader optimisations.

  Pin exactly; 1.4.0 is the one to take.

## 2. Where Hydra code lives in the Source; evaluation frequency; `H`

- **Hydra chains are side effects.** `.out(o)` compiles and installs a draw command and returns `undefined` (`HS glsl-source.js` L21–32). Nothing about Hydra is a Pattern.
- **Label forms, as transpiled by 1.2.6** (`labelToP`, [`CS packages/transpiler/transpiler.mjs` L470](https://codeberg.org/uzu/strudel/src/commit/d198910a86/packages/transpiler/transpiler.mjs); identical on `main` L184). **[tested, E2]**

  | Source | transpiles to | result |
  |---|---|---|
  | `viz: osc().out()` | `osc().out().p('viz')` | `.out()` **runs**, then `TypeError … reading 'p'`: a half-applied evaluation |
  | `viz: { osc().out() }` | — | transpiler throws `… reading 'type'` (it reads `node.body.expression`) |
  | `viz: hydra(() => { osc().out() })` | unchanged + `.p('viz')` | works if the host defines `hydra = fn => (fn(), silence)` |
  | ``viz: hydra`osc().out()` `` | unchanged + `.p('viz')` | works; **the template body is not transpiled** (no mini-notation rewrite), because `hydra` is not a registered language literal |

  The last two register `viz` as `silence` in the pattern registry. That is inaudible, and it keeps "Parts = top-level labels" (03) true for visuals as well.
- **The tagged-template form lets the host scope Hydra's names to the Part.** The E4 host builds Hydra with `makeGlobal:false` and evaluates the template body inside `with (proxy)`, where the proxy reads `hydra.synth[k]` (plus a rebuilt `H`). Results **[tested, E4]**:
  - Strudel's `speed/shape/time/src/noise/hush` are unchanged;
  - `window.osc` is undefined;
  - `osc(4, 0.5, () => time % 1)` animates, because the proxy returns the live `time`;
  - the same Source's `$: s("bd").speed(2).shape(0.3)` and `speed("1 2")` evaluate cleanly.

  The body of a `() => …` wrapper, by contrast, is ordinary Strudel code: its free names resolve to globals, so it only works with `makeGlobal:true` and the clash above. Costs of the template form: the body is sloppy-mode `eval`, which the page already needs for Strudel. Its error positions are relative to the template, not the Source.
- **Evaluation frequency.** Hydra code runs **once per `repl.evaluate`**, never per cycle. **[tested: a counter inside the wrapper stayed at 1 over 2.5 s of playback]** Anything time-varying goes in parameter *functions*, which Hydra calls **every animation frame** with `props = {time, bpm, mouse, resolution}` (`HS format-arguments.js` L67–84).
- **`H(pattern)`** returns a parameter function (`SH` L51). Each frame it runs `reify(p).queryArc(getTime(), getTime())[0].value`: it samples the pattern at the scheduler's current cycle position. No scheduling is involved; it is polling at frame rate.
  - `getTime` is `scheduler.now()` ([`CS packages/core/repl.mjs` L111](https://codeberg.org/uzu/strudel/src/commit/d198910a86/packages/core/repl.mjs)). `Cyclist.now()` is not compensated for the scheduler's `latency = 0.1` s trigger offset ([`cyclist.mjs` L17, L65, L90–96](https://codeberg.org/uzu/strudel/src/commit/d198910a86/packages/core/cyclist.mjs)), so values probably **lead the audio by about 100 ms**. **[read, not measured]**
  - It crashes on a rest: `[0]` is `undefined` (tested: `H("~ 1")` produced a warning every frame and a default value).
  - A rebuilt `H = p => () => S.reify(p).queryArc(S.getTime(), S.getTime())[0]?.value ?? 0` on `@strudel/web`'s core stepped `0→1→2→3` in time with the scheduler (tested, E3). Mini-notation strings are handled by `reify` because `miniAllStrings()` is on.

## 3. Hot-swap [tested, E2 on both 1.4.0 and 1.3.29]

- **Mechanism.** `.out(o)` → `output.render(passes)` builds a new `regl` command and **assigns `output.draw`** (`HS output.js` L93–116). The next `tick()` calls it. The two ping-pong framebuffers per output are untouched, and the canvas and WebGL context are never recreated.
- **Measured.**
  - A feedback chain `src(o0).add(solid(.05,0,0))` accumulated red to 78/255.
  - It was re-evaluated to `src(o0).add(solid(0,.05,0))`.
  - The **first frame after** read `78,13,0`: the feedback buffer was carried over and green added. The framebuffer objects were identical and there was still one canvas.
- **Quantisation: none.** The swap takes effect on the next animation frame after `evaluate` returns, independent of Strudel's cycle. If on-beat visual changes are wanted, the host has to delay the evaluate itself.
- **Cost is synchronous and on the main thread.** Evaluating plus `.out()` took about 3–5 ms. The **first tick** after a swap took 7 ms for a trivial chain and **28 ms for a 9-transform chain**; later ticks took about 1 ms. So the shader is compiled or linked on the first draw. Those figures are SwiftShader in WSL; a GPU will differ. A 28 ms hitch on the UI thread is one or two dropped frames; the audio is unaffected, since it is scheduled ahead on the audio clock.
- **Outputs no longer written keep rendering.** `solid(1,0,0).out(o1); render(o1)` was followed by a re-evaluate of `solid(0,1,0).out(o0)` alone. The screen **still showed red o1**, and `o1.draw` was unchanged. A re-evaluate that leaves out a visual Part (`viz: hydra\`solid(1,1,0).out()\`` → `$: s("bd")`) **left the yellow on screen**. This is the visual twin of 12's "a deleted Part keeps sounding", and it holds even under full-Source re-evaluation, because Strudel's `hush`-then-evaluate never touches Hydra.
- **Host reset.** Before each evaluate, write `solid(0,0,0,0)` to every output and call `render(o0)`, without clearing sources the way Hydra's own `hush()` does (`HS hydra-synth.js` L139–150). Then evaluate synchronously. **Result: the first frame after was the new chain's colour, not black.** Also reset `update`/`afterUpdate`.

  Caveat: if a later statement in the Source throws, Strudel keeps the old *audio* while the visuals are already reset or half-applied. Evaluating only after a passing dry-run (§5) removes most of that window.

## 4. Errors [tested, E2/E3]

The known-good magenta chain was followed by each fault:

| Fault | Example | `repl.state.evalError` | console | on screen |
|---|---|---|---|---|
| JS syntax | `osc(10).out(` | **yes** (`Unexpected token`) | — | previous visual stays |
| Unknown method / name | `osc().notAFn()`, `.out(o7)` | **yes** | — | previous visual stays |
| Wrong argument type | `osc().blend(5).out()` | no | 1.4.0: `shader could not compile Error: Arguments must be a texture or GlslSource`; 1.3.29: **nothing** | previous visual stays (the swallowing is in `.out()`) |
| GLSL compile | a custom `setFunction` with bad GLSL | no | **nothing from JS**; the browser logs `WebGL: INVALID_OPERATION: useProgram: program not valid` | **output freezes on its last frame** (an animating `osc` froze); `gl.getError()` → `1282` after a tick |
| Param fn throws | `solid(() => nope)` | no | `ERROR ReferenceError …` **every frame** | param uses its default (black here) |
| Param fn returns a non-number | `solid(() => 'x')` | no | `function does not return a number` every frame | default |
| `H` on a rest / npm `H` | `H("~ 1")`; npm `@strudel/hydra` `H` | no | `ERROR TypeError …` / `no time set!` every frame | default |

- In 1.4.0 the render loop does not die: `tick()` has a `try/catch` (`HS hydra-synth.js` L425, L475–478), and parameter functions are individually guarded (`format-arguments.js` L71–84). None of the tested faults made `tick()` throw in 1.3.29 either.
- **The invisible classes can be detected by the host.** Wrap `console.warn` during `.out()` and during the first ticks, check `gl.getError()` after a tick, or better, run the dry-run below. `repl.state` alone is not enough, just as 01 found for playback errors.

## 5. Dry-run without touching the live canvas [tested, E3]

The three candidate approaches:

| Approach | Catches | Misses | Cost |
|---|---|---|---|
| **A. Throwaway `hydra-synth` instance** (`makeGlobal:false, autoLoop:false, detectAudio:false, enableStreamCapture:false`, detached 64×64 canvas, own WebGL context) with the dry-run instance's `generator.sourceClass.prototype.out` overridden to: generate the GLSL (throws on bad argument types), `gl.compileShader` it and read `COMPILE_STATUS`/info log, and call each function uniform at `time ∈ {0, .37, 1.5, 3.9}` catching warnings and non-finite values. Code is transpiled with `S.transpiler`, then run as `Function(...Object.keys(dry.synth), code)` | Everything in the §4 table: syntax, unknown method, `o7`, wrong argument type (`glsl-gen: Arguments must be…`), GLSL (`'nope' : undeclared identifier`), a throwing parameter, a parameter throwing only at t>2 (caught at t=3.9), a non-number return, `H` on a rest. It also reports **which outputs a Part writes** (a chain with no `.out()` writes nothing, which a gate may want to flag) | Parameter errors at unprobed times or states (mouse, audio levels); a slow runtime (it doesn't render); visual quality. Custom `setFunction`s and `s0` sources must be mirrored onto the dry instance | ~1.3 ms per Part (SwiftShader); **one** extra WebGL context held for the session (browsers cap live contexts at around 16, so create it once and reuse it). Isolation checked: live `o0.draw` unchanged, 0 new `window` keys, live keeps rendering |
| **B. Pure stub, no WebGL.** `hydra-synth/src/glsl/glsl-functions.js` is an exported path; in Node it returns **52 transforms** with `type` (`src`/`coord`/`color`/`combine`/`combineCoord`) and typed, defaulted `inputs`. A Proxy-based fake chain can check method names, arity and chain typing (e.g. a `src` must start a chain) | Unknown names and methods, arity, argument-type classes, missing `.out()`. Runs in a Worker or Node | GLSL compile failures (only possible via custom `setFunction`, or bugs), anything hydra's own GLSL generation would reject that the stub doesn't model | Free; drifts from real hydra unless it is generated from `glsl-functions.js` |
| **C. Throwaway GL context, compile only** | GLSL compile | needs the generated fragment source, which needs hydra's generator anyway, so in practice it collapses into A | — |

**A is the one that matches 04's dry-run shape**: transpile, then run against a sandbox, then probe. Two points about how it fits:

- It can live **inside the same dry-run** as the Strudel part. The host's `hydra` template tag dispatches to the dry instance when a dry-run flag is set, and to the live one otherwise.
- The whole-Source dry-run from 04 stubs out side-effecting globals. Hydra code under `makeGlobal:false` plus the scoped template has **no** window side effects, so nothing extra needs shadowing.

## 6. Audio-reactivity

| Mechanism | Source | Works with Strudel's WebAudio output? |
|---|---|---|
| `a.fft[i]`, `a.setBins`, `a.show()`, `a0…` (`detectAudio:true`) | `HS lib/audio.js`: `getUserMedia({audio:true})` → **new** `AudioContext` → Meyda `loudness` (L48–69); also appends a 100×80 canvas to the canvas's parent | **Not directly.** It listens to the **microphone**, so it hears Strudel only through speakers and room, and needs a permission prompt. It has no hook for passing a source node. **[read; not tested because headless has no mic]** |
| `H(pattern)` | `SH` L51 (rebuilt on web's core) | Yes, and deterministic: it is the pattern's value, not the sound. Beat-exact apart from the ~100 ms lead above. **[tested, rebuilt version]** |
| Strudel analyser: `.analyze(id)` (+ `.fft(n)` for size 2^(n+5)) on any pattern, read with `getAnalyzerData('frequency'\|'time', id)` | [`CS packages/superdough/superdough.mjs` L366–395, L967–971](https://codeberg.org/uzu/strudel/src/commit/d198910a86/packages/superdough/superdough.mjs); exported by `@strudel/web` | **Yes.** The `AnalyserNode` is on Strudel's own `AudioContext` (tested: `analysers[1].context === getAudioContext()`), fed post-effects, with no permission prompt. A Hydra parameter like `() => (getAnalyzerData('frequency',1)[4] + 100) / 100` works. Tested: peak dB rose from −59 to −36 while `note("c2*4").s("sawtooth").analyze(1)` played. It can be per-Part: a different `analyze` id per label |
| `feedStrudel` | `SH` L32–36 | Feeds Strudel's 2D **draw** canvas (pianoroll/scope) in as `s0`. That is visual, not audio |

The data comes back as `Float32Array` dB values. The host (or a small helper in the Hydra scope) should normalise it; the agent shouldn't be doing that in-line.

---

## What was tested vs read

- **Tested** (scripts in `14-experiments/`, `npm i` then `node e1-embed.mjs` / `e2-swap-errors.mjs [1.3.29]` / `e3-dryrun-audio.mjs` / `e4-scoped-part.mjs`):
  - the lockfile resolution;
  - the two-core problem and `H` failure;
  - the global clobbering;
  - the canvas style;
  - the label transpilation forms;
  - once-per-evaluate execution;
  - hot-swap feedback continuity and timing;
  - stale outputs and `render`;
  - the reset-before-evaluate behaviour;
  - every row of the error table on 1.4.0 and 1.3.29;
  - dry-run approach A and its isolation;
  - the Strudel analyser and the rebuilt `H`;
  - the scoped tagged-template Part;
  - ESM bundling of `hydra-synth`;
  - unpkg's redirect to 1.4.0.
- **Read only:**
  - resize behaviour;
  - `a.fft` / microphone;
  - `feedStrudel`;
  - `ArrayUtils` prototype patching;
  - the ~100 ms `H` lead over audio;
  - `enableStreamCapture`.

## Unverified / open

- **Real GPU numbers.** The shader-compile hitch (28 ms first tick for a 9-transform chain) was measured on SwiftShader. It should be re-measured in a real browser before 10's latency budget relies on it.
- **`H` / analyser vs audible time.** The ~100 ms lead is inferred from `Cyclist.now()` versus `latency`, not measured. The analyser path should be close to audible time, apart from `AudioContext` output latency.
- **Resize.** The draw canvas resizes but Hydra's framebuffers don't. `setResolution` on resize is the likely fix, and it is untested.
- **Many visual Parts on one output.** Two Parts writing `o0` means the last `.out()` wins, and the result depends on the order of Parts in the Source. The composition convention (one Part per output, or `render()` owned by the host) is a design decision, not a fact established here.

## Sources

- npm: `@strudel/hydra@1.2.6`, `hydra-synth@1.4.0` and `@1.3.29`, `@strudel/web@1.3.0`, `@strudel/core@1.2.6`, `@strudel/draw@1.2.6` (tarballs via `npm pack`).
- hydra-synth source (npm `src/`): `hydra-synth.js`, `output.js`, `glsl-source.js`, `generator-factory.js`, `format-arguments.js`, `eval-sandbox.js`, `lib/sandbox.js`, `lib/audio.js`, `glsl/glsl-functions.js`; `CHANGELOG.md`. Upstream repo `github.com/hydra-synth/hydra-synth` (package `repository`).
- Strudel at `d198910a86` (codeberg): [`packages/hydra/hydra.mjs`](https://codeberg.org/uzu/strudel/src/commit/d198910a86/packages/hydra/hydra.mjs), [`packages/draw/draw.mjs`](https://codeberg.org/uzu/strudel/src/commit/d198910a86/packages/draw/draw.mjs), [`packages/transpiler/transpiler.mjs`](https://codeberg.org/uzu/strudel/src/commit/d198910a86/packages/transpiler/transpiler.mjs), [`packages/core/repl.mjs`](https://codeberg.org/uzu/strudel/src/commit/d198910a86/packages/core/repl.mjs), [`packages/core/cyclist.mjs`](https://codeberg.org/uzu/strudel/src/commit/d198910a86/packages/core/cyclist.mjs), [`packages/core/schedulerState.mjs`](https://codeberg.org/uzu/strudel/src/commit/d198910a86/packages/core/schedulerState.mjs), [`packages/superdough/superdough.mjs`](https://codeberg.org/uzu/strudel/src/commit/d198910a86/packages/superdough/superdough.mjs), [`packages/web/web.mjs` + `vite.config.js`](https://codeberg.org/uzu/strudel/src/commit/d198910a86/packages/web/web.mjs), [`website/src/repl/useReplContext.jsx`](https://codeberg.org/uzu/strudel/src/commit/d198910a86/website/src/repl/useReplContext.jsx), [`website/src/pages/learn/hydra.mdx`](https://codeberg.org/uzu/strudel/src/commit/d198910a86/website/src/pages/learn/hydra.mdx).
- Strudel `main` `c57320a2de`: `packages/hydra/hydra.mjs` (identical), `packages/transpiler/transpiler.mjs` (`labelToP` unchanged at L184).
- `https://unpkg.com/hydra-synth` → `302 /hydra-synth@1.4.0/dist/hydra-synth.js` (checked 2026-09-29).
