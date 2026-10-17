# One tool, state pushed, every change dry-run

_Amended by ticket 16 (visual Parts): the snapshot, the dry-run and the error slot gain a Visual Surface. See the amendment at the end._

The agent has exactly one tool, `change_parts`. It never reads state through a tool. Instead, every
human instruction arrives with a fresh snapshot of the Performance. Every scenario starts by reading
the code, so a read tool would put an unavoidable round trip into every turn. There is also no
evaluate tool, no transport tool and no `queryArc`: evaluation is the dry-run built into
`change_parts`, the transport is two fields in the snapshot, and none of the three scenarios needs
the agent to see pattern events. A one-tool set also keeps the prompt cache stable, because adding
or removing tools invalidates it.

## The snapshot (pushed with each instruction)

- **Source**, verbatim.
- **Part index**, one entry per Part, the Preamble included:
  - `part`: the label, or `"(preamble)"`
  - `rev`: see below
  - `unapplied`: whether the Part holds Unapplied edits
  - `muted` / `soloed`: read from the label prefix
  - `surface`: `"audio"` today
- **Live code** of every Part whose `unapplied` is true, so the agent knows what is sounding and
  that the Part is off-limits.
- **Transport**: `started`, `cps`.
- **Error slot**: message and phase (`eval` | `playback`), or empty.

A **rev** is the first 8 hex characters of a SHA-256 of a Part's exact current text, its label and
leading comments included. It is computed from the Source whenever needed and never stored, which
keeps ADR 0001 intact. It is how a request states "the text I read" (ADR 0003) without echoing that
text: the check is the same, and the output tokens are far fewer. A human who edits a Part and types
it back exactly restores its rev, and a request against it rightly succeeds.

**Amended by ADR 0008:** the rev is now a SHA-256 of a Part's code, not its exact text, so a change
of Layout alone (a Format) keeps it.

## The tool

```ts
change_parts({
  changes: Array<{
    part: string;        // a Part's label, or "(preamble)"
    rev: string | null;  // the rev read in the snapshot; null creates a new Part
    text: string;        // the Part's whole new text, label line included
  }>
})
```

- **Whole-Part replacement**, never a patch.
- **New Parts** (`rev: null`) are appended to the Source.
- **Labels:** the label in `text` must equal `part`. Only its mute/solo prefix may change, so the
  agent can mute or solo but never rename.
- **No deletion.** An agent deletion would keep sounding until an Apply of every Part, which the
  agent can't trigger. None of the three scenarios needs it.
- **Where it lands:** the host lands the change by Autonomy (ADR 0003) and tells the agent which,
  which reveals its Autonomy but gives it no way to change it.

### Returns

```ts
| { ok: true, landed: "proposed" | "written" | "applied", warnings?: string[] }
| { ok: false, reason: "stale",       part, rev, text }     // changed since read: fresh text to retry with
| { ok: false, reason: "unapplied",   part }                // human's work in progress; their text is not quoted
| { ok: false, reason: "invalid",     message, part? }      // dry-run failed; part mapped via char offsets
| { ok: false, reason: "bad_request", message }             // unknown part, label changed, name taken, rev: null on existing
```

Every refusal is atomic, so nothing is written. A `stale` refusal carries the fresh text, which is
how the agent re-reads mid-turn without a read tool. An `unapplied` refusal omits the human's
half-typed text, so that the agent has nothing to work around.

**At most one landed change per instruction.** The first `ok: true` ends the agent's tool use for
that instruction, and refusals may be retried. At Propose, a second change would silently replace
the Proposal and lose the first, and one change can already touch many Parts. This holds for the
POC and is to be discussed again after it.

## The dry-run

It runs before every change, at every Autonomy. Only code that passes it lands.

- **What it evaluates:** the exact composition the resulting Apply would evaluate. That is every
  Part's Live code with the changed Parts substituted, plus the Preamble (ADR 0002). Parts use
  Preamble helpers, so validating a Part alone would lie.
- **Mechanism (from 04):**
  - Run `transpiler` plus a local copy of core's eval step.
  - Shadow `hush/all/each/setcps/setCps/setcpm/setCpm/samples/evaluate` as no-op parameters.
  - Swap `Pattern.prototype.p` for a collector and `.play` for a no-op, restoring both in `finally`.
  - `stack()` the collected patterns and call `query` (not `queryArc`, which swallows errors) over
    **cycles 0–8**, under a time cap.
  - Hold a mutex against real evaluates.
- **Refused as `invalid`:** evaluation errors, query-time errors, exceeding the time cap, and any
  call to `hush()`.
