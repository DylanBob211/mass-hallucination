# 17: Prompt reference, Hydra part

**What to build:** `pnpm build:reference` also produces the Hydra index and the "Hydra inside Strudel" note, so the agent can write Visual Parts. See [spec §9 items 4–5](../../ai-live-coding-poc/spec.md), research 15.

**Blocked by:** 09 (Prompt reference build, Strudel part).

**Status:** ready-for-agent

- [x] Hydra index generated from `hydra-synth@1.4.0`'s glsl function definitions: `name(tex?, input=default, …)` grouped by type, then the runtime API list (~580 tokens); never from `hydra-functions/examples.js`
- [x] Hand-written note (~200 tokens) as spec §9.5: Part shape, what is in scope, helper signatures, `.analyze` requirement, never `a`/`a.fft`/`H`, `render(o0)` and last-`.out()`-wins, the hides-warning
- [x] Versioned header and lockfile check as in ticket 09; both included in the cached prefix

## Comments

**Implemented (2026-10-01).**

- `pnpm build:reference` now also writes `src/reference/hydra-index.txt` (~635 tokens by chars ÷ 4). It imports `hydra-synth/src/glsl/glsl-functions.js` from the app's own `node_modules` and fails if that copy isn't the version the lockfile pins. `scripts/reference/hydraIndex.ts` formats the 52 registry functions as `name(tex?, input=default, …)` under five headings (sources, geometry, colour, blend, modulate). Blend and modulate functions get the leading `tex` that Hydra generates, and a `sampler2D` input is written without its default (`src(tex)`). A registry type the index doesn't know fails the build, so no function is dropped silently. The registry part takes about 1 s and needs no network. The Strudel part runs first and still needs it.
- The runtime list (`hydraRuntime`) is hand-kept in the same module, because no licensed source has it as data. It covers only what a Visual Part should use in this host: `.out`, `o0`–`o3`, `s0`–`s3` with `initImage`/`initVideo`/`clear`, `time`, `speed`, `bpm`, `width`/`height`, `update`/`afterUpdate`, and the array modifiers. Left out on purpose, though in scope: the host's own controls (`render`, `hush`, `tick`, `setResolution`, `screencap`, `setFunction`, `fps`), sources that ask for a device (`initCam`, `initScreen`, `initStream`), and `mouse`.
- `src/reference/hydra-in-strudel.txt` is the hand-kept note (§9.5, ~320 tokens rather than ~200). Beyond §9.5, it says JavaScript's own globals are in scope, that the chain method `.a()` is fine while the global `a` isn't, and never to call `render`, `hush` or `setResolution`. The build never writes it.
- `check:reference` now also requires both files. Both are added to `reference` in `prompt.ts`, inside the cached block. The system prompt's last line now also says to use only the reference's Hydra names and helpers in a Visual Part.
- Tests: `scripts/reference/hydraIndex.test.ts` (formatting, plus the real registry). `src/facade/live/hydraReference.browser.test.ts` checks the committed index against a real hydra-synth built with the host's options: every listed function exists, and a body using every runtime name runs through the hydra tag's own scope (`hydraScope` + `runBody`).

Known limits:

- **The note describes the helpers as spec §8 has them, but the live `hydra` tag doesn't provide them until ticket 14.** Today a Part that uses `pulse('kick')` passes the dry-run, which stubs the helpers, and then fails at evaluate with `pulse is not defined`. Ticket 14 closes that gap. Revisit the note's wording when it lands.
- The runtime list is checked against hydra-synth only in the browser test. A pin move needs a manual review of the list, like the do-not-use list.
