# 03 — What the agent can perceive of a running Performance

Type: research
Status: resolved
Blocked by: —

## Question

Taste needs a way to judge the result, and the POC agent only reads code (ADR 0001, POC ticket 03). What can the agent cheaply sense from a running Performance on our stack (`@strudel/web@1.3.0`, `hydra-synth@1.4.0`), and what can a model actually judge from each?

1. **Pattern events**: `queryArc` over the next N cycles, per Part (density, pitch range, rhythm), and its cost on the main thread under the no-freeze rule (POC ticket 10).
2. **Audio features**: what Strudel's `.analyze` / `getAnalyzerData` and a Web Audio analyser expose (loudness, spectrum, onsets), per Part or only as a mix, and what summarises them into a few numbers.
3. **Visual frames**: grabbing the Hydra canvas as an image, its cost, and how well Claude vision judges a frame or a short strip of frames.
4. **Audio to a model**: whether any candidate model (Claude, the deciders in 02) accepts audio directly, and at what latency and cost.
5. For each sense, the latency, the token cost, and an honest view of what judgements it supports (for example "too busy", "clashing keys", "static for too long", "visuals ignore the music").

## Answer

**A small set of senses, all computed by the host and sent as text (about 1K tokens) with each snapshot. No audio goes to any model.**

1. **A per-Part event digest** from `queryArc` over the next 8 cycles: onsets, pitches, density and key. This is the strongest sense and the only one available *before* a change lands, because the dry-run already holds the patterns of the proposed change.
   - Normal Parts cost 0.1–2 ms each. A dense Part (80 onsets per cycle) costs 14 ms.
   - So read one Part per task, at most 8 cycles, with a time cap.
2. **A loudness and spectrum digest** over the last 8 cycles, read at 4–5 Hz for about 0.6 ms per read.
   - **The mix:** an `AnalyserNode` on superdough's `destinationGain`, re-attached after `resetGlobalEffects`.
   - **Each Part:** only where its code calls `.analyze(id)`, which measures before the shared reverb and delay.
   - Offline rendering is not possible during a Performance, because `renderPatternAudio` closes the live AudioContext.
3. **Change markers:**
   - time since each Part changed;
   - how often its patterns repeat;
   - a motion-to-audio correlation from tiny frame grabs, which is what answers "visuals ignore the music".
4. **A 2×2 strip of Hydra frames**, about 450 Claude visual tokens, sent only when the agent works on visuals.
   - Grab it with `createImageBitmap` right after `hydra.tick()`, about 0.2 ms. The canvas doesn't keep its last frame, so a later grab comes back black.
   - Whether Claude can judge a VJ frame well enough is **untested**; a small eval is proposed.

**Audio input:** Claude doesn't take it. Gemini 3.8 Flash and OpenAI `gpt-audio-1.5` do, but neither claims musical judgement, the sound would be 10–20 s stale, and it would add a second provider. Rejected.

**Design conflict to carry forward:** judging a change by its sound or picture means waiting a few cycles after it lands, which ADR 0004's dry-run-only view currently rules out. Tickets 04 and 06 must revisit this.

Findings: `research/03-perception.md` on branch `research/03-perception`. **It is not pushed yet** (SSH key unavailable), so the branch is local only.
