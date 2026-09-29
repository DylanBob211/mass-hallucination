# 02: Play the whole Source

**What to build:** The thinnest path from keypress to sound. A human types Strudel into the editor, presses Ctrl-Enter and hears it; Ctrl-. stops it. The status line shows transport. No Parts, no Live code yet — the whole editor text is evaluated. See [spec §5, §10 and M1](../../ai-live-coding-poc/spec.md), ADR 0002.

**Blocked by:** 01 (Scaffold).

**Status:** ready-for-agent

- [ ] `@strudel/web` embedded from the bundle and its repl initialised on first user gesture
- [ ] An `Editor` Effect service over CodeMirror exposes reading the Source and subscribing to changes (a fake `Editor` exists for Node tests)
- [ ] Ctrl-Enter evaluates the Source and starts the transport if stopped; Ctrl-. stops the transport; focus stays in the editor
- [ ] Façade `apply()` and `stopTransport()` drive the same behaviour
- [ ] Status line shows running/stopped, current cycle and cps, updating live (`setcps` in code is reflected)
- [ ] Manually verified: the spec §12 seed Performance plays
