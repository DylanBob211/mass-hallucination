# Hydra knowledge grounding: does the model already know Hydra?

Research for issue `15-hydra-knowledge-grounding`. It repeats [06](06-strudel-knowledge-grounding.md)'s method for Hydra. Primary sources only: the npm tarballs of `@strudel/hydra@1.2.6` and `hydra-synth` (1.3.29 and 1.4.0), Strudel source at the `@strudel/hydra@1.2.6` tag, and `hydra-synth/hydra-functions`, the repo that serves the official reference at `hydra.ojack.xyz/api`. Every claim is marked **[tested]** (executed against the real packages) or **[read]** (read in source only).

## Decisive answers

1. **The model's Hydra is excellent. It is better than its Strudel.** Ten chains were written from model knowledge before any source was opened ([`15-experiments/baseline-chains.js`](15-experiments/baseline-chains.js), committed first as `d6e918c`). In headless Chromium they called **47 distinct names and all 47 exist**. **10/10 compiled and rendered non-black pixels** on hydra-synth 1.4.0 with `detectAudio: true`, and 10/10 on 1.3.29 **[tested]**. The ~40-name vocabulary list recalled **48 of the 52** registry functions unprompted. Its only 4 misses (`blur`, `mirror`, `sharpen`, `glow`) were the 4 names it had already marked as *suspect* before checking. The model knows where its Hydra knowledge ends, which 06 found was not true of its Strudel.
2. **The real gaps are in Strudel's embedding, not in Hydra.** Of the 10 chains, **only H6 fails, and only under Strudel's default `initHydra()`**: `detectAudio` defaults to `false`, so `a` is undefined **[tested]**. The rest of what the model does not know is also Strudel-specific. Strudel's transpiler turns double-quoted strings into mini-notation Patterns, which silently break Hydra args. `initHydra` replaces five Strudel globals (`time`, `speed`, `noise`, `shape`, `src`). `a.fft` listens to the **microphone**, not to Strudel. All three are **[tested]** (§3).
3. **The metadata exists, is small, is exact on signatures and thin on descriptions.** hydra-synth's `src/glsl/glsl-functions.js` is the authoritative registry: **52 functions**, with typed inputs and defaults, AGPL-3.0. The official reference (`hydra-functions`) vendors an identical copy (**0 signature drift** from the running 1.4.0 **[tested]**). It adds a hand-written `examples.js`: **26/52 functions have a description**, 49/52 have an example, and the 11 `modulate*` descriptions are mostly boilerplate. The repo has **no licence file**. **A full signature index is ~580 tokens.** Adding descriptions makes it ~930, and adding one example each makes it ~1,700 (chars÷4).
4. **Recommendation: put it in the prompt, and it is nearly free.** Use a **generated signature index of all 52 registry functions plus the runtime API (~580 tokens)** and a **hand-written "Hydra inside Strudel" note (~390 tokens)**. That is **≈ 970 tokens added to the cached system prompt**, next to 06's ~11,200 for Strudel. No lookup tool and no retrieval. The index's job is not to teach Hydra. It is a **closed-world list**: it stops `blur`/`mirror` and pins argument order. The note carries the facts the model cannot know. Its descriptions are skipped because they add ~350 tokens and almost no information.
5. **Pinning is broken by default, and this is a build fact for 12.** `@strudel/hydra@1.2.6` **never uses its npm `hydra-synth` dependency.** It does `await import(src)` with default `src = 'https://unpkg.com/hydra-synth'`, which is **unversioned** and today redirects to `hydra-synth@1.4.0/dist/hydra-synth.js` **[read + tested]**. The lockfile does not pin Hydra. The POC must pass `initHydra({ src: <pinned URL or bundled asset> })`. This matters because **error behaviour changed between 1.3.29 and 1.4.0** (§2d).

---

## Sources and versions read

