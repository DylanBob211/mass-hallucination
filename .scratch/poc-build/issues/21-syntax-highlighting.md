# 21: Syntax highlighting

**What to build:** The Source is coloured: JavaScript everywhere, Mini-notation inside the strings Strudel turns into it, and a Visual Part's body as JavaScript. Labels stand out, a muted Part reads as muted, and the agent's widgets are coloured like the Source. Spec ticket 16 asked for the `hydra` body to be "highlighted as JavaScript". The POC build skipped it: `javascript()` parses the Source in `src/ui/editor.ts`, but no highlight style is installed, so everything is `--color-fg`.

**Blocked by:** 13 (Hydra canvas and the `hydra` tag), 14 (Audio-linked helpers), 18 (Code readable over visuals).

**Status:** ready-for-agent

- [x] JavaScript is coloured across the Source, with a highlight style built on new colour tokens
- [x] Mini-notation is tokenised into four classes (word, number, rest, structure), only in the strings Strudel 1.2.6 transpiles
- [x] A Visual Part's body is parsed as nested JavaScript with the same palette; the four link helpers get an accent
- [x] Labels get their own colour; a muted Part's body is dimmed, label excluded, on the focus band too
- [x] Drafts, the ghost and a Proposal's new text are coloured too
- [x] Readable over the busy-colour and white-frame presets in all three code views

## Decisions

- **Static colouring only.** Live event highlighting (Strudel's REPL flashing each event as it plays) is [ticket 22](22-live-event-highlighting.md).
- **Which strings are Mini-notation: exactly the transpiler's rule** (`@strudel/transpiler@1.2.6`, `transpiler.mjs`), so the colour never lies about what Strudel will rewrite:
  - every double-quoted string literal, wherever it appears;
  - every backtick string that is **not** a tagged template's;
  - except between `// mini-off` and `// mini-on` comments (an unclosed `mini-off` runs to the end).

  Single-quoted strings stay plain strings. So does a `"…"` inside a Visual Part's body: the `hydra` tagged template is never transpiled, so Hydra receives it as a plain string.
- **Four Mini-notation classes:**
  - **word**: sample and note names (`bd`, `c3`, `eb3`);
  - **number**;
  - **rest**: `~` and `-`;
  - **structure**: operators and brackets, `* / ! @ ? : , . | [ ] < > { } ( )`. Euclid forms like `(3,8)` are structure plus numbers.
- **Visual Part body.** Nested JavaScript parse inside ``label: hydra`…` ``, with the same palette as the rest. Only `cycle`, `pulse`, `value` and `level` get their own accent: they are where a Visual Part reads the music. Hydra's own names (`osc`, `src`, `out`, `o0`…) get no special colour.
- **Labels and mute.** A Part's label has its own colour. A muted Part (`_bass`, `bass_`, read from the label as in `CONTEXT.md`) has its body dimmed and its label at full colour, so the `_` that mutes it stays readable. The dimming stays on the focus band. Solo needs nothing: the label's form already shows it.
- **Agent widgets.** `Block` in `agentWork.ts` (draft, ghost) and `NewText` in `proposal.ts` set `textContent` today. They get the same highlighting through a static pass over their text (e.g. `highlightCode` from `@lezer/highlight`, with the same parser and style).
- **Palette.** About six new tokens in `src/app.css` beside the existing ones, as light pastels that read on ticket 18's dark line boxes (60%, and 88% on the focus band). Comments use `--color-dim`. The theme reads them as CSS variables, as `editor.ts` already does.
- **Dependencies.** `@codemirror/language` and `@lezer/highlight` are already installed transitively; declare them in `package.json`, pinned like the others.
- **No ADR.** Easy to reverse, and no trade-off a later reader would wonder about.

## Checks

- Node tests for the Mini-notation tokeniser and for which strings count (double, single, untagged and tagged backtick, `mini-off`/`mini-on`, unclosed `mini-off`).
- A browser editor test over a sample Source asserting distinct highlight classes for a label, a JS keyword, a Mini-notation word, rest and structure token, a link helper inside a Visual Part, and a `"…"` inside a Visual Part (plain string). Also: a muted Part's body is dimmed and its label is not, and the draft, ghost and Proposal widgets contain highlighted spans.
- Break each rule in turn and confirm its test fails, as ticket 18 did.
- Manual check: screenshots over the busy-colour preset and a white frame, in all three code views (Alt-H), as in ticket 18.

## Comments

**Implemented (2026-10-05).**

- **`src/ui/highlight.ts`**: `highlight(source)` is pure. It returns the coloured spans of any Source text, and the editor and the agent's widgets share it.
  - JavaScript comes from `@lezer/javascript` through `highlightTree` and a `tagHighlighter` with fixed `cm-t-*` classes. There is no `syntaxHighlighting`: one decoration field colours the whole document on each change, so token colours never nest with other marks.
  - Mini-notation follows the transpiler: double-quoted strings, untagged backtick strings as far as the first `${…}`, and `mini-off`/`mini-on` as in `findMiniDisableRanges`. A `mini-on` with no open `mini-off` closes nothing, like the transpiler's `undefined` start.
  - A `hydra` template's body is parsed again as JavaScript. Calls of `cycle`, `pulse`, `value` and `level` there also get `cm-link-helper`.
  - Muting comes from `locateUnits`, which now also returns `muted`. A muted Part's body gets `cm-muted` (opacity .45), and its label does not.
- **Widgets:** the draft, ghost and Proposal blocks render `highlightedText(text)`. The struck-out old text and a Stale Proposal stay grey, colours included.
- **Palette:** eight `--color-code-*` tokens in `src/app.css`. Mini-notation words got their own colour (not the string colour) so a Strudel string reads apart from a plain one.
- **Dependencies:** `@lezer/highlight` and `@lezer/common` are declared, pinned.
- **Tests:** in Node, the tokeniser, which strings count, the `hydra` body, the helpers and muting. In the browser, distinct computed colours, muted opacity, and coloured widgets. I broke the helper colour, the muted opacity and each widget's rendering in turn, and each test failed. Three older browser tests read a line's `firstChild` as its text. They now read the line without its widgets.
- **Manual check:** Playwright screenshots of the dev app (headless Chromium, SwiftShader) over a busy-colour Hydra preset and `solid(1,1,1)`, in the all and focus views. Everything reads. The faintest text is a muted Part over white, which is the dimming working, but it is close to the edge.

Known limits:

- The whole document is re-highlighted (and re-located) on every change. That is fine at performance sizes, and it is the first thing to make incremental if typing lags.
- `src/facade/live/visuals.browser.test.ts` "helpers follow a heard Part" failed once in the full run and passed on reruns, with and without this change. It is timing-dependent.

