# 09: Prompt reference build, Strudel part

**What to build:** `pnpm build:reference` generates the committed grounding text the agent's cached prompt uses for Strudel, and the build fails if it was generated from different versions than the lockfile pins. See [spec §9 items 1–3](../../ai-live-coding-poc/spec.md), research 06.

**Blocked by:** 01 (Scaffold).

**Status:** ready-for-agent

- [x] Checks out `codeberg.org/uzu/strudel` at the commit that published `@strudel/core@1.2.6` / `@strudel/web@1.3.0` and runs `jsdoc-json`
- [x] Takes the callable union from the app's own `@strudel/web` bundle (module keys ∪ `Pattern.prototype` names)
- [x] Emits `name(params) [=synonyms] — first sentence` for entries passing autocomplete's filter and in the union (≈514 entries, ~10K tokens)
- [x] Copies `learn/strudel-vs-tidal.mdx` verbatim from the same checkout
- [x] A hand-kept do-not-use list seeded as spec §9.3
- [x] Each output has a header naming its exact versions; a check fails the build when they differ from the lockfile
- [x] Outputs are committed

## Comments

**Implemented (2026-09-30).**

- `pnpm build:reference` (`scripts/build-reference.ts`) reads the `@strudel/web` and `@strudel/core` pins from `pnpm-lock.yaml`. It clones `codeberg.org/uzu/strudel` (blobless, cached in the OS temp dir) and finds the commit that published both, which today is `f610965f` ("Publish", 2026-01-17). It installs the `jsdoc`/`jsdoc-json` versions Strudel's own lockfile pins and runs the repo's `npm run jsdoc-json`. It writes `src/reference/strudel-index.txt` (466 lines, ~9.4K tokens by chars ÷ 4) and `src/reference/strudel-vs-tidal.txt` (the mdx verbatim under the header). A cold run takes ~30 s. Two runs give byte-identical output.
- The callable union (`scripts/reference/bundle.ts`) imports the app's own `@strudel/web/dist/index.mjs` in Node, with bare `EventTarget`s as `window`/`document`. It gives 1017 exports and 1169 prototype names, 1471 in all, as in research 06. It reads prototype descriptors rather than values, because getters such as `firstCycleValues` run a query when read.
- `src/reference/strudel-do-not-use.txt` is hand-kept. The build never writes it.
- Each file's second line is `Versions: <package>@<version> …`. `pnpm check:reference` (`scripts/check-reference.ts`) fails when a named version isn't the one the lockfile resolves, when a file names none, or when one of the three files is missing. `pnpm build` and `pnpm check` run it first. When a pin moves, re-run the build, review the do-not-use list against the new version, and update its Versions line by hand.
- Tests: `scripts/reference/*.test.ts` (index formatting, the version check, and the real bundle's names), run by the node vitest project. `scripts/tsconfig.json` is added to `pnpm typecheck`.

Decisions beyond the spec:

- **466 entries, not ≈514.** Research 06 counted at Strudel's `main` (`8f81463`), which has more docs than the publish commit.
- **`while` does not exist in `@strudel/web@1.3.0`** (nor at `main`). §9.3's "use `every`/`while`" would send the agent to a missing function. The list recommends `every`/`firstOf`/`lastOf`, or `.when("<0!6 1!2>", f)` for Tidal's `whenmod 8 6 f` (checked by querying it). It also says `while` isn't there.
- One line per name. `doc.json` lists some names twice (supradough's undocumented `DoughVoice#…` members), and the documented entry wins. An undocumented entry already listed as another entry's synonym (`cutoff`, `hcutoff`, `bandf`) is left out.
- Values (`sine`, `rand`, `perlin`, …) are written without parentheses. Params show `...rest`, `optional?`, `=default`, and an options object's keys as `config{rate?, …}`. The first sentence doesn't end at "i.e."/"e.g.".

Known limits:

- The commit search walks only `origin/HEAD`'s history. A publish that exists only on a release branch would not be found (the build fails loudly).
- The check trusts a header to name every version it depends on. A header that leaves out `@strudel/core` would still pass.
- Nothing consumes these files yet. Ticket 10 puts them in the cached prompt.