| What | Version | How verified |
|---|---|---|
| `@strudel/hydra` | **1.2.6** (2026-01-18) | `npm pack @strudel/hydra@1.2.6`; `hydra.mjs` + `dist/index.mjs` (1,131 bytes) read in full |
| `hydra-synth` | **1.4.0** (2025-09-14, npm `latest`, the version unpkg serves unversioned) and **1.3.29** (2023-09-12, the floor of `^1.3.29`) | `npm pack`; `src/` diffed; both run in Chromium from `unpkg.com/hydra-synth@<v>/dist/hydra-synth.js` |
| Strudel source at the published tag | tag `@strudel/hydra@1.2.6` → commit `d198910a86fcaecd658ef528bfa6d7884e93490b` | `codeberg.org/uzu/strudel/raw/commit/d198910…/<path>` |
| Official Hydra reference (`hydra.ojack.xyz/api`) | `hydra-synth/hydra-functions` @ `6d88843be4c0f5870dbe4afde6b0339df89b1e85` | `examples.js`, `libs/hydra/glsl-functions.js`, `libs/hydra/hydra-plugins.js`, `libs/hydra-reference.js`; `curl hydra.ojack.xyz/api/` → `<title>Hydra Functions</title>` |
| Strudel core/mini/transpiler/draw | 1.2.6 (same core as `@strudel/web@1.3.0`) | Loaded in Chromium via `esm.sh/@strudel/<pkg>@1.2.6`. esm.sh resolves every package to one shared `@strudel/core@1.2.6` instance |

Test rig **[tested]**: Playwright 1.59, Chromium 1217 headless with `--use-angle=swiftshader` (real WebGL, software rasteriser) and a fake media device. For each program the harness hushes, evals it as a global script, lets ~20 frames render, then reads pixels in the same task as a manual `tick`. It records the synchronous eval error, `pageerror`s and console output during the frames. **Harness control:** it ran all **128 examples from the official reference (`examples.js`)**. **126 ran clean.** The 2 failures (`initCam`, `initScreen`) are environmental: there is no `mediaDevices` on a non-secure origin. Negative controls (§2) show it catches both eval-time and shader-time failures. Scripts are in [`15-experiments/`](15-experiments/).

---

## 0. The metadata

### The registry that actually runs **[read + tested]**

`hydra-synth/src/glsl/glsl-functions.js` exports `() => [ {name, type, inputs: [{name, type, default}], glsl} ]`. For each entry, `generator-factory.js` generates both the GLSL function and the JS method, and `src`-type entries become globals. This is the **single source of truth**: no function can exist in Hydra's chain API without being in this file. The one exception is `setFunction()` at runtime.

**52 functions** in 5 types (dumped by [`registry.mjs`](15-experiments/registry.mjs)):

| type | n | names |
|---|---|---|
| src | 8 | noise voronoi osc shape gradient src solid prev |
| coord (geometry) | 10 | rotate scale pixelate repeat repeatX repeatY kaleid scroll scrollX scrollY |
| color | 16 | posterize shift invert contrast brightness luma thresh color saturate hue colorama sum r g b a |
| combine (blend) | 7 | add sub layer blend mult diff mask |
| combineCoord (modulate) | 11 | modulateRepeat modulateRepeatX modulateRepeatY modulateKaleid modulateScrollX modulateScrollY modulate modulateScale modulatePixelate modulateRotate modulateHue |

**1.3.29 → 1.4.0: the same 52 names and the same inputs and defaults.** The only registry change is the maths of `shift` (`fract(c+r)` → `c += fract(r)`). The engine changes are in `format-arguments.js` (new texture type-check) and `generate-glsl.js` (a rewritten shader generator). Changelog: *"shader optimizations"*, *"`initCanvas` function"*. `src/glsl/renderpass-functions.js` defines **`blur`**, but it is **never registered**, and `glsl-source.js` would `console.warn('no support for renderpass')` anyway. It is a trap for anyone who reads the source tree instead of the registry.

The **runtime API** is not in the registry. It is read from `src/hydra-synth.js` (the `this.synth` object, made global by `EvalSandbox` when `makeGlobal` is true), `hydra-source.js`, `lib/array-utils.js` and `lib/audio.js`:
- globals: `time bpm width height fps stats speed mouse render setResolution update afterUpdate hush tick screencap setFunction s0–s3 o0–o3 loadScript`, and `a` only when `detectAudio`
- source methods: `s0.init initCam initVideo initImage initStream initScreen initCanvas clear`
- `Array.prototype` monkey-patches: `fast smooth ease offset fit`
- audio: `a.fft a.setBins a.setSmooth a.setCutoff a.setScale a.setMax a.hide a.show`

### The official reference **[read + tested]**

