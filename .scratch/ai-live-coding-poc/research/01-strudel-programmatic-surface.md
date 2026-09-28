# Strudel's programmatic surface — what a host can do to a running session

Research for issue `01-strudel-programmatic-surface`. Primary sources only: Strudel source, published npm/jsDelivr bundles, and the docs that ship in `website/` of the same repo.

## Sources and versions read

**The canonical repo has moved.** `github.com/tidalcycles/strudel` is **archived** (`"archived": true`, last push `2025-06-19`, description literally `MOVED TO CODEBERG`) — verified via `https://api.github.com/repos/tidalcycles/strudel`. Do not read it; it is ~14 months stale. Canonical is **https://codeberg.org/uzu/strudel**.

Two things were read, and they differ materially:

| What | Version | Date |
|---|---|---|
| Source at `main` HEAD | commit `8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2` | 2026-08-19 |
| Published npm `@strudel/core`, `@strudel/transpiler`, `@strudel/mini`, `@strudel/draw` | **1.2.6** | published 2026-01-17 |
| Published npm `@strudel/web`, `@strudel/repl`, `@strudel/codemirror`, `@strudel/webaudio` | **1.3.0** | published 2026-01-18 |

Permalink form used below: `https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/<path>` (abbreviated `@8f81463` in prose).

**Seven months of unreleased work sit between npm and `main`.** The single biggest consequence is that **block-based (per-part) evaluation — `repl.evaluateBlock()` — exists only on `main` and is NOT in any published package.** Verified by grepping the published bundle:

```
$ curl -sL https://cdn.jsdelivr.net/npm/@strudel/core@1.2.6/dist/index.mjs | grep -c evaluateBlock
0
```

Everywhere below I mark facts as **[main]**, **[npm]**, or **[both]**.

---

## 1. Packages / embedding substrate

### `@strudel/core` (1.2.6)

- `package.json`: `"main": "index.mjs"`, `publishConfig.main = "dist/index.mjs"`. **No `exports` field** — so deep imports (`@strudel/core/cyclist.mjs`) work against the repo but not against the published tarball, which only ships `dist/`. ([`packages/core/package.json`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/packages/core/package.json))
- `index.mjs` is a flat re-export barrel of `controls, cyclist, evaluate, hap, impure, logger, pattern, pick, repl, signal, speak, state, schedulerState, timespan, ui, util, euclid` plus `Fraction`, `controls`, `createClock`, `drawLine`. ([`packages/core/index.mjs`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/packages/core/index.mjs))
- Load-bearing exports for a host: `repl()`, `Cyclist`, `NeoCyclist`, `Pattern`, `Hap`, `State`, `TimeSpan`, `Fraction`, `silence`, `stack`, `evalScope`, `strudelScope`, `evaluate`, `logger`, `errorLogger`, `logKey`, and the `schedulerState` globals `getTime/setTime/getCps/getPattern/getIsStarted/getTriggerFunc`.
- Note `index.mjs` sets `globalThis._strudelLoaded` and warns on double-load. Strudel is **globals-heavy by design** (see §2 caveats).

### `@strudel/transpiler` (1.2.6)

- Exports everything from `transpiler.mjs` (`transpiler`, `registerLanguage`, `getLanguages`, `registerTranspilerPlugin`, `getPlugins`), plus `registerWidgetType`, `getWidgetID`, and a convenience `evaluate(code, transpilerOptions)`. Importing it registers the mini/sample/widgets/kabelsalat plugins as a side effect. ([`packages/transpiler/index.mjs`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/packages/transpiler/index.mjs))
- This is what makes `"c3 e3"` (double quotes) mean mini-notation and `$:` mean "register a named part". Without it you have plain JS.

### `@strudel/webaudio` (1.3.0)

- Re-exports `webaudio.mjs`, `scope.mjs`, `spectrum.mjs`, `supradough.mjs` **and all of `superdough`**. ([`packages/webaudio/index.mjs`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/packages/webaudio/index.mjs))
- Key symbols: `webaudioRepl(options)` (a thin wrapper that fills in `getTime` and `defaultOutput` then calls `core.repl`), `webaudioOutput`, `getAudioContext`, `initAudioOnFirstClick`, `registerSynthSounds`, `samples`, `renderPatternAudio`, `resetGlobalEffects`, `getAnalyserById`, `getAnalyzerData`, `analysers`.

```js
// packages/webaudio/webaudio.mjs:165
export function webaudioRepl(options = {}) {
  const audioContext = options.audioContext ?? getAudioContext();
  setAudioContext(audioContext);
  options = { getTime: () => audioContext.currentTime, defaultOutput: webaudioOutput, ...options };
  return repl(options);
}
```

### `@strudel/web` (1.3.0) — the "no UI" bundle

[`packages/web/web.mjs`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/packages/web/web.mjs) is ~70 lines. It star-re-exports `core`, `webaudio`, `transpiler`, `mini`, `edo`, `tonal` (1017 named exports in the published bundle) and adds exactly four things of its own:

```js
export function initStrudel(options = {}) {
  initAudioOnFirstClick();
  options.miniAllStrings !== false && miniAllStrings();
  const { prebake, ...replOptions } = options;
  repl = webaudioRepl({ ...replOptions, transpiler });
  initDone = (async () => { await defaultPrebake(); await prebake?.(); return repl; })();
  setTime(() => repl.scheduler.now());
  return initDone;                 // <-- resolves to the repl object
}
window.initStrudel = initStrudel;
Pattern.prototype.play = function () { ... repl.setPattern(this, true) ... };
export function hush() { repl.stop(); }
export async function evaluate(code, autoplay = true) { return repl.evaluate(code, autoplay); }
```

