# 17: Prompt reference, Hydra part

**What to build:** `pnpm build:reference` also produces the Hydra index and the "Hydra inside Strudel" note, so the agent can write Visual Parts. See [spec §9 items 4–5](../../ai-live-coding-poc/spec.md), research 15.

**Blocked by:** 09 (Prompt reference build, Strudel part).

**Status:** ready-for-agent

- [ ] Hydra index generated from `hydra-synth@1.4.0`'s glsl function definitions: `name(tex?, input=default, …)` grouped by type, then the runtime API list (~580 tokens); never from `hydra-functions/examples.js`
- [ ] Hand-written note (~200 tokens) as spec §9.5: Part shape, what is in scope, helper signatures, `.analyze` requirement, never `a`/`a.fft`/`H`, `render(o0)` and last-`.out()`-wins, the hides-warning
- [ ] Versioned header and lockfile check as in ticket 09; both included in the cached prefix
