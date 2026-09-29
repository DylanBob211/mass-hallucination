# 01: Scaffold

**What to build:** An empty but fully-tooled app: a localhost page showing a CodeMirror 6 editor inside a Svelte 5 shell, with the pinned dependencies, the checking/linting/formatting toolchain, both test projects, and a plain façade that publishes an empty view model. See [spec §3 and M0](../../ai-live-coding-poc/spec.md), ADR 0006.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Vite + Svelte 5 + raw CodeMirror 6 (no SvelteKit, no `@strudel/codemirror`); the CM document is the only copy of the Source
- [ ] pnpm with `save-exact`, lockfile committed; runtime pins exactly as spec §3 (`@strudel/web@1.3.0`, `hydra-synth@1.4.0`, `effect@3.22.x`, current `@anthropic-ai/sdk`)
- [ ] Vite `define` sets `process.env.NODE_ENV`; no CDN import map
- [ ] `VITE_ANTHROPIC_API_KEY` read from a git-ignored `.env.local`
- [ ] TS 7 + `@effect/tsgo` type-check, `svelte-check --tsgo`, ESLint flat config, Prettier, Tailwind v4 with tokens as CSS variables — each has a pnpm script and passes
- [ ] Vitest with two projects: Node (default, `@effect/vitest`) and browser mode (Playwright); one trivial test in each passes
- [ ] A façade (plain TS) owns a `ManagedRuntime` and publishes an immutable, empty view model the Svelte shell renders from; Effect appears nowhere outside the core and façade
