# 10 — Latency & control budget

Type: grilling
Status: resolved
Blocked by: 07, 09, 14, 16

## Question

The brief requires the interaction to feel "fast and controlled enough to judge whether pursuing the full autonomous-performer vision is worthwhile". Make that measurable, because it is the POC's own pass/fail line.

- What is the **acceptable latency** from pressing enter to hearing the change? State it as a number. Is the meaningful unit seconds, or musical bars at performance tempo?
- Which **model** — weigh a faster model against one that writes better Strudel. Does the answer differ per scenario (a small in-place variation vs. writing a whole new part)?
- Does **streaming** help here, or is a partially-streamed Strudel edit useless until complete? If useless, what should the human see during the wait?
- Does anything need to be **quantised to the music** rather than applied when it happens to arrive (ties to 04)?
- What is the **cheapest measurement** that settles this in the built POC — and what does the spec have to instrument for that measurement to be possible?

## Carried in from 04

- **Quantisation is decided**: agent-triggered Applies wait for the next cycle boundary (up to one full cycle, 2 s at cps 0.5); human-triggered ones are immediate. Budget that wait as part of the latency.
- **Every agent request adds a dry-run** before it lands (transpile + eval + a one-cycle query), plus the Preamble's `samples()` map re-fetch if the dry-run doesn't stub it. It is expected to be small, but it needs measuring.
- At Propose (the default), "enter to hearing it" includes the human's review, so the measurable agent latency is **enter to Proposal shown**.

## Carried in from 07

- **The normal case is one streamed model call per Instruction.** The Turn ends on the first `ok: true`, with no closing call. Each refused retry (`stale`, `invalid`) adds one call.
- The call is browser-direct, so no transport hop is added.
- The agent's explanation streams *before* the tool call. The ghost preview needs per-tool `eager_input_streaming`, which the hand-wrapped SDK can set.
- A new Instruction interrupts the running Turn. How long interruption takes is part of the "control" half of the budget.

## Carried in from 09

[09](09-instruction-and-agent-state-ux.md) / [ADR 0007](../../../docs/adr/0007-instructions-at-the-cursor-state-in-one-status-line.md):
- **Streaming is decided as the wait's UI**: the tool input streams into the editor under its Part, and the model's one-line note shows in the status line first. So "useless until complete" is not a concern for what the human sees, but **time to first streamed character** becomes a latency to budget alongside time to landing.
- **Esc stops a Turn**, and a new Instruction supersedes it. Stop-to-quiet is the "control" number.
- Retries show only as a count, so each one is felt purely as added latency.

## Carried in from 14

[14](14-hydra-in-published-strudel.md): a Hydra swap lands on the **next animation frame**, unquantised, with no black frame. The first frame after a swap can stall about 28 ms (software renderer; measure it on real hardware). The visual dry-run costs about 1.3 ms per Part. Whether an agent's *visual* Apply waits for the cycle is 16's to decide. Budget it once decided.

## Carried in from 16

[16](16-visual-parts.md):
- **Visual Applies are not quantised separately.** An agent Apply lands on the cycle boundary for both Surfaces together, so budget one wait, not two.
- **Every Apply recompiles every visual shader.** Each Visual Part's Live code re-runs, so the first-frame stall (about 28 ms on SwiftShader) happens on *every* Apply, audio-only ones included. The human's requirement: **the picture keeps flowing; a small stutter is tolerated.** Measure the stall on a real GPU with several Visual Parts and state the tolerated number.
- **The dry-run has a second step for visual Parts**, about 1.3 ms per Part times the probe grid (4 cycles × 3 helper stubs). Measure it.
- **`pulse`/`value` compensate Strudel's ~100 ms scheduler lead**, which was inferred and not measured. Measure onset-to-flash against the audible kick; that is the audiovisual half of "controlled".

## Deliverable

Stated numeric targets and a model recommendation, recorded for the spec.

## Answer

**The pass/fail line isn't agent speed, it's not disturbing the Performance.** The music keeps playing while the agent works, so a slow Turn only costs waiting. The human said: "I don't really care if the agent takes a while, unless it's really a lot." The budget therefore has loose limits on the Turn and strict rules on everything that shares the page with the Performance.

### Turn limits (seconds, not bars)

- The clock runs from Enter until the change **lands**: Proposal shown (Propose), written (Write) or scheduled (Apply). The dry-run and retries count. At Apply, the wait for the cycle boundary (≤ 1 cycle, [04](04-apply-semantics.md)) is **reported separately** and not counted against the agent. It is musical by design and set through cps.
- **Limit: landed within 30 s for 9 Instructions out of 10.** No median target and no target for the first streamed character. 09's immediate "sent/thinking" status line covers the wait.
- **Timeout: a Turn is ended at 60 s** with an error in the status line.
- **Retry cap: at most 3 refused retries (4 calls).** The Turn then ends and shows its last refusal. This fits within the timeout.

