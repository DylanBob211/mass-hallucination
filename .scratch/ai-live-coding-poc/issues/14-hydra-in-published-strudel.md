# 14 — Hydra inside published Strudel: embedding, addressing, hot-swap, errors, dry-run

Type: research
Status: resolved
Blocked by: —

## Question

The destination now includes **Hydra visuals co-driven by the agent**. Every closed decision assumed
an audio-only Performance built on `@strudel/web@1.3.0` (12) with raw CodeMirror 6, a transparent
editor over a fixed canvas (08), Parts parsed from top-level labels (03), whole-Part replacement via
`change_parts` with a dry-run (04/05). Establish the facts that decide how Hydra fits that shape.
Answer against **published npm**, `@strudel/hydra@1.2.6` (on `@strudel/core@1.2.6`, the same core as
`@strudel/web@1.3.0`) and its `hydra-synth` dependency. Note where codeberg `main` differs.

1. **Embedding.** How does `@strudel/hydra` initialise (`initHydra`, options, canvas creation,
   `detectAudio`/`feedStrudel`)? Does it work next to `@strudel/web`'s `initStrudel()` repl without
   `@strudel/codemirror`/`StrudelMirror`? What does it add to the page (canvas, global functions
   like `osc`, `src`, `H`)? Pinning implications for 12's lockfile-exact bundle.
2. **Where Hydra code lives in the Source.** Hydra chains end in `.out()` and run as top-level
   statements, not `label:` patterns. Can Hydra code be addressed as a **Part** (under a label, in a
   block, some other convention)? What happens when Hydra code is re-evaluated as part of a Strudel
   evaluation — once per evaluate, or per cycle? What does `H(pattern)` do (patterns driving Hydra
   params) and how is it scheduled?
3. **Hot-swap.** When the Source is re-evaluated, does Hydra swap its output glitch-free (no black
   frame, no canvas re-creation, feedback buffers preserved)? Is there any quantisation, or does it
   swap on arrival? What about outputs `o0..o3` that are no longer written by the new code — do they
   keep rendering the old chain (the visual analogue of 12's "a deleted Part keeps sounding")?
4. **Errors.** How do Hydra errors surface: JS errors at evaluation, GLSL compile errors, runtime
   errors in the render loop? Are any invisible to `repl.state`, as playback errors were (01)? What
   does a bad chain leave on screen?
5. **Dry-run.** 04 showed a dry-run on published 1.2.6 via a stubbed transpiler sandbox plus strict
   `query` over cycles 0–8 (prototype on branch `prototype/04-apply-semantics`,
   `.scratch/ai-live-coding-poc/prototypes/04-dry-run/`). Can Hydra code be validated the same way
   without touching the live canvas: a headless/offscreen `hydra-synth`, a stubbed `osc/src/...` API
   that type-checks the chain, or a shader compile in a throwaway WebGL context? What would each
   catch and miss?
6. **Audio-reactivity.** What does Hydra offer for reacting to the music (`a.fft`, `H(pattern)`,
   Strudel-fed audio)? Which of these work with Strudel's WebAudio output in the page?

Capture findings as `.scratch/ai-live-coding-poc/research/14-hydra-in-published-strudel.md`, with
primary sources (npm tarballs, source at the published tag, hydra-synth docs) cited. Where a claim
is testable cheaply, test it against the real packages and say so.

## Answer

**Hydra fits, but only through our own glue, and inside a tagged template that holds the Part.** [Full research](../research/14-hydra-in-published-strudel.md). The experiments are on branch `research/14-hydra-in-published-strudel` (`14-experiments/`); most claims were tested in headless Chromium on hydra-synth 1.4.0 and 1.3.29.

- **Embedding: own the ~40 lines of `@strudel/hydra`; don't ship them.**
  - Its `initHydra` imports `https://unpkg.com/hydra-synth` at run time, so the version is unpinned.
  - Next to `@strudel/web`'s dist it loads a second `@strudel/core`, so `H()` fails every frame with `no time set!`.
  - Its global mode overwrites Strudel's `speed`, `shape`, `time`, `hush`, `noise` and `src`.
  - What works: import `hydra-synth@1.4.0` directly, pinned exactly (~448 kB), and rebuild `H` on `@strudel/web`'s own core.
- **Parts:**
  - `viz: osc().out()` draws and then throws, leaving the Source half-applied. `viz: { … }` crashes the transpiler.
  - ``viz: hydra`…` `` works: the tag is host-provided and returns `silence`. The Part registers as silence, and the host evaluates the body with Hydra's names local to it (`makeGlobal:false`).
- **Hot-swap:** the new visual appears on the **next frame**, with no black frame and no quantisation. Feedback survives.
  - Outputs the new Source no longer writes **keep rendering their old chain**, so the host must reset outputs before each evaluate. That was tested and shows no intermediate frame.
  - The first frame after a swap can stall about 28 ms (software renderer).
- **Errors:** only JS evaluation errors reach `repl.state.evalError`. Three kinds are invisible:
  - wrong argument types: swallowed, and the old visual stays;
  - a bad shader: the output freezes, detectable only through `gl.getError()`;
  - a throwing parameter function: it warns every frame and falls back to the default.
- **Dry-run:** a throwaway `hydra-synth` in its own small WebGL context does it. It generates the GLSL strictly, compiles it, and probes parameter functions at a few times. It caught 10/10 seeded fault classes in ~1.3 ms per Part without touching the live canvas. It misses faults at times it didn't probe, and it can't judge looks.
- **Audio-reactivity:** Hydra's `a.fft` hears the **microphone**, not Strudel. Use Strudel's `.analyze(id)` with `getAnalyzerData` (tested, no permission prompt), or `H(pattern)`, which is pattern-synchronous and probably leads the audio by ~100 ms (read, not measured).