`hydra.ojack.xyz/api` is built from `hydra-synth/hydra-functions`. [`docs-coverage.mjs`](15-experiments/docs-coverage.mjs) compared it with the running registry:
- `libs/hydra/glsl-functions.js` is a **vendored copy** of the registry: 52 functions, **0 signature/default drift** against 1.4.0.
- `libs/hydra/hydra-plugins.js` hand-lists the runtime API (out, init*, render, hush, speed, bpm, time, mouse, fast/smooth/ease/offset/fit, fft/setBins/…). It matches the source above.
- `examples.js` holds the prose. **26/52 functions have a `description`.** Missing: `osc shape gradient solid posterize shift repeat* scroll* sub brightness mask luma thresh color saturate hue prev sum r g b a`. 49/52 have ≥1 example (128 in total, all runnable, see the control above). **8 of the 11 `modulate*` descriptions are the same boilerplate sentence** (*"The `texture` parameter can be any kind of source…"*).
- **Licence:** hydra-synth is **AGPL-3.0** (`LICENSE`; `package.json` says `"AGPL"`). `hydra-functions` has **no licence file** (GitHub API `"license": null`). The prose and examples therefore carry no explicit grant. **Generate the index from the AGPL registry, not from `examples.js`**, and write our own notes. (`@strudel/hydra` itself is AGPL-3.0-or-later, the same as the rest of Strudel.)

### Index sizes **[tested; chars÷4, ±15%, as in 06]**

| Index (52 registry fns + 29-line runtime API) | chars | ~tokens |
|---|---|---|
| signatures only ([`index-sigOnly.txt`](15-experiments/index-sigOnly.txt)) | 2,307 | **~580** |
| + first sentence of description where one exists ([`index-sigDesc.txt`](15-experiments/index-sigDesc.txt)) | 3,781 | ~930 |
| + one example each ([`index-sigDescEx.txt`](15-experiments/index-sigDescEx.txt)) | 6,912 | ~1,700 |
| all 128 doc examples (code only) | 8,998 | ~2,250 |

For comparison, 06's recommended Strudel index is ~10,000. **All of Hydra's vocabulary is smaller than Strudel's `learn/strudel-vs-tidal.mdx` alone.**

---

## 1. Baseline: how good is the model's unaided Hydra?

### Method

The chains and the vocabulary list were written as the model, from its own knowledge, and **committed (`d6e918c`) before any Hydra source, doc or registry was opened**. They cover sources, geometry, colour, blend, modulate, feedback via `src(o0)`, multiple outputs and `render`, `a.fft` with `a.setBins/setSmooth`, arrow-function params, and array sequences with `.fast().smooth()`. The prior beliefs about `@strudel/hydra` were recorded the same way ([`baseline-strudel-hydra-beliefs.md`](15-experiments/baseline-strudel-hydra-beliefs.md)).

Two checks:
1. **Static:** every called name and every vocabulary name against registry ∪ runtime API ([`vocab-check.mjs`](15-experiments/vocab-check.mjs)).
2. **Execution:** each chain run in real WebGL on hydra-synth 1.4.0 and 1.3.29, with `detectAudio` false and true ([`run-hydra.mjs`](15-experiments/run-hydra.mjs)).

### Tally **[tested]**

| | result |
|---|---|
| names called in the 10 chains | **47 distinct, 47 exist (100%)** |
| vocabulary list | 65 distinct, **61 exist**. Misses: `sharpen`, `blur`, `mirror`, `glow`, **all four pre-flagged by the model as "plausible-but-suspect"** |
| registry recall | 48/52 named unprompted (not named: `modulateRepeatY`, `modulateScrollY`, `prev`, `sum`) |
| argument order/arity | all correct against the registry: `modulateRepeat(tex, 2, 2, .5, .5)`, `modulatePixelate(tex, 100, 10)`, `scrollY(0.1, 0.05)`, `luma(0.1, 0.2)`, `shape(sides, radius, smoothing)`, … |
| execution, hydra-synth 1.4.0, `detectAudio: true` | **10/10 clean, 10/10 non-black** |
| execution, hydra-synth 1.3.29, `detectAudio: true` | 10/10 clean |
| execution, 1.4.0, **`detectAudio: false` (the `@strudel/hydra` default)** | **9/10**. H6 throws `a is not defined` at `a.setBins(4)` |

**Read plainly:** the model's Hydra is not what needs fixing. Hydra is small (52 functions), stable (the same 52 since at least 2023; no removals between the two versions tested), and heavily represented in public sketches. Unlike Strudel, there is no Tidal-like sibling language whose names leak in. The 4 non-existent names are the obvious shader-effect wishes (blur, mirror, glow, sharpen), and the model already knew they were doubtful.