- **Warned, not refused:** registered control synonyms set twice in one chain (`size`/`roomsize`,
  `legato`/`clip`).
- **Blind spot, accepted:** playback-time errors (`s("nosuchsound")`). They reach the agent only
  through the error slot of the next snapshot, never as a delayed tool result. That respects "acts
  only when instructed" and adds no latency.
- **Surface-specific:** it is the one Surface-specific piece of the tool surface. Each Surface
  would bring its own dry-run; Strudel's and, since ticket 16, Hydra's are built.

## What the agent cannot do, and where that lives

The limits live in the tool and the dry-run, not in the UI:
- It cannot start or stop the transport. An agent Apply on a stopped transport updates Live code
  but starts no sound.
- It cannot `hush()`, delete, rename, or touch Parts holding Unapplied edits.
- It cannot read or set its Autonomy.
- It **may** change tempo with `setcps` in code, where the change is visible in the Source.

## Considered options

- **A read tool, alone or beside push.** Rejected. Every turn needs the state, and a `stale`
  refusal already covers a snapshot going stale mid-turn.
- **Echoing the full read text instead of a rev.** Rejected. It checks the same thing at roughly
  double the output tokens, and output tokens are the slowest part of a turn.
- **Patches or diffs as the change format.** Rejected as fragile to generate. Whole Parts are
  small.
- **A `queryArc` tool.** Deferred, not rejected. If a signal about events is ever wanted, the
  dry-run already queries every pattern and could return event counts per Part for free.
- **Waiting a cycle after an agent Apply to report playback errors.** Rejected. It works only at
  Apply Autonomy and costs more than a cycle of latency.

## Amendment: visual Parts (ticket 16)

**Snapshot.** `surface` is `"audio" | "visual"`. Each Visual Part's index entry adds `outputs`: the
Hydra outputs it writes (`["o0"]`), as reported by its last dry-run.

**Dry-run, second step.** After the Strudel step, Visual Parts run against a throwaway
`hydra-synth` instance (`makeGlobal:false`, `autoLoop:false`, its own small WebGL context, created
once per session). Its `.out()` generates the GLSL strictly, compiles it, and probes every
parameter function at cycles {0, .37, 1.5, 3.9} with `pulse`/`value`/`level` stubbed to 0, 1 and
0.5. About 1.3 ms per Part; the live canvas is never touched.

- **`invalid`** for a Visual Part adds `kind: "syntax" | "name" | "argument" | "shader" | "parameter"`.
  A `parameter` message names the failing probe (`at cycle 3.9, level=0: returned Infinity`).
  Hydra code in any shape other than a `hydra` template is `invalid` too.
- **Warned, not refused:**
  - the Part writes no output;
  - the Part hides another Part on an output (`glow hides viz on o0`): the last `.out()` in Source
    order wins, and nothing composites automatically;
  - a helper names a Part that doesn't exist;
  - `level('x')` is used where `x` has no `.analyze('x')`.
- **Blind spot, accepted:** a parameter that fails only at an unprobed moment, a shader that fails
  only on the real GPU, and a link broken later by a rename.

**Playback errors from Visual Parts.** The host wraps each Visual Part's parameter functions and
checks `gl.getError()` after ticks, so a failure is attributed to its Part. It is reported **once**,
not per frame, into the error slot with `phase: "playback"`, and reaches the agent only in the next
snapshot, like any playback error. A frozen output is an error of the Part that last wrote it. The
host never reverts a broken visual.

**Limits.** The agent's reach on the Visual Surface is the same as on Audio. Its visual change at
Apply Autonomy lands on the same cycle boundary as any agent Apply.

## Amendment: the autonomous agent observes after it acts (autonomous-agent ticket 04)

An agent that pursues a Brief has to judge its own changes, and a mix can't be judged before it is
heard. So the agent now observes a change **after it has played**, through later snapshots (the
digests of autonomous-agent ticket 03). It still has no read tool; the host still pushes the
state. "Acts only when instructed" no longer holds for the autonomous agent, which acts on its
own initiative.

- **Check before landing.** After a dry-run passes, the host reads the proposed patterns and
  applies Taste's measured Judgements (density, clash). No model is called.
- **A new refusal**, atomic like the others:
  `{ ok: false, reason: "taste", judgement, reading, threshold }`. The writer may retry, as with
  `invalid`.
- **Every change carries an Intent**, which the Verdict judges it against. Whether it becomes a
  `change_parts` argument is settled in the spec.
- **The Verdict comes after playing** and judges what is actually sounding. At Propose or Write
  Autonomy, it waits until the change has been Applied, whoever applies it.
