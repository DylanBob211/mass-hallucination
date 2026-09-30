# 13: Hydra canvas and the `hydra` tag

**What to build:** A human can write a Visual Part (``viz: hydra`…` ``) and see it on a full-screen canvas behind the transparent editor, applied by the same Apply as audio. See [spec §8](../../ai-live-coding-poc/spec.md), ADR 0002 amendment, map ticket 16.

**Blocked by:** 05 (Error slot).

**Status:** ready-for-agent

- [x] Fixed, full-screen, `pointer-events:none` canvas behind a transparent editor; one live `hydra-synth` with `makeGlobal:false`
- [x] A `hydra` tag registered in Strudel's eval scope returns `silence` and runs its body (not transpiled) with only Hydra's names in scope
- [x] Before every evaluate, all four outputs reset to `solid(0,0,0,0).out(oN)`, `render(o0)`, `update`/`afterUpdate` cleared (fills the hook from ticket 04)
- [x] Muted Visual Parts' bodies are skipped; solo works within the Visual Surface
- [x] Eval errors inside a `hydra` body map back to Source offsets and reach the error slot with their Part
- [x] Browser-mode test that a Visual Part evaluates and an error maps to its Part; manually verified with a hand-written Performance

## Comments

**Implemented (2026-09-30).**

- **`src/facade/live/visuals.ts`** is the host's Hydra glue. `createVisuals` does four things:
  - It builds a fixed, full-screen canvas: `pointer-events:none`, `z-index:-1`, prepended to `<body>`, so it sits behind the page's content and above its background. The editor theme was already transparent.
  - It creates one `hydra-synth` with `makeGlobal:false`, `detectAudio:false` and `enableStreamCapture:false`.
  - It runs the frames from its own `requestAnimationFrame` loop (`autoLoop:false`), because Hydra's own loop can't be stopped. Ticket 15's `gl.getError()` check after ticks can go in that loop.
  - It calls `setResolution` on resize.

  `StrudelLive` builds it at boot, next to the repl, and registers the tag with `evalScope({ hydra })`. The layer's finalizer disposes of it.
- **The tag.** Strudel's transpiler turns ``viz: hydra`…` `` into ``hydra`…`.p('viz')``. So the tag returns an object whose `.p(label)` runs the body, once it knows which Part it is.
  - The body runs in sloppy mode as `with (scope) { body }`. The scope proxy gives the body Hydra's `synth` names, plus a short list of JavaScript's own globals (`Math`, `Number`, …). Every other name on `globalThis`, Strudel's included, is `not defined`.
  - A name the body assigns without declaring it is kept in the scope, not on `globalThis`, so nothing leaks.
  - It returns `silence` and registers nothing with the repl. This is why soloing a Visual Part leaves the Audio Parts playing: the repl's solo sees only Audio Parts.
- **`prepare(code)`** replaces ticket 04's no-op `resetVisuals`. It runs synchronously just before `repl.evaluate`:
  - It resets all four outputs to `solid(0,0,0,0)`, sets `render(o0)` and clears `update`/`afterUpdate`.
  - It parses the code with acorn and lists its Visual Parts in order. Each entry holds the label as written (marks included), where the body starts, and whether the body is skipped: muted, or soloed out within the Visual Surface.
  - It applies the parser's rule that a later Part with a taken identity is Preamble, so that Part's body never runs.
  - Mute and solo reuse `readLabel`, and the Part shape reuses `hydraTemplateOf`. Both are now exported from `Performance.ts`, so the host and the parser can't disagree.
- **Errors.** A failure in a body is thrown as a `VisualError` carrying an offset in the evaluated code. `evalErrorOf` turns it into an `EvalError` with that offset, and ticket 05's `unitAt` then names the Part.
  - A syntax error is placed exactly: acorn parses the body first.
  - A runtime error (an unknown method, `o7`, a Strudel name) is placed at the start of its body, not at the failing call. That is enough to find the Part, and a stack trace's line and column in a `Function` body vary by browser. If the error slot ever shows positions, this is the partial part of "map back to Source offsets".
- **The audio dry-run shadows `hydra`**, so a dry-run never draws on the live canvas. Visual Parts get their own dry-run in ticket 16.
- **`vite.config.ts`:**
  - `define` gains `global: "globalThis"`. hydra-synth's dependency `right-now` reads Node's `global`, and without it the page fails to load Strudel at all.
  - `hydra-synth` is pre-bundled next to `@strudel/web`, for the same reason Strudel is.
- **Tests** (`visuals.browser.test.ts`, against the real bundle; each read from a screenshot of the page):
  - a Visual Part draws;
  - an evaluate without it clears the canvas;
  - a muted Visual Part is not drawn;
  - a soloed Visual Part hides the other Visual Parts and leaves an Audio Part's events playing;
  - Hydra's names are in scope and Strudel's are not, and none leak to `window`, not even a name the body assigns;
  - a later Part with a taken identity is not drawn;
  - a body's syntax error is placed exactly;
  - a syntax error, an unknown method or an unknown output reaches the error slot with `part: "viz"`, through `LiveCodeStore` over a fake editor.

  I broke each behaviour in turn to confirm that its test fails.
- **Checked by hand** in the dev app with a hand-written Performance: a Hydra rainbow (`osc(8, 0.1, 1.2).kaleid(4).rotate(() => time / 4)`) plays behind the transparent editor with an audio Part. `_viz:` clears it on Ctrl-Enter. `.nope()` in its body shows `✕ eval in viz: osc(...).kaleid(...).nope is not a function`.

Decisions beyond the spec:

- **A `hydra` template draws only as a Visual Part** (a Part whose whole expression is the template). Anywhere else, unlabelled Preamble Hydra included, its body never runs. That follows from running it in `.p`, and ticket 16's dry-run refuses those shapes anyway.
- **A `${…}` in a `hydra` template is an eval error.** An interpolation would bring Strudel's scope into the body and shift error offsets.
- **Which JavaScript globals the body sees** is a fixed list (`Math`, `Number`, `Array`, `JSON`, `console`, …). DOM globals such as `document` or `fetch` are hidden, along with Strudel's names.
- **The canvas is built on the first gesture**, with the repl, not on page load. Nothing can draw before the first Apply anyway.

Known limits:

- **A failed Apply leaves the canvas reset.** The reset runs before the evaluate (spec §5 step 2), so when the evaluate fails the audio keeps its Live code but the visuals are cleared, or half-drawn up to the failing Part. Research 14 noted this. The dry-run removes it for agent changes (ticket 16). A human Apply that fails still shows it.
- **A body cannot use `typeof` on an undeclared name, or read a hoisted `var` before it is assigned.** Either throws `not defined`, because the scope claims every name that is not one of JavaScript's own.
- **ADR 0002 budgets about 40 lines of glue.** `visuals.ts` is about 200, most of it the scope and error placement. The ADR's figure is an estimate, not a rule, so I have not amended it.
- **Resolution is the window's CSS pixels.** It is not multiplied by `devicePixelRatio`, which keeps the fill rate down.
