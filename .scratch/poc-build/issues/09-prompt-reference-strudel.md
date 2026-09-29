# 09: Prompt reference build, Strudel part

**What to build:** `pnpm build:reference` generates the committed grounding text the agent's cached prompt uses for Strudel, and the build fails if it was generated from different versions than the lockfile pins. See [spec §9 items 1–3](../../ai-live-coding-poc/spec.md), research 06.

**Blocked by:** 01 (Scaffold).

**Status:** ready-for-agent

- [ ] Checks out `codeberg.org/uzu/strudel` at the commit that published `@strudel/core@1.2.6` / `@strudel/web@1.3.0` and runs `jsdoc-json`
- [ ] Takes the callable union from the app's own `@strudel/web` bundle (module keys ∪ `Pattern.prototype` names)
- [ ] Emits `name(params) [=synonyms] — first sentence` for entries passing autocomplete's filter and in the union (≈514 entries, ~10K tokens)
- [ ] Copies `learn/strudel-vs-tidal.mdx` verbatim from the same checkout
- [ ] A hand-kept do-not-use list seeded as spec §9.3
- [ ] Each output has a header naming its exact versions; a check fails the build when they differ from the lockfile
- [ ] Outputs are committed
