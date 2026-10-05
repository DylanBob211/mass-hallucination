# 22: Live event highlighting

**What to build:** Undecided. Should each event in the Source's Mini-notation light up as it plays, as in Strudel's REPL? Split out from [ticket 21](21-syntax-highlighting.md), which does static colouring only.

**Blocked by:** 21 (Syntax highlighting).

**Status:** needs-triage

## Known so far

- Each hap carries `hap.context.locations`, its `{start, end}` character offsets, when the transpiler runs with `emitMiniLocations` (`@strudel/transpiler@1.2.6`).
- The offsets are into the code Strudel evaluated. Under scoped composition (ADR 0002) that is the composition, not the Source, so they need mapping back to Source offsets, like error positions already are.
- It means a decoration update on every frame, alongside the visuals canvas. Its frame-time cost should be measured with ticket 19's instrumentation.
- Muted and soloed-out Parts make no events, so they would not light up.

## Comments
