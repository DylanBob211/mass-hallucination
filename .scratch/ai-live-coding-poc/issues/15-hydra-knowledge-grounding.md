# 15 — Hydra knowledge grounding

Type: research
Status: resolved
Blocked by: —

## Question

[06](06-strudel-knowledge-grounding.md) found the model's Strudel already good and grounding a
**prompt problem**: a generated, runtime-filtered signature+description index (~10K tokens), static
and prompt-cacheable ([research](../research/06-strudel-knowledge-grounding.md)). Now the agent also
writes **Hydra** (`hydra-synth`, the version `@strudel/hydra@1.2.6` pins). Repeat 06's method for
Hydra:

1. **How good is the model's Hydra already?** Have a current Claude model write a set of Hydra
   chains (sources, geometry, colour, blend, modulate, feedback via `src(o0)`, multiple outputs,
   `a.fft` audio-reactivity, arrow-function params). Check every function it uses exists in the
   pinned `hydra-synth`, and whether the chains compile (a real run if feasible, else a static check
   against the function registry). Note hallucinated or version-drifted functions.
2. **What source metadata exists?** hydra-synth's function registry (`glsl-functions` or
   equivalent), the official docs/reference, their accuracy and licence. How big is a signature +
   one-line description index of every function, in tokens?
3. **Strudel-specific Hydra.** What does `@strudel/hydra` add or change (`H()`, `initHydra`
   options, globals), and what does the model not know about it?
4. **Recommendation** in 06's terms: prompt index, cheatsheet, lookup tool or retrieval, with the
   size added to the cached prompt.

Capture findings as `.scratch/ai-live-coding-poc/research/15-hydra-knowledge-grounding.md`, with
primary sources cited.

## Answer

**The model's Hydra is already good, so grounding is ~970 tokens of prompt, with no tool and no retrieval.** [Full research](../research/15-hydra-knowledge-grounding.md), on branch `research/15-hydra-knowledge-grounding`. The baseline was committed before any source was read (`d6e918c`).

- **Baseline:**
  - 10 chains written from memory used 47 distinct names, and all 47 exist.
  - 10/10 chains compile and render in real WebGL on hydra-synth 1.4.0 and 1.3.29.
  - The recalled vocabulary covered 48 of the 52 registry functions. The only wrong names were `blur`, `mirror`, `sharpen` and `glow`, all flagged as suspect in advance. `blur` exists in the source but is never registered.
- **The gaps are Strudel's embedding, not Hydra, and most of them fail silently (tested):**
  - `a` is undefined, because audio detection is off.
  - The transpiler turns double-quoted Hydra args into Patterns: `rotate("<0 1 2>")` evaluates clean and renders nothing.
  - The globals clash: `time.range` throws after `initHydra`.
  - `a.fft` is the microphone.
- **Metadata:** hydra-synth's `glsl-functions.js` (AGPL-3.0, like Strudel) lists all 52 functions with typed arguments and defaults. The official reference copies it exactly, but its prose covers only 26 functions.
- **Recommendation:** generate a **signature index** from `glsl-functions.js` (~580 tokens), plus a hand-written **"Hydra inside Strudel" note** (~390). With 06, the cached prompt totals about 12,200 tokens.
- **Reconciled with 14:** the research suggests pinning via `initHydra({src})`. That conflicts with 14, which found `@strudel/hydra` also loads a second core. **14's route wins**: import `hydra-synth@1.4.0` directly, with our own glue. That route also dissolves most of the gaps. A ``hydra`…` `` Part body isn't transpiled, so no quoted-args trap. `makeGlobal:false` means no clash. Audio-reactivity goes through `.analyze`/`H()`, so `a` is never taught. So the note's content depends on 16's Part shape, and is likely under 390 tokens. Note too that between 1.3.29 and 1.4.0 one bad chain moved from throwing at eval to a console warning only. The version pin matters.
