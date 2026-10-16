# Spec: AI-native live-coding POC

The destination of [the map](map.md). Every decision here was made on a ticket and lives in an ADR
or a ticket answer; this spec assembles them into a build order and states the few defaults the
build needs. Where it says "see ADR", the ADR is normative and this spec does not restate the
argument.

Vocabulary is [`CONTEXT.md`](../../CONTEXT.md). Its terms (Performance, Source, Part, Preamble,
Surface, Visual Part, Live code, Unapplied edits, Apply, Scope, Rev, Autonomy, Proposal, Stale,
Instruction, Turn) are used exactly.

## 1. What it is, and what it is not

**It is** a page on localhost where one human live-codes music in Strudel and visuals in Hydra in
one editor, and one AI pair-programmer changes that code on request through one tool. It exists to
judge whether semi-autonomous AI performers are worth pursuing. It is throwaway.

**It passes** when the four acceptance scenarios (§12) work within the budget (§12.5), above all
the rule that the agent never disturbs the Performance.

**It is not** (see the map's Out of scope for the reasons):
- an agent that perceives sound or pictures: it reads code only;
- an agent that acts unprompted, remembers earlier Instructions, or talks back after landing;
- more than one agent, or more than one landed change per Instruction;
- saved, shared, recorded or deployed: refresh loses everything, and the key never leaves localhost;
- a place for undo beyond the editor's own text history, Apply-Part-at-cursor, or more than one
  open Proposal;
- more than one canvas: Hydra's four outputs, no video input, no external sources;
- sandboxed: agent code runs in the page (known debt, [ADR 0005](../../docs/adr/0005-poc-agent-loop-runs-in-the-browser.md));
- a licensing decision: Strudel and hydra-synth are AGPL-3.0, to settle before anything ships.

## 2. Architecture at a glance

| Concern | Decision | Normative source |
|---|---|---|
| State model | Source is truth; Parts are parsed from top-level labels; Surface derived from the code | [ADR 0001](../../docs/adr/0001-source-is-truth-parts-are-a-projection.md) |
| Embedding and Apply | `@strudel/web@1.3.0` + `hydra-synth@1.4.0`, published npm, bundled; an Apply evaluates a composition of Live code with the in-Scope Parts substituted | [ADR 0002](../../docs/adr/0002-scoped-composition-on-published-strudel.md) |
| How agent changes land | By Autonomy (Propose / Write / Apply); never on Unapplied text; refused atomically | [ADR 0003](../../docs/adr/0003-agent-changes-land-by-autonomy-never-on-unapplied-text.md) |
| Tool surface | One tool, `change_parts`; state pushed; every change dry-run | [ADR 0004](../../docs/adr/0004-one-tool-state-pushed-dry-run-gated.md) |
| Runtime | Loop in the page, hand-written in Effect, behind a `Model` service over `@anthropic-ai/sdk`; one fresh request per Instruction | [ADR 0005](../../docs/adr/0005-poc-agent-loop-runs-in-the-browser.md) |
| Stack | Svelte 5 + raw CodeMirror 6 on Vite; the CM document is the Source; a plain façade is the only place Effect meets the UI | [ADR 0006](../../docs/adr/0006-svelte-codemirror-behind-an-effect-facade.md) |
| Interaction | Ask at the cursor; the agent works visibly in the code; one status line; Part-in-focus band over the canvas | [ADR 0007](../../docs/adr/0007-instructions-at-the-cursor-state-in-one-status-line.md) |
| Budget | Don't disturb the Performance; loose Turn limits | [ticket 10](issues/10-latency-and-control-budget.md) |

```
┌──────────────── page (localhost) ────────────────────────────────────────┐
│  Hydra canvas (fixed, full screen, pointer-events:none)                   │
│  ┌── Svelte shell ─────────────────────────────────────────────────────┐ │
│  │  CodeMirror 6 (transparent) = the Source   · status line · peek      │ │
│  └───────────────▲──────────────────────────────────┬─────────────────┘ │
│        view model │ (subscribe)           plain calls│                    │
│  ┌────────────────┴──── façade (plain TS) ──────────▼─────────────────┐ │
│  │ ManagedRuntime · Turn fiber                                          │ │
│  │ Effect core: Parser · Apply · DryRun(audio, visual) · change_parts   │ │
│  │              Loop · Editor service · Model service · Instrumentation │ │
│  └──────┬─────────────────────┬──────────────────────┬─────────────────┘ │
│   @strudel/web repl     hydra-synth (live + dry-run)  @anthropic-ai/sdk ──┼──► api.anthropic.com
└──────────────────────────────────────────────────────────────────────────┘
```

## 3. Dependencies and toolchain

Exact pins, pnpm with `save-exact`, lockfile committed ([ADR 0002](../../docs/adr/0002-scoped-composition-on-published-strudel.md), [ADR 0006](../../docs/adr/0006-svelte-codemirror-behind-an-effect-facade.md)).

- **Runtime:** `@strudel/web@1.3.0` (brings `@strudel/core|mini|tonal|transpiler@1.2.6`,
  `@strudel/webaudio@1.3.0`), `hydra-synth@1.4.0`, `@anthropic-ai/sdk` (current), `effect@3.22.x`,
  `svelte@5`, CodeMirror 6 packages (`@codemirror/state|view|commands|lang-javascript`),
  `bits-ui` only if an interaction needs a primitive (none does yet).
- **Not used:** `@strudel/codemirror`/`StrudelMirror`, `@strudel/hydra`, `@effect/ai`,
  `@effect/platform`, SvelteKit, any agent framework.
- **Bundler:** Vite, with `define: { 'process.env.NODE_ENV': JSON.stringify(mode) }` (disarms the
  `errorLogger` `ReferenceError` in `@strudel/core@1.2.6`). No CDN import map.
- **Key:** `VITE_ANTHROPIC_API_KEY` in `.env.local` (git-ignored); a dedicated Console workspace
  with a spending limit; sent with `dangerouslyAllowBrowser: true`.
- **Tooling:** TS 7 + `@effect/tsgo` for checking (TS 6 kept for `svelte-check --tsgo` and
  typescript-eslint), ESLint flat config, Prettier, Tailwind v4 (`@tailwindcss/vite`; tokens are
  CSS variables the CM theme also reads).
- **Tests:** Vitest + `@effect/vitest` in Node by default (fake `Editor`, fake `Model`); a separate
  Vitest browser-mode project (Playwright) only for the dry-run and glue against the real bundle.
  No component or end-to-end tests.
- **Effect v4 rules:** no `@effect/platform`, no `Runtime<R>`, no `FiberRef`, Effect only in the core.

## 4. The Performance model

Derived from the Source on every change; nothing below is stored except each Part's Live code.

- **Parts.** A top-level labelled statement (`hats: s("hh*8")`) is a Part. Its **identity** is the
  label with mute/solo marks stripped. Its **text** runs from its leading comment run (comment lines
  directly above the label, no blank line between) to the end of the statement. Blank-line-separated
  comments are interstitial and belong to the Preamble.
- **Preamble.** All other top-level text, anonymous `$:` blocks included (unaddressable, not
  invalid), is one unit addressed as `"(preamble)"`.
- **Surface.** A Part whose expression is exactly a host `hydra` tagged template (``viz: hydra`…` ``)
  is Visual; every other Part is Audio. Unlabelled Hydra is Preamble. Hydra in any other shape is
  refused by the dry-run.
- **Muted / soloed.** Read from the label using Strudel 1.2.6's transpiler rules (`_x:`, `x_:` mute;
  its solo mark for solo). Solo works within one Surface.