### Prior beliefs about `@strudel/hydra` vs. the source

| Belief (recorded before reading) | Truth | |
|---|---|---|
| `await initHydra()` at the top | ✓ `hydra.mjs`; docs `learn/hydra.mdx` | [read + tested] |
| `H(pattern)` turns a pattern into a Hydra param function | ✓ `H = (p) => () => reify(p).queryArc(getTime(), getTime())[0].value` | [read + tested] |
| `detectAudio`, `feedStrudel` → `s0` | ✓ names right. The model was *unsure* whether audio is on by default: it is **off** | [read + tested] |
| — (not known) | Hydra is loaded from **unversioned unpkg**, not from the npm dep | [read + tested] |
| — (not known) | double-quoted strings become Patterns in Hydra args | [tested] |
| — (not known) | Hydra replaces Strudel's `time`, `speed`, `noise`, `shape`, `src` | [tested] |
| — (not known) | `a` is a **microphone** analyser in its own `AudioContext` | [read] |
| unsure whether Strudel's stop also clears Hydra | Only the **strudel.cc website** calls `clearHydra()` (on stop and reset, `website/src/repl/useReplContext.jsx#L100,L196`). `@strudel/web` does not include `@strudel/hydra` at all, and `@strudel/repl` only `evalScope`s it (`packages/repl/prebake.mjs#L14`) | [read] |

The pattern matches the chain results: **the model knows what Strudel's Hydra docs say** (`learn/hydra.mdx` covers `initHydra`, `H`, `detectAudio`, `feedStrudel`). **It does not know what only the source says.**

---

## 2. Failure modes: named, with evidence

Negative controls ([`negatives.json`](15-experiments/negatives.json)), run on both versions **[tested]**:

| program | 1.4.0 | 1.3.29 |
|---|---|---|
| `osc(10).blur().out()` | **throws at eval**: `osc(...).blur is not a function` | same |
| `osc(10).mirror().out()` | throws at eval | same |
| `osc(10).out(o4)` | throws at eval: `o4 is not defined` | same |
| `osc(10).modulate().out()` (no texture) | **eval OK**; only `console.warn('shader could not compile …getTexture')` | **throws at eval** |
| `osc(10).add(0.5).out()` (number, not texture) | eval OK; `console.warn('shader could not compile Error: Arguments must be a texture or GlslSource')` | eval OK, **no message at all**, black |
| `osc(10).rotate("<0 1 2>").out()` (plain Hydra) | eval OK, no message | same |
| `osc(10).kaleid(4)` (no `.out()`) | eval OK, nothing rendered, no message | same |
| `osc(10, 0.1, a.fft[0]).out()` (no arrow fn) | eval OK; renders, **reads the value once**. Not reactive, and no signal | same |

**(a) Hallucinated names fail loudly.** Every non-existent method is a `TypeError` at eval. That is exactly the class that 06's `{ok:false, error}` field on the apply tool already catches.

**(b) Wrong argument types fail quietly.** Missing or non-texture args to blend/modulate functions surface only as `console.warn` from inside `GlslSource.out` (`glsl-source.js`: `try { … } catch (error) { console.log('shader could not compile', error) }`). They leave a black or stale output. This is **invisible to an eval-result field.** Ticket 14 owns how Hydra errors surface.

**(c) Silent semantic failures, like 06's synonym collisions.** A missing `.out()`, a bare `a.fft[0]` and a string arg all evaluate clean and do the wrong thing. No error loop can catch them. Only a prompt note can prevent them.

**(d) Version drift is in behaviour, not in names.** Between 1.3.29 and 1.4.0 no function was added or removed, but **the same bad chain moved from an eval-time throw to a console warning** (`modulate()` without a texture). Because `@strudel/hydra` loads unversioned unpkg, **this can change under a deployed POC without any lockfile change** (Decisive answer 5).

---

## 3. Strudel-specific Hydra

### What `@strudel/hydra@1.2.6` is **[read]**

It is 3 exports, and all of the code is in `packages/hydra/hydra.mjs`:

