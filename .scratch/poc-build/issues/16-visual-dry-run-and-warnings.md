# 16: Visual dry-run and warnings

**What to build:** Agent changes to Visual Parts are gated like audio: a throwaway Hydra compiles and probes them before they land, refuses with a typed `kind`, and warns when one Part hides another. The snapshot reports each Visual Part's outputs. See [spec §6.1, §6.3 visual step](../../ai-live-coding-poc/spec.md), ADR 0004 visual amendment.

**Blocked by:** 07 (`change_parts` pipeline), 14 (Audio-linked helpers).

**Status:** ready-for-agent

- [x] A throwaway `hydra-synth` (`makeGlobal:false`, `autoLoop:false`, own small WebGL context, created once)
- [x] Per Visual Part: strict GLSL generation, compile, and parameter probes at cycles {0, .37, 1.5, 3.9} × helpers stubbed to 0, 1, 0.5; failures are `invalid` with `kind` syntax|name|argument|shader|parameter
- [x] Hydra in any shape other than a Visual Part is refused
- [x] Warnings: no output written; hides another Part on an output (`glow hides viz on o0`); helper names a missing Part; `level('x')` without `.analyze('x')`
- [x] `outputs` from the last dry-run in the snapshot and view model
- [x] Browser-mode tests for each `kind` and each warning

## Comments

**Implemented (2026-10-01).**

- **`src/facade/live/visualDryRun.ts`** holds the throwaway Hydra. It is `makeGlobal:false`, `autoLoop:false`, on an 8×8 canvas never added to the page. `StrudelLive` builds it on its first dry-run, rebuilds it if building failed, and disposes it with the layer.
  - **Strict `.out()`.** It replaces `out` on the throwaway's source prototype and draws nothing.
    - It checks the target is `o0`–`o3`.
    - It checks every argument in the chain against Hydra's declared input types, nested sources included. Floats must be finite numbers, arrays of them, functions or sources; vec4 inputs take a source or an output; `src` takes an output.
    - It generates the GLSL and compiles and links it with raw WebGL on the throwaway's context. The driver's first log line is kept, without the line number in the generated code.
    - It probes every parameter function in the chain at cycles {0, .37, 1.5, 3.9} × helpers {0, 1, 0.5}. A throw, a non-number or a non-finite number fails. The message names the call, the argument, the cycle and the helpers that probe called: `osc(): frequency, at cycle 0, level=0: returned Infinity`.
    - About 0.9 ms per Part in headless Chromium.
  - **Kinds.**
    - `syntax`: the body does not parse, `${…}`, or `hydra` anywhere but as a Visual Part's tag. The shape check is static and runs before the audio step, which would otherwise fail first with a vaguer message.
    - `name`: a ReferenceError or "is not a function".
    - `argument`: the strict checks, plus any other error the body throws (a fallback).
    - `shader`: compile or link fails. With finite numbers enforced, this is mostly custom GLSL from `setFunction`.
    - `parameter`: a probe fails.
  - **All Visual Parts are run,** muted and soloed-out ones included, so unmuting one never breaks. Only drawn Parts count for "hides".
  - **Warnings.**
    - "writes no output", placed at the Part.
    - `glow hides viz on o0`, with no place, since it names both Parts.
    - `pulse('snare') names no Part`.
    - `level('hats') hears nothing: hats has no .analyze('hats')`.
    - The last two are static, over string-literal Part names.
- **Core.**
  - `EvalError`, `Invalid` and the `invalid` result carry `kind`.
  - `Strudel.dryRun` returns `{ warnings, outputs }`, with outputs keyed by Part identity.
  - `LiveCodeStore` keeps the outputs keyed by the Part's exact text. A body sees only Hydra's names, so its outputs follow from its text alone; this also makes a Proposal's outputs show up only once its text is in the Source.
  - The snapshot and `PartView` show `outputs` for a Visual Part whose current text a dry-run has passed. The system prompt names the field.
- **Tests.**
  - `visualDryRun.browser.test.ts` covers each kind, each warning, outputs, and the live canvas left untouched.
  - The core tests cover `kind` through `change_parts`, outputs in the snapshot, and outputs in the view model.

Known limits (from review):

- **Ticket 14 is not built.** The dry-run stubs `cycle`/`pulse`/`value`/`level`, but the live tag's scope does not define them yet. Code using a helper passes the dry-run, then fails as a playback error on the live canvas. The helper warnings describe helpers that do not exist yet. Ticket 14 must land before scenario 4.
- **The fallback kind.** A body error that is neither a missing name nor a missing function is reported as `argument`, `null.x` included.
- **Unlabelled `hydra` in the Preamble is refused,** as this ticket says ("any shape other than a Visual Part"). Spec §4's "Unlabelled Hydra is Preamble" and the ADR's "any shape other than a `hydra` template" read looser. Live, such a template draws nothing.
- **The outputs map is never pruned.** It holds one entry per distinct Visual Part text dry-run in the session.
- **Probes pass `time = cycle`,** as if at 1 cps. Parameter functions that read Hydra's `time` are probed at those seconds, not at real playback times.