- **Rev.** First 8 hex chars of SHA-256 over the Part's exact text (label and leading comments
  included). Computed on demand.
- **Live code.** Per Part identity (and for the Preamble), the text as of the last successful Apply
  that had it in Scope. **Unapplied edits** = current text ≠ Live code, or the Part is absent from
  the Source but still has Live code (a deletion; it keeps sounding and shows as a ghost).
- **Transport:** `started`, `cps`. Cycle position is host machinery only.
- **Error slot:** one per Performance: `{message, phase: 'eval' | 'playback', part?}` or empty.
  *Default set by this spec:* a successful Apply clears it; a newer error replaces it.

## 5. Apply

One mechanism for the human and the agent ([ADR 0002](../../docs/adr/0002-scoped-composition-on-published-strudel.md), [ADR 0003](../../docs/adr/0003-agent-changes-land-by-autonomy-never-on-unapplied-text.md)).

1. **Compose:** walk the Source in order. The Preamble and each Part contribute their current text
   if in Scope, else their Live code; a Part with no Live code contributes nothing. Parts deleted
   from the Source but holding Live code are appended, unless Scope is every Part.
2. **Reset visuals:** synchronously, all four outputs to `solid(0,0,0,0).out(oN)`, `render(o0)`,
   `update`/`afterUpdate` cleared.
