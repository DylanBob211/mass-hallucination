# 02: Play the whole Source

**What to build:** The thinnest path from keypress to sound. A human types Strudel into the editor, presses Ctrl-Enter and hears it; Ctrl-. stops it. The status line shows transport. No Parts, no Live code yet — the whole editor text is evaluated. See [spec §5, §10 and M1](../../ai-live-coding-poc/spec.md), ADR 0002.

**Blocked by:** 01 (Scaffold).

**Status:** ready-for-agent

- [x] `@strudel/web` embedded from the bundle and its repl initialised on first user gesture
- [x] An `Editor` Effect service over CodeMirror exposes reading the Source and subscribing to changes (a fake `Editor` exists for Node tests)
- [x] Ctrl-Enter evaluates the Source and starts the transport if stopped; Ctrl-. stops the transport; focus stays in the editor
- [x] Façade `apply()` and `stopTransport()` drive the same behaviour
- [x] Status line shows running/stopped, current cycle and cps, updating live (`setcps` in code is reflected)
- [ ] Manually verified: the spec §12 seed Performance plays

## Comments

**Implemented (2026-09-30).** The last box is open: in headless Chromium, keyboard only, the seed boots audio on the first Ctrl-Enter, loads `bd` and `hh` from dirt-samples, runs (cycle advancing, `setcps(0.8)` shown within one poll), and Ctrl-. stops it with focus kept. Nobody has *listened* to it yet, so a human needs to check it by ear with `pnpm dev`. Notes for later tickets:

- **Seams.** `Editor` (`read`, `changes`) and `Strudel` (`evaluate`, `stop`, `transport`, `position`) are Tags in `src/core/`. Their live layers are in `src/facade/live/`, and in-memory fakes are in `src/core/fakes.ts`. `createFacade(host)` takes the `Editor | Strudel` layer. `createLiveFacade(view)` wires the real ones. `Editor.write` is not built yet; it arrives with the first agent write.
- **The view is created in `main.ts`**, before the façade. `Editor.svelte` only mounts `view.dom`. The keymap reaches the façade through closures.
- **First gesture.** `initStrudel` sets audio up only on a `mousedown` on `document`, and a performer's first gesture is usually a key. So the live layer boots on the first `keydown`/`pointerdown` (capture) or the first evaluate, and dispatches the `mousedown` itself. superdough's `initAudio` never actually calls `resume()` (its guard is `(!audioCtx) instanceof OfflineAudioContext`, which is always false), so the host calls it.
- **Transport is polled** every 50 ms (`Schedule.spaced`, so it runs under `TestClock`). Strudel reports neither `setcps` nor cycle changes. A view model is published only when `started`, `cps` or the whole cycle changes. `cycle` is a separate view-model field from `transport`, because CONTEXT.md keeps position out of Transport.
- **Eval errors** come from `repl.state.evalError` after `evaluate` resolves (it never rejects for user code). They become `EvalError`. The façade ignores them until ticket 05. An empty Source is evaluated as `" "` (silence), because `evaluate("")` throws.
- **`optimizeDeps.include: ["@strudel/web"]`.** Without it, Vite finds the lazy import on the first Ctrl-Enter, re-optimises and reloads the page. The first browser test run failed the same way.
- There is no mutex on evaluates yet (spec §5). It comes with the dry-run.