### No-freeze rule (the hard rule)

The agent's work must **never cause an audible glitch**. The loop runs in the page ([07](07-agent-runtime-trust-boundary.md)), so showing the stream, the dry-run and the visual probes all share the main thread with Strudel's scheduler (~100 ms lookahead, [01](01-strudel-programmatic-surface.md)) and Hydra's render loop. Made checkable:

- No single main-thread job from agent machinery lasts longer than **50 ms**, the browser's long-task threshold.
- **Zero late notes** while a Turn is running.

The POC builds **no fix in advance**. Breaking the rule is a finding. The noted remedy for later is moving the dry-run (and similar work) into a **worker**. Breaking the work into smaller steps was considered and dropped as too much for the POC.

### Visual numbers (from [14](14-hydra-in-published-strudel.md) / [16](16-visual-parts.md))

Measured on an ordinary integrated laptop GPU with 4 Visual Parts, not SwiftShader:

- **Stutter on Apply** (every Apply recompiles every visual shader): target ≤ 1 dropped frame, **limit ≤ 100 ms freeze**.
- **Sync:** a flash from `pulse`/`value` lands within **±40 ms** of the audible onset. This is the lip-sync tolerance from broadcast standards; a late picture is the failure to watch for.

### Control

- **Esc: stop-to-quiet ≤ 200 ms.** The stream is aborted, the editor stops changing, and the status line says "stopped". Anything already landed stays; undo belongs to the editor.
- A new Instruction replaces the running Turn with no extra cost. Its own clock starts at its own Enter.

### Quantisation

Nothing new. Agent Applies wait for the next cycle boundary for audio and visuals together ([04](04-apply-semantics.md), [16](16-visual-parts.md)). Human Applies, including Accept & play, happen immediately.

### Streaming

Settled by [09](09-instruction-and-agent-state-ux.md): the wait is shown by streaming into the editor. Streaming carries no latency target.

### Model and cache

Current-model facts checked 2026-09-29 against platform.claude.com. No TTFT or tokens/sec figures are published for any model.

| | Input / output $/MTok | Effort | Docs' latency label |
|---|---|---|---|
| Fable 5.1 | 10 / 50 | all 5 | slower |
| Opus 5.5 | 4 / 20 | all 5, default `medium` | moderate |
| Sonnet 5.5 | 2 / 10 | all 5 | fast |
| Haiku 4.5 | 1 / 5 | none | fastest |

- **Opus 5.5 at `medium` effort for every scenario.** No fast mode, and no effort changes during a session, since changing top-level effort throws away the cache. With speed relaxed, Strudel and Hydra quality decides, and a Turn costs cents on any of these models.
- **Recorded fallback: Sonnet 5.5**, if Opus is too slow in practice. It is a new configuration of the one `Model` implementation ([ADR 0005](../../../docs/adr/0005-poc-agent-loop-runs-in-the-browser.md)).
- **Haiku 4.5 rejected**: it may be retired from 15 October 2026 and has no effort setting.
- **Fable 5.1 rejected**: it is the slowest and costs 2.5× Opus 5.5.
- **1-hour cache** on the fixed prefix (tool, system prompt, ~12.2K grounding from [06](06-strudel-knowledge-grounding.md) and [15](15-hydra-knowledge-grounding.md)). A jam often goes more than 5 minutes between Instructions. The 1-hour write costs 2× input once, about $0.10 on Opus 5.5, and each read (about $0.002) restarts the timer. The per-Instruction snapshot comes after that fixed part and isn't cached.

### What the spec must include so the numbers can be checked

All kept in memory, with no dashboards, and downloadable as JSON from the Ctrl-J peek:

1. **A timing record for each Turn:** timestamps for Enter, first streamed character, landed and heard (at Apply), plus retries, calls, input/output/cache-read/cache-write tokens and the reason the Turn ended.
2. **A no-freeze monitor:** a `PerformanceObserver` on long tasks, and a count of late notes from the scheduler. Each entry is marked with whether a Turn was running.
3. **Frame times** for the second after each Apply, with the number of Visual Parts.
4. **Sync:** onset-to-flash estimated from the app's own timestamps (scheduler time vs `AudioContext` output latency vs `requestAnimationFrame`), checked once by filming the screen and speaker in slow motion on a phone.

### Handed to the spec (11)

- On Opus 5.5 and Sonnet 5.5, text written between tool calls comes back as `thinking` blocks, empty by default. The build must check that 09's one-line note before the tool call still arrives as visible text.
- `tool_choice` forcing a tool returns a 400 on the 5.5 models. The single `change_parts` tool is reached with `auto`, `strict: true` and a prompt instruction.

### Glossary

**Turn** gains three endings: the human stops it, it times out, or it runs out of retries.
