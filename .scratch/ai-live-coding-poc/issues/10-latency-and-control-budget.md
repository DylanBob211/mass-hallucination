# 10 — Latency & control budget

Type: grilling
Status: open
Blocked by: 07, 09

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

## Deliverable

Stated numeric targets and a model recommendation, recorded for the spec.