- `initHydra(options)`. It removes and recreates `#hydra-canvas` only if the options changed since the last call (`JSON.stringify` compare), so re-evaluating `await initHydra()` with the same options is a no-op. The Strudel-only options, with defaults, are `src='https://unpkg.com/hydra-synth'`, `feedStrudel=false`, `contextType='webgl'`, `pixelRatio=1` and `pixelated=true`. It sets `detectAudio: false` unless the caller overrides it (hydra-synth's own default is `true`). Everything else is passed straight to `new Hydra(...)`, with `canvas` from `@strudel/draw`'s `getDrawContext('hydra-canvas', …)`. `feedStrudel` hides Strudel's draw canvas and does `hydra.synth.s0.init({ src: canvas })`.
- `H(p)`: `() => reify(p).queryArc(getTime(), getTime())[0].value`. It does a zero-width query at the scheduler's current time. **[tested]** `H('<10 60 [1 2]>')` → 10 at t=0 and 0.5, 60 at t=1, 1 at t=2.25, 2 at t=2.75. **[read]** At a rest, `[0]` is `undefined`, so `.value` throws. Hydra evaluates param functions every frame, so this would be a per-frame console error. It also needs the scheduler's `getTime` from the **same** `@strudel/core` instance.
- `clearHydra()`: `hydra.hush()`, `s0.clear()`, removes the canvas, and **restores only `globalThis.speed` and `globalThis.shape`** to Strudel's controls.

### What Strudel does to Hydra code **[tested]**, with [`run-strudel-hydra.mjs`](15-experiments/run-strudel-hydra.mjs) and real `@strudel/*@1.2.6`

**Global collisions.** After `evalScope(core, mini, draw, hydra)` (the same set as `packages/repl/prebake.mjs`) and `await initHydra()`:

| name | Strudel meaning (core) | after `initHydra` | after `clearHydra()` |
|---|---|---|---|
| `time` | `signal.mjs`: `export const time = signal(id)` | **a number**, rewritten every frame by hydra's tick | **still a number** (the Hydra loop keeps running) |
| `speed` | control (`controls.mjs#L2385`) | Hydra clock multiplier (number) | restored |
| `shape` | control (`controls.mjs#L2304`) | Hydra `shape()` source | restored |
| `noise` | control (`controls.mjs#L1664`) | Hydra `noise()` source | **not restored** |
| `src` | control alias of `source` (`controls.mjs#L354`) | Hydra `src()` | **not restored** |

It also adds 27 new globals, including `hush`, `render`, `osc`, `o0–o3` and `s0–s3`. Consequence, **[tested]**: `note("c e g").lpf(time.range(200, 2000))` → **`time.range is not a function`** once Hydra is initialised. The pattern methods `.speed()`, `.shape()` and `.noise()` still work (`s("bd").shape(0.5)` queried fine). Only the free-standing globals are replaced.

**The transpiler rewrites Hydra args.** Strudel's transpiler turns every double-quoted string into a mini-notation Pattern, whichever library it is passed to:

```
osc(10).rotate("<0 1 2>").out()       →  osc(10).rotate(m('<0 1 2>', 15)).out()
shape(H("3 4 5")).out()               →  shape(H(m('3 4 5', 8))).out()     // intended: H takes a pattern
s0.initImage('https://x/y.png')       →  unchanged (single quotes are left alone)
```

Passing that Pattern to Hydra **evaluates clean**. The only trace is a WebGL `INVALID_OPERATION: useProgram: program not valid` warning, and the new chain does not render. For a model fluent in Strudel, `rotate("<0 1 2>")` is the natural mistake, so it is the highest-value line in the note.

**Audio.** With the default options, `osc(10, 0.1, () => a.fft[0])` **evaluates clean** under Strudel, then logs `ERROR ReferenceError: a is not defined` every frame **[tested]**. With `detectAudio: true`, `a` is a Meyda loudness analyser on `getUserMedia({audio: true})` in its **own** `AudioContext` (`lib/audio.js#L48-L67`) **[read]**. It hears the room, not Strudel's WebAudio graph. The pattern-driven route is `H(samePattern)`. 14 owns audio-reactivity; for grounding, the point is that the model reaches for `a.fft` first.

---

## 4. Remedies, cheapest first, with measured cost

| # | Remedy | ~Tokens | Verdict |
|---|---|---|---|
| (a) | Nothing: rely on model knowledge | 0 | Baseline Hydra is 47/47 and 10/10, but it misses **every Strudel-embedding gotcha** (§3), and no error loop catches them |
| (b0) | Hand-written "Hydra inside Strudel" note only ([`strudel-hydra-notes.txt`](15-experiments/strudel-hydra-notes.txt)) | **~390** | Necessary: nothing generated contains these facts |
| (b1) | **Generated signature index (registry + runtime API)** | **~580** | **Recommended**, with (b0) |
| (b2) | … + one-line descriptions from `examples.js` | ~930 | Not worth it: 26/52 coverage, boilerplate for modulate, no licence |
| (b3) | … + one example each | ~1,700 | Affordable, but the model already writes idiomatic chains |
| (c) | Docs-lookup tool | ~0 prompt | Rejected for 06's reasons: it changes the tool list, which per 02 breaks the prompt cache, and it is unreached when the model is confident. Here the only doubtful names (blur/mirror) are answered better by a closed list |
| (d) | Retrieval | infra | Rejected by the map. The whole example corpus is ~2,250 tokens |

**Why (b1) earns its place even though the baseline is perfect on names.** It turns an open world into a closed one. The model already *doubts* `blur`. The list lets it resolve that doubt without a failed Apply. It also pins defaults and arg order for the functions it recalls less well (`modulateRepeatY`, `prev`, `sum`). It is generated from the AGPL registry of the exact Hydra the page loads, so it has 06's staleness contract for free. **Why not (b2):** in Hydra the names *are* the descriptions (`rotate`, `kaleid`, `pixelate`). The prose adds ~350 tokens, only half the functions have any, and there is no licence to reuse it.

**The build step** is one line inside 06's "reference build step" follow-up. Import `src/glsl/glsl-functions.js` from **the same hydra-synth version passed as `initHydra({src})`**, emit `name(tex?, input=default, …)` grouped by type, then append the runtime list. [`docs-coverage.mjs`](15-experiments/docs-coverage.mjs) already does this (~40 lines).

---

## RECOMMENDATION

**Add ≈ 970 tokens to the cached system prompt: a generated 52-function signature index plus runtime API (~580), and a hand-written "Hydra inside Strudel" note (~390). No descriptions, no lookup tool, no retrieval.** Total grounding with 06: ~11,200 + ~970 ≈ **12,200 tokens**, all static and prompt-cacheable.

The reasons:
- **The model's Hydra is already right.** 47/47 names used, 10/10 chains compiled and rendered, 48/52 of the registry recalled unprompted, and its only 4 wrong names were ones it had marked as doubtful. Hydra does not need to be taught. It needs a **closed list**.
- **The gap is in Strudel's embedding, and it is invisible to errors.** Double-quoted args become Patterns, `time` stops being Strudel's signal, `detectAudio` is off by default, and `a` is the mic. These evaluate clean or fail only in the console. The prompt has to prevent them.
- **The prose reference is thin and unlicensed**, and the AGPL registry is exact. Generate from the registry.

**Unconditional, for 12/14: pin Hydra explicitly.** Pass `initHydra({ src: '<exact hydra-synth URL or bundled asset>' })`. The npm dependency pins nothing, and unpkg's `latest` has already changed error behaviour once (1.3.29 → 1.4.0).

## Follow-ups

- **To 12 (build target):** `@strudel/hydra@1.2.6` loads `https://unpkg.com/hydra-synth` unversioned at runtime, and `^1.3.29` in its package.json is dead weight. Lockfile-exact pinning (ADR 0002) does not cover Hydra unless the host passes `src`. Also, **`@strudel/web@1.3.0` does not bundle `@strudel/hydra`**. The host must `evalScope(import('@strudel/hydra'))` against the **same** `@strudel/core` instance, or `H()`'s `getTime()` is not the scheduler's.
- **To 14 (errors, dry-run):** Hydra has three error channels, verified here: an eval-time throw (bad names), `console.warn('shader could not compile …')` from `GlslSource.out` (bad args), and per-frame `console.warn('ERROR …')` from param functions (`a` undefined, and by source reading `H` at a rest). Only the first reaches a `{ok, error}` tool result. Which chain errors are eval-time depends on the hydra-synth version.
- **To 05/the agent's Preamble:** if the agent owns `initHydra(...)`, it should never write double-quoted strings into Hydra calls. A lint over the composed document (a double-quoted literal inside a Hydra call) would catch the one silent failure the note cannot guarantee away, like 06's synonym lint.
- **To the host:** `clearHydra()` is website-only and does not restore `time`, `noise` or `src`. A host that stops Hydra must restore Strudel's globals itself, or re-run `evalScope`.
- **To the "reference build step" ticket candidate from 06:** add the Hydra registry emit, keyed on the same pinned `src`.