3. **Evaluate** the composition with `repl.evaluate`. Success is *not* the promise resolving:
   correlate `onEvalError` / `state.evalError` with the call. Muted Visual Parts' bodies are skipped
   by the `hydra` tag.
4. **On success:** in-Scope Parts' Live code := their text; if Scope was every Part, deleted Parts'
   Live code is dropped. On failure the previous Live code keeps playing and the error slot is set
   (`phase: 'eval'`, Part mapped via character offsets).

- **Human Apply:** Ctrl-Enter, Scope = every Part, immediate; starts the transport if stopped.
  Ctrl-. stops the transport.
- **Agent Apply** (Apply Autonomy, or Accept & play): Scope = the Parts the change touched.
  Agent-triggered Applies wait for the next cycle boundary (scheduled on `scheduler.now()`);
  Accept & play is human, so immediate. On a stopped transport it updates Live code and starts
  nothing. A queued Apply survives the Turn ending.
- **Mutex:** real evaluates and dry-runs are serialised.

## 6. The tool surface

Normative text: [ADR 0004](../../docs/adr/0004-one-tool-state-pushed-dry-run-gated.md) and its
visual amendment. Summary for the builder:

### 6.1 Snapshot (pushed with every Instruction)

```ts
type Snapshot = {
  source: string;                       // verbatim
  parts: Array<{
    part: string;                       // label identity, or "(preamble)"
    rev: string;
    unapplied: boolean;
    muted: boolean; soloed: boolean;
    surface: "audio" | "visual";
    outputs?: Array<"o0"|"o1"|"o2"|"o3">; // visual only, from its last dry-run
  }>;
  live: Record<string, string>;         // Live code of every Part whose `unapplied` is true
  transport: { started: boolean; cps: number };
  error: { message: string; phase: "eval" | "playback"; part?: string } | null;
  aim: string | null;                   // the Part the Instruction was asked at (Ctrl-K), or null for @all
};
```

### 6.2 The tool

```ts
change_parts({ changes: Array<{ part: string; rev: string | null; text: string }> })
// ok:    { ok: true, landed: "proposed" | "written" | "applied", warnings?: string[] }
// error: { ok: false, reason: "stale", part, rev, text }
//      | { ok: false, reason: "unapplied", part }
//      | { ok: false, reason: "invalid", message, part?, kind? }   // kind for visual Parts:
//                                                                   // syntax|name|argument|shader|parameter
//      | { ok: false, reason: "bad_request", message }
```

Declared with `strict: true` and `eager_input_streaming: true`; reached with `tool_choice: auto`
(forcing a tool returns 400 on the 5.5 models).

**Pipeline, in order, atomic:** validate shape (`bad_request`: unknown Part, label changed other
than mute/solo marks, `rev: null` on an existing name, duplicate Part in one request) → Rev check
(`stale`) → Unapplied check (`unapplied`) → dry-run (`invalid` or warnings) → land by Autonomy.
A Proposal re-runs the Rev and Unapplied checks at accept time; failing makes it Stale. A new
Proposal replaces the open one.

**Landing:** `rev: null` appends the new Part at the end of the Source. A write is one tagged CM
transaction (one undo step, cursor carried).

### 6.3 Dry-run

Evaluates the exact composition the resulting Apply would evaluate.

