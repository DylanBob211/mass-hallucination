# 03: Parse the Performance

**What to build:** The Performance model derived from the Source on every change: Parts, the Preamble, Revs, mute/solo and Surface, published in the view model. See [spec §4](../../ai-live-coding-poc/spec.md), ADR 0001, CONTEXT.md.

**Blocked by:** 01 (Scaffold).

**Status:** ready-for-agent

- [x] Spike first (spec §13.4): confirm Strudel 1.2.6's solo label syntax from the transpiler source and record it in the ticket
- [x] A top-level labelled statement is a Part; identity is the label with mute/solo marks stripped
- [x] A Part's text runs from its leading comment run (no blank line between) to the end of its statement; blank-line-separated comments belong to the Preamble
- [x] All other top-level text, anonymous `$:` blocks included, is the Preamble, addressed as `"(preamble)"`
- [x] A Part whose expression is exactly a `hydra` tagged template is Visual; everything else is Audio; unlabelled Hydra is Preamble
- [x] Muted/soloed read from the label using the transpiler's rules
- [x] Rev = first 8 hex chars of SHA-256 over the Part's exact text
- [x] The view model lists Parts with muted/soloed/surface, re-derived on every edit
- [x] Node tests cover each rule above, including edge cases (comments, `$:`, marks, nested labels not being Parts)

## Comments

**Spike: the solo label syntax in Strudel 1.2.6 (2026-09-30).** `@strudel/web@1.3.0` bundles `@strudel/transpiler@1.2.6` and `@strudel/core@1.2.6`. The transpiler only rewrites `x: y` to `y.p('x')` (`labelToP` in `transpiler.mjs`). The rules live in `@strudel/core/repl.mjs`:

- **Mute:** `Pattern.prototype.p` returns `silence` for an id that starts *or* ends with `_`. A muted pattern is never registered, so it can't be soloed as well.
- **Anonymous:** an id containing `$` anywhere gets a running number appended (`$0`, `$1`, …). This covers `$:`, `S$:`, `_$:` and also `hats$:`.
- **Solo:** `repl.evaluate` treats a registered key as soloed when `key.length > 1 && key.startsWith('S')`. The first soloed key clears every pattern collected so far, so only soloed ones play.
- **Watch out:** any label longer than one character that starts with a capital `S` is soloed, so `Snare:`, `Strings:` and `Sub:` all are. The parser follows Strudel and reads `Snare:` as the Part `nare`, soloed. The system prompt (ticket 09) should tell the agent that labels must not start with a capital `S` unless they mean solo.

**Implemented (2026-09-30).** `parsePerformance(source)` in `src/core/Performance.ts` is pure: no Effect, and nothing stored. It returns `parts` (id, text, rev, muted, soloed, surface) and `preamble` (text, rev). `ViewModelStore` now also reads the `Editor`: it re-derives `parts` (id/muted/soloed/surface) on every Source change. It reuses unchanged Part views and the list, and publishes nothing for an edit that changes no view. Decisions taken with the user, beyond the spec:

- **A Source that doesn't parse** (the normal state mid-keystroke) is parsed again with `acorn-loose`. A half-typed `hats: s("hh*8").gain(` stays the `hats` Part, and its neighbours stay whole. An unclosed template or string still swallows the text after it, because that text really is inside it. `acorn` is pinned to 8.18.0, the same as Strudel's transpiler, with the same options.
- **Whitespace between units belongs to nothing.** A Part's text runs from its first leading comment to the end of its statement, plus any comments on that statement's last line. The Preamble is its non-blank segments, trimmed and joined with `\n`. Adding a blank line changes no Rev.
- **Duplicate identities** (`kick:` twice, or `kick:` and `_kick:`): the first is the Part, and later ones go to the Preamble, so each identity addresses exactly one Part.
- **A label made only of marks** (`_:`) is no Part.
- SHA-256 is `@noble/hashes` (synchronous, so the parse stays pure).

Edges that the review found and left alone: a Part whose body isn't an expression (`kick: { … }`) is an Audio Part, but Strudel's `labelToP` can't run it, so it belongs to the dry-run (ticket 06). `S:` beside `SS:` share the identity `S`, so `SS:` goes to the Preamble even though Strudel solos it. Taking the `S` off a muted label (`_Skick` → `kick`) keeps a Part's identity stable when it is muted; Strudel doesn't define that case.

Notes for ticket 04: `Part` has no character range yet. Composition will need the unit ranges, so add `from`/`to` there, where they have a consumer. The UI doesn't render `parts` yet.
