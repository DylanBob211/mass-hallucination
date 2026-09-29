# 01: Scaffold

**What to build:** An empty but fully-tooled app: a localhost page showing a CodeMirror 6 editor inside a Svelte 5 shell, with the pinned dependencies, the checking/linting/formatting toolchain, both test projects, and a plain façade that publishes an empty view model. See [spec §3 and M0](../../ai-live-coding-poc/spec.md), ADR 0006.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [x] Vite + Svelte 5 + raw CodeMirror 6 (no SvelteKit, no `@strudel/codemirror`); the CM document is the only copy of the Source
- [x] pnpm with `save-exact`, lockfile committed; runtime pins exactly as spec §3 (`@strudel/web@1.3.0`, `hydra-synth@1.4.0`, `effect@3.22.x`, current `@anthropic-ai/sdk`)
- [x] Vite `define` sets `process.env.NODE_ENV`; no CDN import map
- [x] `VITE_ANTHROPIC_API_KEY` read from a git-ignored `.env.local`
- [x] TS 7 + `@effect/tsgo` type-check, `svelte-check --tsgo`, ESLint flat config, Prettier, Tailwind v4 with tokens as CSS variables — each has a pnpm script and passes
- [x] Vitest with two projects: Node (default, `@effect/vitest`) and browser mode (Playwright); one trivial test in each passes
- [x] A façade (plain TS) owns a `ManagedRuntime` and publishes an immutable, empty view model the Svelte shell renders from; Effect appears nowhere outside the core and façade

## Comments

**Implemented (2026-09-29).** Notes for later tickets:

- **Vitest 3.2.7 on Vite 7, not Vitest 5 / Vite 8.** `@effect/vitest@0.30.0` (the Effect 3 line) declares peer `vitest ^3.2.0`. Browser mode uses `@vitest/browser` 3.2.7's built-in `playwright` provider. Move all three together when moving to Effect 4.
- **TS 7 is `@typescript/native` (alias of `typescript@7.0.2`)**, patched by `effect-tsgo patch` in `prepare`. `typescript` is 6.0.3, used by svelte-check and typescript-eslint. `pnpm typecheck` calls the TS 7 binary by path.
- **Run pnpm through corepack** (`packageManager` pins pnpm 10.34.6). On this machine the `pnpm` on PATH is a Windows shim.
- `pnpm check` runs everything. Browser tests need `pnpm exec playwright install chromium` once.
- **Effect confinement is enforced by ESLint** (`no-restricted-imports` outside `src/core/**` and `src/facade/**`).
- **Deviation from ADR 0006's wording:** `App.svelte` reads the view model through `createSubscriber` + `$derived.by`, not a `$state.raw`. The effect is the same: the object is immutable, replaced whole and never deep-proxied. The `$state.raw` form trips Svelte's `state_referenced_locally` on the `facade` prop, and it assigns state inside `$effect`.