- **Audio step:** `transpiler` + a local copy of core's eval step; `hush/all/each/setcps/setCps/
  setcpm/setCpm/samples/evaluate` shadowed as no-op parameters (`hush` records a call → `invalid`);
  `Pattern.prototype.p` swapped for a collector and `.play` for a no-op, restored in `finally`;
  `stack()` the collected patterns and `query` (never `queryArc`) cycles 0–8 under a time cap
  (*default set by this spec: 250 ms*). Warn on control synonyms set twice in one chain
  (`size`/`roomsize`, `legato`/`clip`).
- **Visual step:** each Visual Part against a throwaway `hydra-synth` (`makeGlobal:false`,
  `autoLoop:false`, own small WebGL context, created once): strict GLSL generation, compile, probe
  parameter functions at cycles {0, .37, 1.5, 3.9} × helpers stubbed to 0, 1, 0.5. Warn on: no
  output written; hides another Part on an output (`glow hides viz on o0`); helper names a missing
  Part; `level('x')` with no `.analyze('x')` on `x`.
- **Accepted blind spots:** playback-time errors (unknown sounds, unprobed moments, real-GPU-only
  shader failures, links broken later). They reach the agent only via the next snapshot.

## 7. The agent loop

[ADR 0005](../../docs/adr/0005-poc-agent-loop-runs-in-the-browser.md), including its memory amendment.

- **`Model` service** (Effect `Layer`). In: snapshot + Instruction (+ in-Turn retry history). Out: a
  `Stream` of text deltas, partial `change_parts` input, and the final call. One implementation over
  `@anthropic-ai/sdk`; the SDK's `AbortController` is tied to a scope finalizer.
- **Configuration:** `claude-opus-5-5`, `effort: medium`, no fast mode, never changed mid-session.
  Fallback by configuration only: `claude-sonnet-5-5`, or the same model on Bedrock Mantle (base
  URL, model id, key). Nothing switches automatically.
- **Request shape — one fresh request per Instruction.**
  - Cached prefix, `cache_control` with 1-hour TTL on its last block: the tool definition, the
    system prompt (§7.1) and the grounding reference (§9), about 12.2K tokens.
  - One user message: the snapshot (JSON) and the Instruction.
  - Retries append the assistant's `tool_use` and the refusing `tool_result` to *this Turn's*
    messages only. When the Turn ends its transcript is discarded; nothing carries into the next
    Instruction. The agent learns what happened only from the next snapshot.
- **Turn endings:** landed (first `ok: true`; no further call), answered (the model ends without a
  tool call; the peek opens with its text), superseded (a new Instruction interrupts the fiber),
  stopped (Esc), timed out (60 s), out of retries (a 4th refusal), or model/network error. All shown
  in the status line; none undoes a landed change.

### 7.1 System prompt (fixed, cached)

States, briefly: the role (pair performer; code is the shared artifact); the Performance and
snapshot shape; the one tool and its rules (whole Parts, label unchanged except mute/solo, no
delete/rename, no `hush`, `setcps` allowed, at most one landed change, retry on `stale` with the
returned text, leave `unapplied` Parts alone); keep comments current with the code they describe;
the Instruction's aim is a hint, not a restriction; **write one short plain-text line saying what
you are about to do before calling the tool** (the status-line note); if no change is warranted,
answer in words without calling the tool.

## 8. Host glue for Hydra

About 40 lines replacing `@strudel/hydra` ([ADR 0002](../../docs/adr/0002-scoped-composition-on-published-strudel.md) amendment, [ticket 16](issues/16-visual-parts.md)).

- The fixed full-screen canvas behind the transparent editor; one live `hydra-synth` instance,
  `makeGlobal:false`.
- The `hydra` tag, registered into Strudel's eval scope: returns `silence`; runs its body (not
  transpiled) with only Hydra's names and the four helpers in scope; skips muted Parts; maps error
  positions back to Source offsets.
- **Helpers:** `cycle()` (Strudel cycle position, follows `setcps`); `pulse('part')` (1 on each onset
  of that Part's live pattern, decaying to 0); `value('part','ctl')` (the control's current value);
  `level('part')` (heard loudness 0..1 from `getAnalyzerData` of `.analyze('part')`). `pulse`/`value`
  read the pattern by label (collected by wrapping `Pattern.prototype.p` in `beforeEval`) and
  compensate the scheduler's ~100 ms lead. All four follow what is heard: a muted or soloed-out Part
  gives 0.
- The output reset before every evaluate (§5 step 2).
- **Playback-error attribution:** each Visual Part's parameter functions are wrapped; `gl.getError()`
  is checked after ticks; a failure goes to the error slot once (`phase: 'playback'`, with its Part),
  and a frozen output is blamed on the Part that last wrote it. Nothing is reverted.
- **Audio playback errors:** match the `strudel.log` DOM event against
  `/^\[(cyclist|query|getTrigger)\] error: /` into the error slot (`phase: 'playback'`).

## 9. Prompt-reference build step

A script (`pnpm build:reference`), not a runtime component. Its outputs are committed text files,
each with a header naming the exact versions it was generated from; **a check fails the build if
those versions differ from the lockfile.** Re-run whenever a pin moves.

1. **Strudel index (~10K tokens).** Check out `codeberg.org/uzu/strudel` at the commit that
   published `@strudel/core@1.2.6` / `@strudel/web@1.3.0` (2026-01-17/18); run `npm run jsdoc-json`
   → `doc.json`. Load the app's own `@strudel/web` bundle (browser-mode or Node with audio stubbed)
   and take the callable union `new Set([...Object.keys(module),
   ...Object.getOwnPropertyNames(Pattern.prototype)])`. Keep `doc.json` entries that pass
   autocomplete's filter (`name && !name.startsWith('_') && kind !== 'package'`) *and* are in the
   union; emit `name(params) [=synonyms] — first sentence of description`. Expect ≈514 entries.
   Method: [research 06](research/06-strudel-knowledge-grounding.md).
2. **`learn/strudel-vs-tidal.mdx`** from the same checkout, verbatim (~1.1K tokens).
3. **Do-not-use list**, a hand-kept file seeded with: `sidechain` → `duck`/`duckorbit` +
   `duckattack`/`duckdepth`; `whenmod` → Tidal-only, use `every`/`while`; set only one of
   `size`/`roomsize` and `legato`/`clip`. It grows from observed misses.
4. **Hydra index (~580 tokens).** Import `src/glsl/glsl-functions.js` from `hydra-synth@1.4.0`; emit
   `name(tex?, input=default, …)` grouped by type, then the runtime API list. Never from
   `hydra-functions/examples.js` (no licence). Method: `docs-coverage.mjs` on branch
   `research/15-hydra-knowledge-grounding`.
5. **"Hydra inside Strudel" note (~200 tokens, hand-written):** the Part shape
   ``label: hydra`…` ``; in scope are Hydra's names plus `cycle()`, `pulse(p)`, `value(p, ctl)`,
   `level(p)` with signatures, and nothing from Strudel or the Preamble; `level(p)` needs
   `.analyze('<p>')` on the audio Part; never `a`, `a.fft` or `H`; one output is shown (`render(o0)`),
   last `.out()` wins, and the hides-warning means you covered another Part.

## 10. Interaction model

Normative: [ADR 0007](../../docs/adr/0007-instructions-at-the-cursor-state-in-one-status-line.md) with its 17 amendment. Focus never leaves the editor unless the performer asks; every mouse control duplicates a key.

| Key | Action |
|---|---|
| Ctrl-Enter | Apply every Part (starts transport) |
| Ctrl-. | stop transport |
| Ctrl-K | Instruction input at cursor, aimed at the Part there (`@hats`); blank line/Preamble → `@all` |
| Tab (in input) | toggle aim `@part` ↔ `@all` |
| Enter / Esc (in input) | send / cancel; focus returns to the editor |
| Esc (editor) | stop the running Turn |
| Alt-A / Alt-P / Alt-R | accept / accept & play / reject the Proposal (Stale: dismiss only) |
| Alt-1 / 2 / 3 | Autonomy Propose / Write / Apply |
| Ctrl-J | toggle the peek (never takes focus) |
| Alt-H | all code → Part in focus only → no code → all |
| Shift-Alt-F | Format the whole Source: Layout only, one undo step (ADR 0008) |

- **While the agent works:** the tool input streams as a dashed block under its Part (new Parts at
  the end); an "agent at work" badge on the label line; the status line shows the note.
- **Proposal:** inline diff, old lines struck through, new text beneath. Hidden code reveals itself
  for a Proposal only, and only as far as the Part in focus.
- **Marks:** agent-written text tinted until the human edits that Part; a deleted Part still
  sounding shows as a struck-through ghost at the end.
- **Status line:** Autonomy; Turn state (thinking, writing, dry-running, landed, answered, stopped,
  timed out) and note; retry count (`↻2`); warnings; a waiting agent Apply ("plays at cycle 13");
  errors with their Part; transport (running/stopped, cycle, cps).
- **Over visuals:** the Part in focus (agent's target while a Turn runs or a Proposal is open, else
  the cursor's Part) sits on a solid full-width band; other lines on lighter boxes as wide as their
  text; agent widgets on solid panels. The canvas is never dimmed or blurred. A Visual Part's error
  is also a badge on its label line, or a corner chip when code is hidden.
- **Peek:** this session's Instructions and outcomes; opens itself on a word answer; offers the
  instrumentation JSON download (§11). It is for the human only.

**Façade** (plain TS): `instruct(text, part | null)`, `stop()`, `accept()`, `acceptAndPlay()`,
`reject()`, `setAutonomy(level)`, `apply()`, `stopTransport()`, `downloadLog()`. It publishes one
immutable view model: Parts (with unapplied/muted/soloed/surface/outputs), Autonomy, Turn state and
note, retry count, streamed draft, open Proposal (with Stale flag), waiting Apply, error slot,
transport, session Turns. Alt-H's view and agent-text marks are UI/editor state, outside it.

## 11. Instrumentation

In memory, downloadable as JSON from the peek. No dashboards.

1. **Per Turn:** timestamps for Enter, first streamed character, landed, heard (agent Apply's cycle
   boundary, reported separately); calls, retries, input/output/cache-read/cache-write tokens; how it
   ended.
2. **No-freeze monitor:** a `PerformanceObserver` on `longtask`, and a late-note count (a trigger
   whose scheduled audio time is already before `AudioContext.currentTime` when it reaches
   superdough). Each entry is marked with whether a Turn was running.
3. **Frame times** for the second after each Apply, with the number of Visual Parts.
4. **Sync estimate:** onset-to-flash from scheduler time vs `AudioContext.outputLatency` vs
   `requestAnimationFrame`, checked once by filming screen and speaker in slow motion.

## 12. Acceptance

Run on an ordinary laptop with an integrated GPU, in Chrome, at the default Autonomy unless stated,
each scenario at least 10 times across Propose, Write and Apply. Seed Performance for 1–3:

```js
samples('github:tidalcycles/dirt-samples')
setcps(0.5)
kick: s("bd*4")
hats: s("hh*8").gain(.6)
chords: note("<c3 eb3 g3 bb3>").s("sawtooth").lpf(800)
```

### 12.1 Vary what I have
Ctrl-K on `hats`, "make the hats busier and swing it". **Pass:** a change to `hats` only lands
(Proposal / write / scheduled Apply by Autonomy); after it is Applied the hats are audibly denser and
swung; `kick` and `chords` never drop out or restart; with the human mid-edit in `chords`
(Unapplied), the change still lands and `chords` keeps its Live code.

### 12.2 Add a part
"add a bassline that fits". **Pass:** a new labelled Part is appended (`rev: null`); it is in key
with `chords` and in time; the human's unrun Part elsewhere stays silent and untouched.

### 12.3 Get me unstuck
"make this more like dub techno". **Pass:** the change uses at least one function absent from the
seed (e.g. delay/room/`duckorbit`, filter movement) that exists in the runtime, and it evaluates
clean. The agent never calls a do-not-use name in a landed change.

### 12.4 Give me visuals for this
"give me visuals that pulse with the kick". **Pass:** the agent writes a new ``hydra`…` `` Part that
follows an audio Part through `pulse`, `value` or `level`; flashes land within ±40 ms of the audible
kick; *vary* ("make it glitchier") works on that Visual Part as in 12.1; the Proposal and streamed
draft stay readable over the busy-colour and white-strobe backdrops (17's prototype presets).

### 12.5 Budget (all scenarios)

| Measure | Target |
|---|---|
| Enter → landed (Proposal shown / written / scheduled), dry-run and retries included | ≤ 30 s for 9 of 10 Instructions |
| Turn timeout | 60 s |
| Refused retries | ≤ 3 (4 calls) |
| Main-thread job from agent machinery | none > 50 ms |
| Late notes while a Turn runs | 0 |
| Stutter on Apply, 4 Visual Parts | ≤ 1 dropped frame, never > 100 ms |
| Onset-to-flash | within ±40 ms |
| Esc → stream aborted, editor still, status "stopped" | ≤ 200 ms |

Breaking the no-freeze rows is a finding, not a build blocker; the noted remedy is moving the
dry-run into a worker. No fix is built in advance.

## 13. Verify first when building

Each is a small spike before the milestone that depends on it; none needs a new decision unless it
fails.

1. Wrapping `Pattern.prototype.p` in `beforeEval` collects label → pattern (read, not tested). *M4.*
2. String ids work in `.analyze('kick')` / `getAnalyzerData` (read in `superdough@1.2.6`). *M4.*
3. Opus 5.5 at `medium` returns the pre-tool note as visible `text`, not an empty `thinking` block.
   If not, move the note into an optional `note` field of `change_parts`. *M3.*
4. Strudel 1.2.6's solo label syntax, for the parser's `soloed`. *M1.*
5. A late-note hook exists on the trigger path of `@strudel/web@1.3.0`. *M3.*
6. Bedrock Mantle bearer-token auth from the browser, only before relying on it as the fallback.

## 14. Build sequence

Each milestone ends testable; the first playable point is the end of M1.

- **M0 — Scaffold.** Vite + Svelte + CM6, toolchain, pins, `define`, `.env.local`; façade with an
  empty view model; Node and browser Vitest projects.
- **M1 — The human can play (earliest playable point).** `@strudel/web` embedded; `Editor` service
  over CM; parser (Parts, Preamble, Revs, mute/solo, Surface); Live code store; Apply by composition;
  Ctrl-Enter / Ctrl-.; error slot with eval and `strudel.log` playback errors; status line with
  transport and errors. A human can live-code Strudel with no agent.
- **M2 — `change_parts` without a model.** Audio dry-run (browser-mode tests), the full pipeline and
  refusals, landing by Autonomy with agent-Apply quantisation, Proposal / Stale. Tested in Node
  against a fake `Model` that replays scripted tool calls.
- **M3 — The agent plays (scenarios 1–3).** Reference build step (§9, Strudel parts); `Model` over
  the SDK with streaming, caching, abort; the loop (fresh request, retries, timeout, endings);
  Ctrl-K input, streamed draft, inline diff, badges, tint, ghost, Alt keys, peek; per-Turn timing
  record and no-freeze monitor.
- **M4 — Visuals by hand.** Canvas, live hydra-synth, `hydra` tag, output reset, mute/solo per
  Surface, the four helpers, visual playback-error attribution. A human can code Hydra linked to
  audio.
- **M5 — The agent does visuals (scenario 4).** Visual dry-run step and warnings; `outputs` in the
  snapshot; Hydra index and note in the reference; Part-in-focus band, per-line boxes, solid widget
  panels, error badge/chip, Alt-H with Proposal auto-reveal; frame-time and sync instrumentation.
- **M6 — Judge.** Run §12 and download the logs.

## 15. What is left undecided

Nothing the build needs. The defaults this spec set itself (error-slot clearing, the 250 ms dry-run
cap, the `note` field fallback) are marked where they appear; change them freely. Everything else
not decided is **out of scope** of this map and listed there: memory across Instructions and a
reviewable conversation, more than one landed change per Instruction, a closing reply, queueing
Instructions, undo that reverts sound, sandboxing and moving the key off the page, and judging
whether the result is beautiful and enjoyable — the effort after this map.
