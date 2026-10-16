# 02 — Typed decision APIs

Type: research
Status: resolved
Blocked by: —

## Question

The hypothesis is that a fast, typed **decider** answers the agent's small questions ("act now?", "next state?", "better or worse than before?") while Claude writes code. What can fill the decider role?

Survey at least **TypeSafe's Jev** (https://typesafe.ai/blog/introducing-system-one-models-and-jev), **OpenAI's offering** (identify the right product: Structured Outputs, a dedicated decision or classification API, or something else), and **Claude structured output** from Haiku 5.5 and Sonnet 5.5. For each:

1. API shape: how outputs are declared, and whether they can be enums, scores or small records.
2. **Latency** and **cost** per decision, against a budget of a few decisions per musical phrase.
3. **Calibration**: whether probabilities or confidences come back, and how trustworthy they are.
4. Whether it is **reachable from the browser** (CORS, keys) under ADR 0005's localhost-only rule.
5. Availability risk: early access, waitlists, pricing stability.
6. Whether it can take **multimodal state** (audio features, an image of the visuals) or only text.

## Answer

**Start with Claude Haiku 5.5 structured outputs as the decider, behind our own `Decider` service; no separate decider vendor yet.** Latency and cost don't separate the candidates: with phrases of 8–30 s every one fits the budget.

- **The `Decider` service** uses the specialists' three question shapes (predicate, choice, score), with an optional probability per option so a vendor can be swapped in later.
- **OpenAI's product is the Decisions API**: `POST /v1/decisions` on `gpt-6-luna`, in public beta since 2026-10-06. It is almost Jev's shape, at $0.10 per million input tokens with output free, and it takes images.
- **Jev** is the cheapest at $0.042 per million input tokens, but it carries three risks:
  - it is early access and the vendor says its price may be subsidized;
  - its own docs call numbers a weak spot and say option order sways answers;
  - **it rejects `localhost` CORS origins**, so the app would need a dev proxy.
- **Claude has no real probabilities**: any confidence it reports is text the model writes. Haiku 5.5 also rejects `temperature`.
- **Calibration is unproven for every candidate**, and **none takes audio**, so the page must summarise audio into numbers and words.
- **Rough cost per hour** at about 960 decisions: Jev $0.06, Decisions $0.14, Haiku $0.16–0.30, Sonnet $3–6.
- **Sonnet 5.5** is only for "was that change better or worse?", and only if Haiku proves weak there.
- **A bake-off** of Haiku, Jev and Decisions on recorded states is worth running once the machine needs confidence thresholds.
- **Nothing was measured with live keys.**

Findings: [research/02-typed-decision-apis.md](../research/02-typed-decision-apis.md) on branch `research/02-typed-decision-apis` (pushed, never merged).