Crucially **`initStrudel()` returns a promise that resolves to the full `repl` object** — this is the host's handle, and it is the documented-by-code (not by prose) entry point. The README only shows `initStrudel(); ... .play()`, and never mentions that the return value is the repl.

### `@strudel/codemirror` (1.3.0)

- Barrel over `codemirror.mjs, highlight.mjs, flash.mjs, slider.mjs, themes.mjs, widget.mjs, basicSetup.mjs` plus `Vim`. ([`packages/codemirror/index.mjs`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/packages/codemirror/index.mjs))
- The load-bearing export is **`StrudelMirror`** ([`codemirror.mjs:166`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/packages/codemirror/codemirror.mjs#L166)), which owns a CodeMirror 6 `EditorView` **and** an internal `core.repl()` (`this.repl`), plus a `Drawer`, highlighting, widgets, sliders, themes, settings persisted to `localStorage` via `@nanostores/persistent` (`codemirrorSettings`).
- Also `defaultSettings`, `codemirrorSettings`, `initEditor`, `extensions`, `compartments`, `markcss`.

### `@strudel/repl` (1.3.0)

- `index.mjs` = `export * from './repl-component.mjs'; export * from './prebake.mjs';` — **it exports no classes**, it only has the side effect of `customElements.define('strudel-editor', StrudelRepl)`. ([`packages/repl/repl-component.mjs`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/packages/repl/repl-component.mjs))
- The web component is a thin wrapper: observes a `code` attribute, constructs a `StrudelMirror` into a sibling `<div>`, and re-emits `onUpdateState` as a DOM `CustomEvent('update')`. The instance is exposed as `element.editor`.
- Note the DOM quirk: **the editor container is inserted as the element's next sibling, not as a child** (`this.parentElement.insertBefore(container, this.nextSibling)`), so it is not styleable/containable as you'd expect.

### `@strudel/embed`

`packages/embed/embed.js` defines `<strudel-repl>` which just creates an `<iframe src="https://strudel.cc/#<base64 code>">`. Hard-codes the public site URL. One-way only (see §2). Not a substrate for a custom host.

### Which substrate for a custom UI?

**`@strudel/web` (or, with a bundler, `@strudel/core` + `@strudel/transpiler` + `@strudel/mini` + `@strudel/webaudio` assembled by hand) is the right substrate for our own editor and our own chrome.** Rationale, all from source:

- It gives you the `repl` object directly — `{ scheduler, evaluate, start, stop, pause, setCps, setPattern, setCode, toggle, state }` — which is the *entire* control surface that `StrudelMirror` itself uses.
- `StrudelMirror` adds nothing to that surface except editor plumbing. Everything it does to the repl, you can do.
- Taking `@strudel/codemirror` means inheriting CodeMirror 6, a `localStorage`-backed global settings store, a `document`-level `start-repl` solo protocol, `repl-evaluate`/`repl-stop`/`repl-toggle-comment` document event listeners, Vim keybindings and a canvas `#test-canvas` prepended to `<body>` — all of which fight a custom chrome.

**But** if we want per-part (`$:`-block) evaluation, that lives in `repl.evaluateBlock` on `main` only, and the only caller is `evalBlock(strudelMirror)` in `@strudel/codemirror`. Using it means either pinning a git dep on `main` or vendoring — see §5.

**License constraint, stated by the project's own docs:** AGPL-3.0-or-later, and the docs explicitly assert it covers *derivative* UIs and even "clones informed by reading Strudel's source code". ([`technical-manual/project-start.mdx`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/website/src/pages/technical-manual/project-start.mdx), "Respect the license"). This is a real constraint on the host app, not a footnote.

---

## 2. Reading state

The single object to hold is the result of `repl()` / `webaudioRepl()` / `initStrudel()`.

### `repl.state` — supported, read-only-by-convention **[both]**

[`packages/core/repl.mjs:32-46`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/packages/core/repl.mjs#L32) declares a **mutable, shared** object (it is `Object.assign`-ed in place, never replaced):

```js
const state = {
  schedulerError: undefined,
  evalError: undefined,
  code: '// LOADING',        // the buffer as last reported via setCode()
  activeCode: '// LOADING',  // the code of the last SUCCESSFUL evaluation
  pattern: undefined,        // the Pattern that is actually scheduled
  miniLocations: [], widgets: [], sliders: [],   // sliders is [main] only
  pending: false,
  started: false,
};
// updateState() also derives:
state.isDirty = state.code !== state.activeCode;
state.error   = state.evalError || state.schedulerError;
```

- **Buffer text vs evaluated code is a first-class distinction**: `state.code` vs `state.activeCode`, with `state.isDirty` telling you they diverge. This is exactly the "buffer ≠ evaluated" question, and it is answered natively.
- **Caveat:** `state.code` is only whatever was last passed to `repl.setCode()` or `repl.evaluate()`. `core.repl` has no editor; `StrudelMirror` is what keeps it in sync, in its CodeMirror `updateListener`:
  ```js
  onChange: (v) => { if (v.docChanged) { this.code = v.state.doc.toString(); this.repl.setCode?.(this.code); } }
  ```
  ([`codemirror.mjs:261`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/packages/codemirror/codemirror.mjs#L261)). With our own editor we must call `repl.setCode()` ourselves, or `state.code` lies.
- **Push channel:** pass `onUpdateState: (state) => {...}` into `repl()`. It fires on every `updateState`. It is the *same mutated object* every time — the website copies it (`setReplState({ ...state })`, [`useReplContext.jsx:96`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/website/src/repl/useReplContext.jsx#L96)). Don't hold a reference and expect a snapshot.

### The evaluated pattern **[both]**

- `repl.state.pattern` and `repl.scheduler.pattern` — same object after a successful eval.
- Also a module global: `getPattern()` from `schedulerState.mjs`, set by `exposeSchedulerPattern(pattern)` inside `setPattern`. ([`packages/core/schedulerState.mjs`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/packages/core/schedulerState.mjs))

### Transport **[both]**

| Question | API | Source |
|---|---|---|
| playing? | `repl.state.started`, `repl.scheduler.started`, or global `getIsStarted()` | `cyclist.mjs` `setStarted`; `schedulerState.mjs` |
| cps | `repl.scheduler.cps` (a plain number, default `0.5`), or global `getCps()` | [`cyclist.mjs:22`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/packages/core/cyclist.mjs#L22) |
| cpm | **not stored.** `setCpm` only does `scheduler.setCps(cpm/60)`. Derive: `scheduler.cps * 60`. | [`repl.mjs` `setCpm`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/packages/core/repl.mjs) |
| current cycle position | `repl.scheduler.now()` → **fractional cycles**, or global `getTime()` | [`cyclist.mjs:87`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/packages/core/cyclist.mjs#L87) |

```js
// cyclist.mjs
now() {
  if (!this.started) return 0;
  const secondsSinceLastTick = this.getTime() - this.lastTick - this.clock.duration;
  return this.lastBegin + secondsSinceLastTick * this.cps;   // cycles, not seconds
}
```

Other readable scheduler internals (undocumented, no stability guarantee): `lastBegin`, `lastEnd`, `lastTick`, `latency` (default `0.1`s), `num_cycles_at_cps_change`, `clock.duration/interval/getPhase()`.

### Absent / traps

- **`state.schedulerError` is dead code.** It is declared, folded into `state.error`, and cleared on every successful eval — but **never assigned anywhere in the repo** (`grep -rn schedulerError` returns only `repl.mjs:34,53,433,545`). `Cyclist` *accepts* an `onError` callback ([`cyclist.mjs:16,80`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/packages/core/cyclist.mjs#L80)) but `repl()` never passes one into `schedulerOptions`. So **runtime/scheduling errors never reach `repl.state`.** A host that watches `state.error` will silently miss every playback-time failure. See §6.
- **The global `schedulerState` singletons are process-wide, last-writer-wins.** `setTime()` is called on every `repl()` construction *and* on every `evaluate()` (`setTime(() => scheduler.now()); // TODO: refactor?` appears three times). With two repls, `getTime()/getCps()/getPattern()/getIsStarted()` describe whichever ran last. Fine for one session, wrong for two.
- **No per-part state is readable.** `pPatterns` (the `$:`/`d1:` registry), `codeBlocks`, `allTransforms`, `eachTransform` are all closure-private in `repl()` and are not returned. See §5.
- **The iframe route gives you almost nothing.** `@strudel/embed` / `<iframe src="strudel.cc/#...">` is one-way *outbound* only: on each eval the site does `window.parent?.postMessage(code)` ([`useReplContext.jsx:108`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/website/src/repl/useReplContext.jsx#L108)) and the only inbound channel is the URL hash, which requires a reload. Confirmed by the only consumer, [`UdelFrame.jsx`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/website/src/components/Udels/UdelFrame.jsx). Would require **forking strudel.cc** to add a real inbound message protocol.

---

## 3. Writing state

### Buffer **[both]**

`core.repl` has no buffer, only the `state.code` string:

```js
const setCode = (code) => updateState({ code });     // repl.mjs, end of repl()
```

It does *not* touch any editor and does *not* evaluate.

`StrudelMirror` has the real buffer ops. Note the **published 1.3.0 surface is smaller than `main`**:

| Method | `main` | npm 1.3.0 |
|---|---|---|
| `setCode(code)` | ✅ (via `replaceCode(code, 0, doc.length)`) | ✅ (inlined dispatch) |
| `replaceCode(code, from, to)` | ✅ | ❌ |
| `insertCode(code, position)` | ✅ | ❌ |
| `appendCode(code)` | ✅ | ✅ |
| `getCursorLocation()` / `setCursorLocation(col)` | ✅ | ✅ |
| `getMiniLocations()` | ✅ | ❌ |

(verified by dumping the `StrudelMirror` class out of `https://cdn.jsdelivr.net/npm/@strudel/codemirror@1.3.0/dist/index.mjs`.)

`setCode` dispatches a CodeMirror transaction, which fires `onChange`, which calls `this.repl.setCode()` — so with `StrudelMirror` the two stay consistent. **`setCode` does not evaluate.**

For a *custom* editor, the equivalent is: own your text, and call `repl.setCode(text)` on change so `state.isDirty` stays meaningful. `replaceCode`/`insertCode` are just `EditorView.dispatch({changes})` — trivially reimplemented; no need to take the CodeMirror dependency for them.

### Evaluation, independent of any editor **[both]**

```js
await repl.evaluate(code, autostart = true);   // transpile + eval + install pattern
```

- Returns the `Pattern` on success, **`undefined` on failure** (it swallows; see §6).
- `autostart=false` evaluates and installs without starting the clock (used by `StrudelMirror.drawFirstFrame`).
- **[npm 1.2.6 only]** there is a **third parameter** in the published build: `evaluate(code, autostart = true, shouldHush = true)` — passing `false` skips the internal `hush()` that clears the `$:` registry. **This parameter was removed on `main`** (the `hush()` call is now unconditional). Verified by decompiling `core@1.2.6/dist/index.mjs`:
  ```js
  return { scheduler: x, evaluate: async (b, k = !0, At = !0) => { ... ft = [], At && Vt(), ... } ...
  ```
  This is an undocumented, silently-removed parameter. Do not build on it.
- You can also bypass the string layer entirely: `repl.setPattern(patternObject, autostart)` installs a `Pattern` you constructed in JS. This is what `Pattern.prototype.play` in `@strudel/web` does.

### Transport **[both]**

`repl.start()`, `repl.stop()`, `repl.pause()`, `repl.toggle()`, `repl.setCps(cps)`.

- `repl.stop()` clears the part registry (`codeBlocks`, `pPatterns`), clears `miniLocations/widgets/sliders`, and calls `scheduler.stop()` → **resets the cycle counter to 0** (`this.lastEnd = 0`).
- `repl.pause()` calls `clock.pause()` only — cycle position is retained and playback resumes where it left off.
- There is **no `setCpm` on the repl object** (only in the eval-scope globals). Use `repl.setCps(cpm/60)`.
- `repl.stop()` stops *scheduling*. Notes already handed to Web Audio (within the `latency = 0.1`s lookahead, plus their release envelopes) keep sounding. There is no "panic"/all-notes-off in `core`; `resetGlobalEffects()` in superdough resets the controller and drops analysers but is not an audio kill switch.

### Absent

- No API to set the cycle position on the default `Cyclist`. `NeoCyclist` (only used when `sync: true` **and** `SharedWorker` exists) has `setCycle(cycle)` that posts to its shared worker ([`neocyclist.mjs:77`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/packages/core/neocyclist.mjs#L77)). So "seek to cycle N" is available on one scheduler and not the other — asymmetric and undocumented. Would need a patch for parity.

---

## 4. Hot-swap semantics

Read from [`cyclist.mjs`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/packages/core/cyclist.mjs) and [`zyklus.mjs`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/packages/core/zyklus.mjs), not the docs.

```js
// cyclist.mjs — the entire swap
async setPattern(pat, autostart = false) {
  this.pattern = pat;
  if (autostart && !this.started) await this.start();
}
```

That is the whole mechanism. Consequences:

- **Does audio drop out?** No. The clock keeps ticking; the next tick simply queries the new `this.pattern`. Voices already scheduled ring out. There is no cross-fade, no re-init of the audio graph.
- **Does the cycle clock reset?** **No, as long as you were already playing.** The tick callback advances `lastEnd` monotonically and is entirely independent of `this.pattern`. The clock resets to 0 only via `stop()` (`this.lastEnd = 0`) — i.e. via `repl.stop()`, not via re-evaluation.
- **Is the swap quantised to a cycle boundary?** **No.** The clock ticks every `interval = 0.1`s with a `0.1`s overlap window; `createClock` is called with `duration = interval = 0.1` from `Cyclist`'s `createClock(getTime, cb, interval, 0.1, 0.1, ...)`. A new pattern takes effect at the **next 100 ms tick**, mid-cycle, with `latency = 0.1`s of scheduling lookahead already committed. If the new pattern's phase differs, you hear it jump.
- **Is quantisation controllable by the host?** **No — there is no quantise option anywhere in `Cyclist`, `repl()` or `StrudelMirror`.** What exists instead:
  - `interval` and `latency` are `Cyclist` constructor options, but `repl()` does **not** forward them — `schedulerOptions` is a fixed literal (`onTrigger, getTime, onToggle, setInterval, clearInterval, beforeStart`). Changing them requires constructing `Cyclist` yourself or patching `repl()`.
  - At the *pattern* level there is `.timeline(n)` ([`packages/core/impure.mjs`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/packages/core/impure.mjs)), explicitly documented as "particularly useful when live coding, for example when you want to cue a pattern up to play from its start", which keeps/resets a per-timeline cycle offset. Its own docstring admits the ergonomics: *"You will likely want to trigger an evaluation a little bit before the cycle starts, to avoid missing events."* — i.e. **cue-to-boundary is the user's problem, not the scheduler's.**
  - A host that wants true quantised swap must implement it itself: read `scheduler.now()`, compute time to the next integer cycle, and `setTimeout` the `evaluate()` call. **This is the recommended approach and it needs no fork.**
- `setCps` is *also* unquantised and rebases the clock: `num_ticks_since_cps_change = 0`, and on the next tick `num_cycles_at_cps_change = lastEnd`. Tempo changes take effect within 100 ms, phase-continuous.
- Patterns can set cps from inside the stream (`hap.value.cps` in the tick loop) — so an evaluated pattern can move the global tempo out from under the host.

---

## 5. Granularity — is a session one blob?

### The `$:` / label mechanism **[both]**

A top-level JS *labelled statement* is rewritten by the transpiler into a `.p('<label>')` call:

```js
// packages/transpiler/transpiler.mjs — labelToP()
// converts label expressions to p calls: "x: y" to "y.p('x')"
```
([`transpiler.mjs:184`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/packages/transpiler/transpiler.mjs#L184))

`Pattern.prototype.p` is injected by `repl()` per instance and writes into the closure-private `pPatterns` map ([`repl.mjs` `injectPatternMethods`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/packages/core/repl.mjs)):

```js
Pattern.prototype.p = function (id) {
  if (typeof id === 'string' && (id.startsWith('_') || id.endsWith('_'))) return silence;  // mute
  if (id.includes('$')) { id = `${id}${anonymousIndex}`; anonymousIndex++; }               // anonymous
  pPatterns[id] = this;
  return this;
};
Pattern.prototype.q = function (id) { return silence; };   // q: / q1..q9 => always silent
// plus getters d1..d9 and p1..p9 => this.p(i)
```

At the end of evaluation, `applyPatternTransforms` stacks them:

```js
for (const [key, value] of Object.entries(pPatterns)) {
  const isSolod = key.length > 1 && key.startsWith('S');   // handle soloed patterns ex: S$: s("bd!4")
  ...
  patterns.push(value.withState((state) => state.setControls({ id: key })));
}
if (eachTransform) patterns = patterns.map((x) => eachTransform(x));
pattern = stack(...patterns);
for (const transform of allTransforms) pattern = transform(pattern);
if (!isPattern(pattern)) pattern = silence;
```

So the addressing conventions are:

| Syntax | Effect | Documented? |
|---|---|---|
| `d1: pat` | named slot; **last one wins** for the same name | yes, [release-1.1.0 blog, "label notation"](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/website/src/content/blog/release-1.1.0-bananensplit.mdx) |
| `$: pat` | anonymous slot; auto-suffixed `$0, $1, …`, so repeats stack | yes |
| `_d1:` / `_$:` | muted (returns `silence`, not registered) | yes (learn/faq.mdx) |
| `d1_:` (trailing `_`) | also muted | **no** — source only (`id.endsWith('_')`) |
| `S$:` / `Sd1:` | **solo** — first `S`-prefixed key clears all non-soloed | **no** — only an inline code comment; CHANGELOG `#1481`, 2025-11-23 |
| `q1:` / `.q(id)` | always silence | **no** |
| `all(f)` | transform applied to the whole stack | yes |
| `each(f)` | transform applied per slot | yes-ish (JSDoc says "intended for future use with upcoming stepwise features") |

`all` and `each` are **not module exports** — they are closures over a specific `repl()` and are injected into `globalThis` via `evalScope`. Confirmed: `grep` of `@strudel/web@1.3.0/dist/index.mjs`'s export list finds no `all` or `each`.

### Can the host address ONE part without touching the others?

**On npm (1.2.6/1.3.0): no.** `repl.evaluate()` always calls `hush()` first, which does `pPatterns = {}; anonymousIndex = 0; allTransform = undefined; eachTransform = undefined;`. Every evaluation is a full rebuild from one code string. The only per-part surface is *textual*: the host edits the `d1:` line in its own buffer and re-evaluates the whole document. There is **no read API** for the registry and **no per-slot mutate/remove API**.

**On `main`: partially, via `repl.evaluateBlock`.** [`repl.mjs` `evaluateBlock`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/packages/core/repl.mjs) is an unreleased second evaluation path:

```js
await repl.evaluateBlock(blockSourceText, /* autostart */ true, { range: [startOffset, endOffset] });
```

Its call shape comes from the only caller, [`packages/codemirror/block_utilities.mjs`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/packages/codemirror/block_utilities.mjs), where a "block" is a run of lines separated by ≥2 consecutive newlines, and the range is its char offsets in the full document.

What it does differently from `evaluate`:
- **It does NOT call `hush()`** — so `pPatterns` from other blocks survive. This is the mechanism for true per-part replacement.
- It passes `blockBased: true` + `range` into the transpiler, which then emits a `labels` array (`{name, index, end, fullMatch, activeVisualizer}`) and rewrites node offsets into document coordinates.
- It keys a `codeBlocks` map by label name, with `cleanupConflictingRanges()` deleting any previously-stored block whose char range overlaps the new one.
- Then `pPatterns = Object.fromEntries(Object.entries(pPatterns).filter(([key]) => Object.keys(codeBlocks).includes(key)))` — **the registry is garbage-collected against the block map**. That is how a part gets *removed*: evaluate a block over the old block's range that no longer declares that label, and the label is dropped from both maps.
- Top-level `var`/`function` declarations in a block are hoisted into the shared `strudelScope` so other blocks can see them ([`transpiler.mjs` `createScopeAssignment`, `core/evaluate.mjs` `strudelScope` / `userDefinedKeys` / `clearScope()`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/packages/core/evaluate.mjs)) — also unreleased.

Sharp edges, all read from source:
- **Anonymous `$:` is rejected outright** in block mode: `throw new Error('anonymous labels disabled for block based evaluation (see https://strudel.cc/blog/#label-notation)')`, with a source comment conceding *"we probably need to update the docs on this"*. Per-part addressing therefore **requires unique named labels** (`d1:`, `bass:`, …). Our host should generate and own those names.
- **`allTransforms = []` is reset on every `evaluateBlock`** — so an `all(...)` declared in a *different* block is silently dropped until that block is re-evaluated. Real quirk.
- The code is self-deprecating in place (`// this is the hackiest bit`) and carries no tests I found. Treat as unstable.
- **Still one blob at the audio layer**: whatever the path, the result is a single `stack(...)` handed to `scheduler.setPattern`. There is no per-slot audio bus, no per-slot scheduler, no per-slot gain.

### Attribution: can you tell which slot made a sound?

- `applyPatternTransforms` does `value.withState((state) => state.setControls({ id: key }))`. But `State.controls` is *query* state, not hap value — and I could find **no consumer of `controls.id` anywhere in the repo**. So the label does **not** reach the `Hap`. No direct slot attribution in the event stream.
- What *does* reach the hap is **source position**: the mini-notation transpiler wraps strings as `m('...', loc)` and `Pattern.withLoc(start, end)` accumulates `hap.context.locations = [{start, end}, ...]` ([`pattern.mjs:575`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/packages/core/pattern.mjs#L575)); this is exactly what the editor highlighter consumes (`highlight.mjs:95`, `for (let { start, end } of hap.context.locations)`). **So a host that knows each slot's character range can map any sounding hap back to its slot.** That is the practical attribution route, and it needs no fork — but it requires keeping the buffer↔range mapping ourselves.

---

## 6. Errors

### Evaluation-time errors — swallowed, not thrown **[both]**

```js
// repl.mjs evaluate() / evaluateBlock()
} catch (err) {
  logger(`[eval] error: ${err.message}`, 'error');
  console.error(err);
  updateState({ evalError: err, pending: false });
  onEvalError?.(err);
}
```

- **`repl.evaluate()` never rejects for user-code errors.** It resolves to `undefined`. A host doing `try { await repl.evaluate(code) } catch {}` will catch nothing; it must check the return value or `state.evalError`. This is easy to get wrong.
- Three channels, all available:
  1. `onEvalError(err)` callback passed to `repl()` — gets the real `Error` object.
  2. `repl.state.evalError` / `repl.state.error`, pushed via `onUpdateState`.
  3. A DOM event: `logger()` dispatches `document.dispatchEvent(new CustomEvent('strudel.log', {detail: {message, type, data}}))` with `logger.key === 'strudel.log'`. Eval errors arrive with `detail.type === 'error'`.
- **Previously-playing pattern keeps running.** On the failure path `setPattern` is never reached, so `scheduler.pattern` is untouched and the clock keeps ticking. Audio continues unchanged. This is the desired live-coding behaviour and it is genuinely what the source does.
- One asymmetry on `main`: `evaluate()` calls `hush()` (clearing `pPatterns`/`codeBlocks`) *before* transpiling. If the eval then throws, the registry is empty while the old pattern is still playing. The next successful `evaluate()` rebuilds from scratch so nothing is audible, but any `evaluateBlock()` issued in between would rebuild the stack from an empty registry and effectively silence the other parts. Undocumented state hazard.
- Only `evaluate('')` / `evaluateBlock('')` throws for real (`throw new Error('no code to evaluate')`) — that one is *outside* the try block, so it **does** reject.

### Playback/scheduling-time errors — invisible to `repl.state` **[both]**

Three nested catches, none of which reaches the host's state:

1. **Inside pattern query.** `Pattern.queryArc` swallows and returns an empty list:
   ```js
   queryArc(begin, end, controls = {}) {
     try { return this.query(new State(new TimeSpan(begin, end), controls)); }
     catch (err) { errorLogger(err, 'query'); return []; }
   }
   ```
   ([`pattern.mjs:420`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/packages/core/pattern.mjs#L420)) → **that tick produces no events (a 100 ms audio hole), the pattern stays installed, and it is retried on the next tick.** A pattern that throws every query is silent-but-"playing" forever.
2. **Inside the tick callback.** `Cyclist`'s clock callback has `catch (e) { errorLogger(e); onError?.(e); }` — but `repl()` never supplies `onError`, so this is `console` + log-event only.
3. **Inside output/trigger.** `getTrigger` wraps the output call: `catch (err) { errorLogger(err, 'getTrigger'); }`.

All three go only to `errorLogger`:
```js
export function errorLogger(e, origin = 'cyclist') {
  if (process.env.NODE_ENV === 'development') console.error(e);
  logger(`[${origin}] error: ${e.message}`);       // <-- NOTE: no type argument
}
```

**Two concrete defects a host must work around:**

- **Scheduling errors are not typed as errors.** `errorLogger` calls `logger(msg)` with `type === undefined`, whereas eval errors call `logger(msg, 'error')`. So a host listening on `strudel.log` cannot filter scheduling errors by `detail.type`; it must string-match `/^\[(cyclist|query|getTrigger)\] error: /`. Confirmed identical in the published 1.2.6 bundle.
- **`process.env.NODE_ENV` survives into the published `@strudel/core@1.2.6/dist/index.mjs`** (`grep -c process.env` → 1). In a browser without a `process` shim, `errorLogger` itself throws `ReferenceError` — *inside a catch block* — turning a recoverable query error into an unhandled one. The `@strudel/web@1.3.0` and `@strudel/codemirror@1.3.0` bundles have it stripped (`@rollup/plugin-replace`), count 0. **So: importing `@strudel/core` directly from a CDN is a footgun; use `@strudel/web`, or `define` `process.env.NODE_ENV` in our bundler.**
- **Also note `logger` debounces**: identical messages within 1000 ms are dropped entirely. A pattern throwing the same error every tick logs once per second, not 10×.
- And: **`logger` itself is not re-exported by `@strudel/web@1.3.0`** — `logKey` is, but `logger`/`errorLogger` are not. Cause: `web.mjs` star-exports both `@strudel/core` and `@strudel/webaudio`, and `superdough/logger.mjs` also exports a `logger`; ambiguous star exports are excluded per the ES spec. Use `document.addEventListener('strudel.log', ...)` (the string is stable and `logKey` is exported) rather than importing `logger`.

### What would need a fork

- Getting scheduling errors into `repl.state.schedulerError` — one line (`onError: (err) => updateState({schedulerError: err})` in `schedulerOptions`). Trivially patchable, genuinely absent.
- Getting `repl.evaluate` to reject rather than swallow.

---

## 7. Analysis / introspection

### Querying a Pattern over an arbitrary span — fully supported **[both]**

```js
const haps = pattern.queryArc(beginCycle, endCycle);           // array of Hap
pattern.firstCycle();                                          // = query over [0,1), context stripped
pattern.firstCycleValues;  pattern.showFirstCycle;             // accessors
```

- `queryArc(begin, end, controls = {})` — cycle-valued floats/Fractions. ([`pattern.mjs:420`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/packages/core/pattern.mjs#L420))
- `Hap` fields ([`hap.mjs`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/packages/core/hap.mjs)): `whole` (TimeSpan | undefined for continuous signals), `part`, `value` (the control object — `s`, `note`, `gain`, …), `context` (incl. `locations`, `onTrigger`), plus `duration` / `endClipped` getters and `hasOnset()`, `isActive(t)`, `isInPast(t)`, `isInNearPast(margin, t)`.
- **Caveat for host analysis:** `queryArc` is marked `@noAutocomplete` (internal-ish) and **swallows errors, returning `[]`** — an empty result is ambiguous between "no events" and "your pattern threw".
- This is a pure function of the pattern, so the host can query **ahead** of the playhead: `repl.state.pattern.queryArc(now, now + 4)` gives the next 4 cycles. That is the most useful introspection primitive on offer.

### "What is currently sounding" — supported, three ways **[both]**

1. **Per-event callback (the supported hook).** `repl()` takes an `editPattern` option, invoked as `pattern = editPattern?.(pattern) || pattern` in `setPattern`. Strudel's own docs page uses it to attach a listener:
   ```js
   editPattern: (pat, id) => {
     if (onTrigger) pat = pat.onTrigger(onTrigger, /* dominant */ false);   // false = keep audio output
     return pat;
   }
   ```
   ([`website/src/docs/MiniRepl.jsx:60`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/website/src/docs/MiniRepl.jsx#L60); `Pattern.prototype.onTrigger(fn, dominant = true)` at [`pattern.mjs:875`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/packages/core/pattern.mjs#L875)). **`dominant` must be `false` or the default webaudio output is disabled.** This is the cleanest "tap the event stream" hook and it needs no fork. It is undocumented in prose.
   *Docs/source mismatch:* the website destructures `(pat, id)`, but `repl.mjs` calls `editPattern?.(pattern)` with **one** argument. `id` is always `undefined`.
2. **`Drawer` (from `@strudel/draw`).** `new Drawer(onDraw, [lookbehind, lookahead])`, `drawer.start(repl.scheduler)`. It rAF-polls `scheduler.now()`, queries `scheduler.pattern.queryArc(...)` and maintains `drawer.visibleHaps`; `StrudelMirror` filters with `haps.filter(hap => hap.isActive(time))` to get the current frame. ([`packages/draw/draw.mjs`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/packages/draw/draw.mjs), [`codemirror.mjs:192`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/packages/codemirror/codemirror.mjs#L192)). Reusable headlessly — `Drawer` is a plain class with no DOM dependency of its own; only `getDrawContext()` touches the DOM.
3. **Roll your own**: `repl.scheduler.pattern.queryArc(repl.scheduler.now(), repl.scheduler.now() + dt)`.

### Audio analysis (FFT / scope) — supported but **opt-in per pattern** **[both]**

From [`packages/superdough/superdough.mjs`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/packages/superdough/superdough.mjs):

```js
export let analysers = {}, analysersData = {};
export function getAnalyserById(id, fftSize = 1024, smoothingTimeConstant = 0.5) { ... }
export function getAnalyzerData(type = 'time', id = 1) { /* 'time' | 'frequency' -> Float32Array */ }
```

**The analyser node is only wired in if the hap carries the `analyze` control**: `if (analyze && !(ac instanceof OfflineAudioContext)) { const analyserNode = getAnalyserById(analyze, 2 ** (fft + 5)); effectSend(post, analyserNode, 1); }` (superdough.mjs:990). `analyze` is a normal control (`controls.mjs:773`), and `.scope()` / `.spectrum()` are sugar for `this.analyze(id).draw(...)` ([`webaudio/scope.mjs`](https://codeberg.org/uzu/strudel/src/commit/8f81463b9cb5ddd5f117ed7baef6a1fde9445dc2/packages/webaudio/scope.mjs), `spectrum.mjs`).

So: **there is no master-bus analyser.** To scope the whole mix the host must ensure the pattern is `.analyze(1)`-tagged (e.g. via `editPattern: (pat) => pat.analyze(1)` — clean, no fork), or attach its own `AnalyserNode` to `getAudioContext().destination`'s upstream, which superdough does not expose a handle for. `resetGlobalEffects()` wipes `analysers`/`analysersData`.

### Offline render — supported, but destructive

`renderPatternAudio(pattern, cps, begin, end, sampleRate, maxPolyphony, multiChannelOrbits, downloadName?)` in `@strudel/webaudio` renders a cycle range through an `OfflineAudioContext` to a WAV. **It calls `await audioContext.close()` on the live context first** and `setAudioContext(null)` after — i.e. it tears down live audio. Usable for offline analysis, not concurrently with a session.

### Absent

- No "which slot is sounding" (see §5 — source-location mapping is the workaround).
- No loudness/level metering beyond the raw analyser.
- No MIDI-clock-style external transport sync other than `NeoCyclist`'s `SharedWorker` between same-origin Strudel instances.

---

## Implications / what this constrains

1. **Substrate: `@strudel/web`, not `@strudel/repl`.** `initStrudel()` resolves to the `repl` object, which *is* the complete control surface. `StrudelMirror` adds only editor plumbing plus a pile of global DOM/localStorage side effects that will fight our chrome. Verified against both source and the shipped 1.3.0 bundle.
2. **The state model we can rely on is small and stable-ish**: `{ code, activeCode, isDirty, pattern, started, evalError, pending }` plus `scheduler.{cps, started, now()}`. The buffer/evaluated split we wanted is native (`code` vs `activeCode`). Everything richer is closure-private.
3. **We own the buffer.** `core.repl` has no editor. Our editor is the source of truth; we must call `repl.setCode(text)` on every change for `isDirty` to mean anything, and `repl.evaluate(text)` to apply. Set-without-evaluate and evaluate-without-editor are both first-class.
4. **Hot-swap is free; quantisation is ours to build.** Re-evaluating never drops audio and never resets the clock. It is also never quantised, and there is no knob. A "apply at next cycle boundary" feature is ~10 lines on top of `scheduler.now()` and needs no fork — but it is a feature *we* own, and the 0.1 s tick + 0.1 s latency sets the floor on how tight it can be.
5. **Per-part addressing is the risky bit.** On published Strudel a session is one blob: every `evaluate` rebuilds the whole `$:` registry, and there is no read/replace/remove API for a single part. `evaluateBlock` on `main` does give real per-part semantics — no `hush()`, label-keyed `codeBlocks`, range-based conflict cleanup — but it is **unreleased, untested, self-described as "the hackiest bit", rejects anonymous `$:`, and resets `all()` transforms**. Depending on it means a git/vendored dep on `main`, and accepting churn. The safe alternative is: **the host keeps a structured model of named parts and re-serialises the whole document on every change**, re-evaluating the blob. Given that full re-evaluation is audibly seamless (point 4), that is a legitimate design and probably the right first move.
6. **Slot attribution goes through source offsets, not IDs.** Haps carry `context.locations`; the `id` control set per slot goes nowhere. If we want "which part is making this sound", we must own the char-range↔part mapping. That pushes toward the host generating the document from a structured model anyway (point 5).
7. **Error handling needs a wrapper on day one.** `repl.evaluate` swallows and resolves `undefined`; playback errors never reach `repl.state` at all and arrive untyped on the `strudel.log` DOM event. Plan for: check the return value, wire `onEvalError`, *and* listen on `document` for `strudel.log` with a `/^\[(cyclist|query|getTrigger)\] error:/` match. Getting scheduling errors into `state.schedulerError` properly is a one-line patch we may want to carry.
8. **AGPL-3.0-or-later.** The project's own docs assert it reaches derivative UIs and even clean-room clones informed by reading the source. This is a product-level decision, not an engineering detail, and it should be settled before we build on Strudel at all.
9. **Two moving targets.** npm is ~7 months behind `main`. Pin exact versions (`@strudel/web@1.3.0`), and if we take `evaluateBlock`, pin a commit SHA.

---

## Open questions / not confirmed

- **Is a newer npm release imminent?** Not determinable from source. npm `latest` for `@strudel/core` is 1.2.6 (2026-01-17); `main` HEAD is 2026-08-19. I did not find a release branch or changelog entry past January 2026 (`CHANGELOG.md` itself is stale — its newest entry is 2026-01-15, generated by `warm.js`).
- **Audible behaviour of `evaluateBlock` under rapid partial updates** — I read the code but ran nothing. Whether replacing one label mid-cycle is glitch-free in practice is untested here.
- **Exact removal semantics for a part via `evaluateBlock`.** I traced the path (`handleDeclarationBlock` → `cleanupConflictingRanges` → `pPatterns` filter) and it *should* drop a label whose block no longer declares it, but `evalBlock` guards with `if (block)` so an emptied block is never submitted. Whether a host can reliably remove a part without a full re-eval is **unverified** — this needs a browser experiment.
- **`each()` reliability.** Its own JSDoc says "intended for future use with upcoming 'stepwise' features" and the source notes the test framework cannot exercise `each`/`all`. Treat as unstable.
- **Does `state.controls.id` (the per-slot label) reach anything at all?** I grepped the whole repo and found no consumer. It may be dead, or consumed by an out-of-tree package. I could not rule out the latter.
- **Whether `Drawer` genuinely works headless.** It has no DOM imports of its own and takes the scheduler as an argument, so it should, but I did not run it outside a browser.
- **Multi-instance behaviour.** `setTime`/`setCpsFunc`/`setPattern` in `schedulerState.mjs` are module globals set per-`repl()`; `_strudelLoaded` guards double-loading. I did not test two concurrent repls, and the `solo`/`start-repl` document-event protocol in `StrudelMirror` suggests the project treats multi-instance as an edge case.
- **Three distinct things are called `hush`** — confirmed, and worth knowing before naming anything in our own API:
  1. `Pattern.prototype.hush = function () { return silence; }` (`pattern.mjs:2515`) — a pattern combinator that silences one branch of a stack.
  2. `repl()`'s internal `hush` (injected into the eval scope) — clears `pPatterns`/`codeBlocks`/transforms and returns `silence`. **It does not stop the scheduler**; audio only stops because the resulting pattern is `silence`.
  3. `@strudel/web`'s exported `export function hush() { repl.stop(); }` — this one really does stop the transport.
  A host calling `hush()` gets (3) if it imported from `@strudel/web`, but a *user* typing `hush()` in the buffer gets (2). Different semantics, same name.
