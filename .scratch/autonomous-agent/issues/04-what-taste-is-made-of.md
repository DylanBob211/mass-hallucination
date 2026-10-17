# 04 — What taste is made of

Type: grilling
Status: resolved
Blocked by: 03

## Question

"Taste" has to become concrete judgements the machine can act on. Which judgements does the agent make about the Performance and its own changes, for example fit with the Brief, variety against repetition, density, tension and release, the visuals following the music, and broken or unpleasant output? For each judgement: what perception from 03 it rests on, whether it is a **decider** call, the **writer critiquing**, or a cheap **heuristic**, and when it runs (before a change, after one, continuously). Settle the vocabulary in `CONTEXT.md` as it crystallises. Think like a DJ / VJ.

Inputs from 03: the senses are event digests (available before a change lands), loudness and spectrum digests, change markers, and an optional strip of frames. Judging a change *after* it lands means letting it play for a few cycles, which reopens ADR 0004's dry-run-only view. Settle that here or in 06.

## Answer

**Taste is eight Judgements that are swappable units in a `taste/` data folder. The loop makes two decider calls per change: "act now?", and a comparative Verdict after the change has played. Everything else is a cheap host measurement. The planned Section gates every move.**

- **The Judgements:**
  - **Broken**: always a heuristic. It overrides everything and is acted on at once.
  - **Brief fit**: a decider call, folded into the Verdict.
  - **Density**: a heuristic.
  - **Clash**: a heuristic, on key and rhythm from the event digests, and on frequency bands where Parts are `.analyze`d.
  - **Staleness**: a heuristic, measured relative to the Section.
  - **Energy**: a heuristic, a 0–1 reading from density, loudness and brightness.
  - **Coupling**: a heuristic, the motion-to-audio correlation.
  - **Verdict**: a decider call.
- **Each Judgement is a unit** that declares its senses, its mechanism (a named heuristic or a decider prompt), its timing and its output. Units are swapped through the `Policies` Layer, and their inputs and outputs go to the run record.
- **Comparative, not absolute.** The Verdict is a decider `choice` of `better | same | worse` plus a reason, comparing the digests from before and after against the change's **Intent** and the Brief. The writer never grades its own change. Absolute readings are host numbers, never model scores (02 found no calibration).
- **The loop:**
  1. **Listen**: cheap numbers at every phrase boundary; if Broken, skip to Write.
  2. **Act now?**: a decider call, respecting the Section's disposition.
  3. **Write**: the change plus its Intent.
  4. **Check before landing**: Density and Clash on the proposed events, heuristic only. Crossing a threshold refuses the change as `reason: "taste"` and the writer retries.
  5. **Land**: by Autonomy.
  6. **Breathe**: for a length ticket 06 sets.
  7. **Verdict**.
- **ADR 0004 is amended:** the agent observes after it acts, and `change_parts` gains the `taste` refusal. At Propose or Write Autonomy, the Verdict waits until the change has been Applied.
- **Sections gate every move.** The agent *plans* its Section (intro, build, drop and so on) as part of its plan from ticket 07, and Energy and Density check that the sound matches the plan. A mismatch is a reason to act. Each Section's disposition (a drop is held) gates step 2. The details come from ticket 12.
- **Energy is measured; the arc is planned.** Where Energy should go, and when, belongs to the agent's plan (ticket 07).
- **Visual taste** is only Broken plus Coupling. The strip of frames is context for the writer, never the basis of a Verdict, until an eval shows Claude can judge Hydra frames.
- **Aimless looping** is a heuristic over the journal of moves from ticket 07 (A→B→A, the same Part again and again).
- **Taste is data, apart from the machine (ADR 0009).** `taste/` holds `sections.yaml`, `judgements.yaml`, `loop.yaml`, `prompts/*.md` and the named `heuristics/`. It is edited between runs and recorded with each run. The states and transitions stay in one transition-table file in code.
- **Glossary:** Section, Taste, Judgement, Verdict, Intent and Broken are added to `CONTEXT.md`.
