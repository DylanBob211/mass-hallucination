# Typed decision APIs: what can fill the "decider" role

This is research for ticket `02-typed-decision-apis` of the autonomous-agent feature. The planned agent pursues an open-ended Brief. A state machine owns the flow. At each transition a fast, typed **decider** answers a small question: "act now?", "which state next?", "was that change better or worse?", "is this too busy?". Claude Opus 5.5 still writes the code. Decisions happen a few times per musical phrase, and a phrase lasts about 8–30 s.

The question: what can play the decider? Three candidates were surveyed:
- **TypeSafe's Jev**, a "System One Model".
- **OpenAI's offering.** It turns out to be the **Decisions API** (`POST /v1/decisions`, model `gpt-6-luna`), not plain Structured Outputs.
- **Claude structured outputs** on Haiku 5.5 and Sonnet 5.5.

**Method.** Claims come from first-party doc pages and vendor posts, fetched on 2026-10-16. Browser (CORS) claims come from **live `OPTIONS` preflights sent on 2026-10-16** with `Origin: http://localhost:5173`, from Italy (Cloudflare edge `FCO`). No request was sent with real credentials, so **no latency or calibration was measured here**; see [Unverified / open](#unverified--open). Community-forum reports are labelled as such and treated as anecdotes.

---

## TL;DR

- **"OpenAI has one too" is the Decisions API.** OpenAI announced it at Dev Day (2026-09-30) and released it as a public beta on 2026-10-06. Its shape is almost the same as Jev's: typed questions (`predicate` / `choice` / `score`) in, probability distributions out, and you pay for input tokens only. TechCrunch called it "OpenAI's Jev clone". Structured Outputs on the Responses API is OpenAI's general schema-constrained generation. It is the equivalent of Claude structured outputs, not a decision API.
- **Both specialists return probabilities. Claude does not.** Jev and Decisions return a full distribution over the options plus a `confidence` statistic computed from it. Claude structured outputs guarantee a schema-valid answer, but any confidence field is a number the model writes. The API offers no logprobs.
- **Neither specialist proves calibration in public.** Jev's blog says "Calibrated: higher confidence means higher accuracy", but its docs publish no calibration metrics and call `confidence` "one reasonable way to summarize a distribution". The Decisions docs make no calibration claim at all. A forum user's biased-coin test found the `choice` format overconfident (98% where 70% was expected) and sensitive to option order. Jev's own "jaggedness" page also lists option-order bias.
- **Latency doesn't decide this.** A phrase is 8–30 s. Every candidate answers well inside that budget, as long as the call is off the audio path and the state machine never blocks the music on it. Jev claims 70–500 ms. OpenAI claims "about 10x faster than the Responses API". Claude publishes only "Fastest" (Haiku) and "Fast" (Sonnet).
- **Cost doesn't decide it either, except for Sonnet.** At about 1.5 K input tokens per decision and ~960 decisions per hour, the hourly cost is about $0.06 for Jev, about $0.14 for Decisions, $0.16–0.30 for Haiku 5.5 and $3–6 for Sonnet 5.5. The Opus authoring calls cost more than any of these deciders.
- **Browser reach:** Anthropic and OpenAI both answer the `localhost` preflight with `Access-Control-Allow-Origin: *`. **TypeSafe rejects `http://localhost:5173` ("Disallowed CORS origin")** and allows only its own console origin. Using Jev from this app therefore needs a dev-server proxy.
- **Multimodal:** none of the three accepts audio. Audio has to arrive as numbers or words computed in the page.
  - **Claude** takes images (GA).
  - **Decisions** takes images as base64 data URLs only.
  - **Jev's** docs contradict each other on images. The Models page says "text input only". The Images page documents PNG/JPEG behind a `TypeSafe-Danger-Zone-Images: true` header and labels it "Dreamer-ready", not production.
  - Jev's docs also say **numbers are a weak spot.** "Jev is not a calculator", and numeric representations "underperform". Audio features should be turned into words in code first, whichever decider is used.
- **Availability risk:**
  - **Jev:** early access with a waitlist, and the vendor admits the price may be subsidized.
  - **Decisions:** public beta with a single model; GA is "expected in the coming weeks".
  - **Claude Haiku/Sonnet 5.5:** GA, with retirement not before Oct/Sep 2027.

**Recommendation:**
1. **Start with Claude Haiku 5.5 structured outputs behind our own `Decider` service.** It uses one vendor and one capped key (ADR 0005). It takes images, costs pennies per hour and is GA.
2. **Give the `Decider` interface Jev's and Decisions' shape** (Noul/Predicate, Choice, Score, with an optional distribution), so a specialist can be swapped in later.
3. **Don't add a decider vendor now.** The one thing a specialist adds is a probability distribution. That only matters once the state machine gates on confidence thresholds, and neither vendor has shown its probabilities are calibrated. Revisit with a small bake-off on recorded Performance states when one of those becomes true. Jev is first in line for that bake-off: it has the best latency and price claims, but it is waitlisted and needs a proxy.

---

## 1. TypeSafe Jev ("System One Models")

**Sources:**
- Launch post [typesafe.ai/blog/introducing-system-one-models-and-jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev). Its byline says 2026-09-15; its metadata says 2026-10-15.
- Docs: [docs.typesafe.ai](https://docs.typesafe.ai), [quickstart](https://docs.typesafe.ai/introduction/quickstart), [API reference](https://docs.typesafe.ai/api), [confidence](https://docs.typesafe.ai/confidence), [models](https://docs.typesafe.ai/models), [images](https://docs.typesafe.ai/images), [Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13), [JS SDK](https://docs.typesafe.ai/sdk/javascript).

**What it is.** The launch post calls Jev "a frontier-intelligence function call: unstructured state in, typed probabilistic decisions out". It "gives up string generation". The stated uses are classification, routing, scoring, extraction-by-choice, branching, and verifying LLM output.

### 1.1 API shape

- **Endpoint:** `POST https://api.typesafe.ai/v1/systemone`, with `Authorization: Bearer <key>` ([API](https://docs.typesafe.ai/api)).
- **Request body:** `{ model, state, questions }`.
  - `state` is a string, object or array, "text or JSON".
  - `questions` is a map from your own key to a question. All questions in a request are "evaluated in parallel and in isolation", and adding questions "barely changes the response time" ([docs home](https://docs.typesafe.ai)).
- **Question types:**

  | Type | Declared as | Answer |
  |---|---|---|
  | **Noul** (yes/no) | `type: "noul"`, `instructions`, optional `criteria: {true, false}` | `noul`: P(true), 0–1. No separate `confidence`. |
  | **Choice** | `type: "choice"`, `instructions`, `criteria`: map of option → description. **Max 255 options.** | `choice` (argmax), `probabilities` (map, sums to 1), `confidence` |
  | **Score** | `type: "score"`, `instructions`, `criteria`: ordered array of level descriptions. **2–10 levels.** | `score` (probability-weighted level, can fall between levels), `legend`, `probabilities`, `confidence` |
  | **Box** | locates something in an image | (image-only; "Dreamer-ready") |

- `instructions` and `criteria` accept nested JSON, so options can be small records ([advanced structure](https://docs.typesafe.ai/primitives/advanced)). There is **no free-form record output**. You build a record from several Choice, Score and Noul answers. The jaggedness page says generation is weak: "this will not work well and will be very slow".
- **Models:** `jev-1.13.0`, aliased as `jev-latest`, and `jev-1.14.0`, aliased as `jev-preview` (since 2026-10-14). "An alias moves when a new release ships", so pin a versioned ID ([models](https://docs.typesafe.ai/models)).
- **SDKs:** Python `typesafe-sdk` and JS/TS `@typesafe-ai/sdk`. The TS SDK infers answer types from the questions. Its docs say "Install the SDK (Node.js 22 or newer)" and don't say whether it runs in a browser ([quickstart](https://docs.typesafe.ai/introduction/quickstart), [JS SDK](https://docs.typesafe.ai/sdk/javascript)).

Example mapping for "is this too busy?":

```json
{ "model": "jev-1.13.0",
  "state": { "brief": "...", "parts": [{"name":"drums","density":"very dense"}, ...] },
  "questions": {
    "busy":  { "type": "score",  "instructions": "How busy is the arrangement for this Brief?",
               "criteria": ["sparse", "balanced", "busy", "cluttered"] },
    "act":   { "type": "noul",   "instructions": "Should the agent change something this phrase?" },
    "next":  { "type": "choice", "instructions": "Which state next?",
               "criteria": { "listen": "...", "vary": "...", "build": "...", "strip_back": "..." } } } }
```

### 1.2 Latency and cost

- **Latency (vendor claim):** "End-to-end response time is 70ms-500ms". The speed tests were "generally run from our laptops on the West Coast" (launch post). From Italy, add a transatlantic round trip. A single forum anecdote measured Jev's median turn at about 0.3 s ([OpenAI forum thread](https://community.openai.com/t/decisions-api-is-now-available-in-public-beta/1403877)).
- **Price:** **$0.042 per MTok of input; output is free** ([models](https://docs.typesafe.ai/models)). The launch post says the company "can't prove it isn't subsidized" and expects prices to go down. Images are billed as input tokens, but no formula for estimating image tokens has been published yet ([images](https://docs.typesafe.ai/images)).
- **Per decision:** a 1.5 K-token state costs ≈ **$0.00006**.

### 1.3 Calibration

- `probabilities` is a real distribution over the options.
- `confidence` is a **formula over that distribution**, not a separate model output ([confidence](https://docs.typesafe.ai/confidence)):
  - Choice: `(p_max − 1/n)/(1 − 1/n)`.
  - Noul: `|2p − 1|`.
  - Score: based on distance between levels.
- The docs call it "one reasonable way to summarize a distribution, not the only one". They also suggest the top probability or the ratio of the top two probabilities as alternatives.
- The launch post claims "Calibrated: higher confidence means higher accuracy". **No calibration metrics are published.** The docs advise: "Start with conservative thresholds, test with your own data".
- **Known weak spots** relevant here ([jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13)):
  - "Jev is not a calculator".
  - It "does not count reliably".
  - Numeric representations (hex, RGB, closeness of values) underperform.
  - Score levels "are weak in numerical calibration".
  - **Choice option order can sway answers.**
  - Accuracy drops as `state` fills with unrelated detail.

### 1.4 Browser reach

- **Live preflight from `http://localhost:5173`:** `HTTP 400 Disallowed CORS origin`. `http://127.0.0.1:5173` and `https://example.com` are rejected too.
- **`https://console.typesafe.ai`** gets `access-control-allow-origin: https://console.typesafe.ai`, so the API uses an origin allowlist.
- The docs never mention CORS.
- **Consequence:** the page can't call Jev directly. It needs a proxy, for example a Vite dev-server proxy that adds the `Authorization` header from a server-side env var. That happens to keep the key off the page, but it is a moving part that ADR 0005 avoided.

### 1.5 Availability risk

- **High.** Jev is early access ("bringing developers off the waitlist as quickly as we can").
  - The company is new, with a single product.
  - Releases are frequent (1.13 → 1.14 within weeks), and aliases move.
  - Long-context and image support sit behind "Danger-Zone" headers.
  - The vendor itself hedges on how long the price will last.
- Rate limits are set per organization and measured in tokens and requests per second ([models](https://docs.typesafe.ai/models)).

### 1.6 Multimodal state

- **Text/JSON:** yes. Numbers are allowed but weak (see 1.3), so convert them to words in code ("energy: high, rising").
- **Images:** contradictory.
  - [Models](https://docs.typesafe.ai/models) says both models "accept text input only".
  - [Images](https://docs.typesafe.ai/images) documents PNG/JPEG behind `TypeSafe-Danger-Zone-Images: true`, labelled "Dreamer-ready" ("formats, limits, and answers may change"). Its limits:
    - 280–1568 px per side.
    - Images outside the limits are rejected, not resized.
- **Audio:** no.

---

## 2. OpenAI: the Decisions API, not Structured Outputs

**Sources:**
- Guide [developers.openai.com/api/docs/guides/decisions](https://developers.openai.com/api/docs/guides/decisions).
- Voice guide [decisions-voice](https://developers.openai.com/api/docs/guides/decisions-voice).
- Model page [gpt-6-luna](https://developers.openai.com/api/docs/models/gpt-6-luna).
- [Pricing](https://developers.openai.com/api/docs/pricing).
- [Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs).
- Forum announcement and replies: [community.openai.com/t/…/1403877](https://community.openai.com/t/decisions-api-is-now-available-in-public-beta/1403877).
- Press context only: [TechCrunch, 2026-09-30](https://techcrunch.com/2026/09/30/openais-jev-clone-could-help-the-frontier-lab-stop-its-swarming-agents/).

**Which product.** OpenAI has two candidates:
- **The Decisions API** is the dedicated product. It is a decision/classification/scoring endpoint that returns probabilities, and it is the one comparable to Jev.
- **Structured Outputs** (`text.format: {type: "json_schema", strict: true}` on the Responses API) is schema-constrained *generation*. It is the analogue of Claude's `output_config.format`. The Decisions guide itself points there "for free-form structured output". If OpenAI were used as a generic LLM decider, `gpt-6-luna` with Structured Outputs is the option, at $0.10 in / $0.50 out per MTok. For that use it offers nothing Claude Haiku 5.5 doesn't.

The rest of this section covers the Decisions API.

### 2.1 API shape

- **Endpoint:** `POST /v1/decisions`, called as `client.decisions.create({...})` in `openai` JS ≥ 7.30.0.
- **Model:** **only `gpt-6-luna`.**
- **Request:**
  - `input`: a text string, or user messages mixing `input_text` and `input_image`.
  - `questions`: an array of `{ type, name, instructions, ... }`.
- **Question types:**

  | Type | Declared as | Answer |
  |---|---|---|
  | `predicate` | condition in `instructions` | `probability`, 0–1 |
  | `choice` | `choices: [{value, description}]` (no max documented) | `choice`, `probabilities: [{value, probability}]`, `confidence` |
  | `score` | `levels: [{label, description}]`, lowest → highest, 0-indexed | `score` (probability-weighted mean index), `probabilities`, `confidence` |

- Independent questions share one request. "Dependent decisions require separate requests."
- The code samples also handle a `refusal` answer type, which the guide doesn't document.
- **No record output.** As with Jev, a record is assembled from several answers.

### 2.2 Latency and cost

- **Latency:** "about 10x faster than the Responses API" (guide). No absolute figures are published.
- **Forum anecdotes:**
  - About 0.8 s with an image input on a ~3 Mbps link.
  - A median turn of about 1.6 s in multi-step use, against about 0.3 s for Jev in the same test.
- **Price:** **$0.10 per MTok of input.** There are no output, cache-read or cache-write charges (guide; forum announcement). Regional processing adds a premium, and long context costs more.
- **Per decision:** a 1.5 K-token input costs ≈ **$0.00015**.
- **No prompt caching discount**, so a large fixed preamble is paid in full on every call. A forum user flagged this as the reason classification can cost more here than on the Responses API.

### 2.3 Calibration

- The guide calls `probability` "the model's estimate". It doesn't define `confidence`, makes **no calibration claim**, and recommends setting thresholds from labelled examples.
- **Forum anecdote** (one user, a biased-coin test at 70% heads):
  - `predicate` matched about 70%.
  - **`choice` returned heads 98% of the time,** and changing the option order shifted the probabilities.
  - The user's verdict was to avoid `choice` for now.
- Another forum user, using a few hundred questions, saw about 3× more confident-wrong answers from Luna than from Jev on nuanced calls.

All of this is anecdotal, but it is the only calibration evidence in public for either specialist.

### 2.4 Browser reach

- **Live preflight** of `/v1/decisions` from `http://localhost:5173` returned `200` with `access-control-allow-origin: *` and `allow-headers: authorization,content-type`.
- The `openai` JS SDK runs in browsers only with `dangerouslyAllowBrowser: true` ([openai-node README](https://github.com/openai/openai-node)). That is the same posture as the Anthropic key in ADR 0005.
- Using it would need a **second capped key, from a second vendor**.

### 2.5 Availability risk

- **Medium.** "Public beta, and we expect to GA in the coming weeks."
- A single model backs it.
- It comes from a large vendor, with ZDR and data residency for eligible customers.
- Rate limits for Decisions are not documented.

### 2.6 Multimodal state

- **Text:** yes.
- **Images:** yes, but only as base64 data URLs. Hosted URLs and `file_id` are not supported.
- **Audio:** not directly. The voice guide feeds Decisions a **transcript** from GPT-Live over WebRTC.

---

## 3. Claude structured outputs: Haiku 5.5 and Sonnet 5.5

**Sources:**
- [Models overview](https://platform.claude.com/docs/en/about-claude/models/overview.md).
- [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs.md).
- [Vision](https://platform.claude.com/docs/en/build-with-claude/vision.md).
- The Claude API reference bundled with Claude Code (`claude-api` skill, cached 2026-10-06): Haiku 5.5 and Sonnet 5.5 migration notes and the structured-outputs concepts page.

### 3.1 API shape

- **Declaration:** set `output_config: { format: { type: "json_schema", schema } }` on `messages.create`. In TS, `client.messages.parse({ ..., output_config: { format: zodOutputFormat(Schema) } })` returns `parsed_output`. Alternatively, put `strict: true` on a tool.
- **Supported schema features:** objects, arrays, `enum` (strings, numbers, bools and nulls only), `const`, `anyOf`, `$ref`. So **enums, numeric scores and small records all work in one call.** This is the one thing the specialists can't do.
- **Constraints the API doesn't support:**
  - `minimum`/`maximum`, `minLength`, recursion.
  - `minItems` greater than 1.
  - More than 24 optional parameters or 16 union types per request.

  The TS SDK strips unsupported constraints from the schema and validates them on the client.
- **Enum casing isn't guaranteed.** "Compare enum values case-insensitively".
- **First use of a schema** pays a grammar-compilation delay. Compiled grammars are cached for 24 h from last use, so a fixed decider schema should be warmed once at session start.
- **Model specifics for a decider:**
  - **Haiku 5.5:**
    - It thinks by default, at effort `medium`.
    - `thinking: {type: "disabled"}` is accepted at `low`/`medium`/`high`.
    - `temperature`, `top_p` and `top_k` other than their defaults return a 400, so **there is no `temperature: 0`**. Use the schema and the prompt to get consistent answers.
    - Assistant prefill returns a 400.
    - Forced `tool_choice` is accepted, but `output_config.format` is the cleaner route.
  - **Sonnet 5.5:**
    - `{type: "disabled"}` returns a 400. To turn thinking off, send `thinking: {type: "between_tools"}` (effort ≤ `high`).
    - Forced `tool_choice` `any`/`tool` returns a 400, so use `output_config.format`.

Example decider schema (Zod):

```ts
const Decision = z.object({
  act_now: z.boolean(),
  next_state: z.enum(["listen", "vary", "build", "strip_back"]),
  busy: z.enum(["sparse", "balanced", "busy", "cluttered"]),
  verdict: z.enum(["better", "same", "worse"]),
  reason: z.string(), // short; asking for "step-by-step reasoning" risks a reasoning_extraction refusal
});
```

### 3.2 Latency and cost

- **Latency:** only relative labels are published: Haiku 5.5 "Fastest" and Sonnet 5.5 "Fast". "Actual latency depends on prompt length, output length, and thinking effort." For a decider, use Haiku 5.5 at effort `low` with thinking disabled, and keep `max_tokens` large enough for the JSON.
- **Price:**
  - **Haiku 5.5:** $0.10 / $0.50 per MTok in/out, for prompts ≤ 100 K tokens.
  - **Sonnet 5.5:** $2 / $10.
  - Prompt caching applies. Haiku cache reads cost 0.1× the input price, and the minimum cacheable prompt is 512 tokens. A fixed decider preamble (the Brief, the definitions) can be cached.
  - The Haiku 5.5 tokenizer produces about 30% more tokens than Haiku 4.5 for the same text.
- **Per decision:** 1.5 K input tokens plus 40–300 output tokens (the upper end if thinking stays on).
  - Haiku 5.5: ≈ **$0.00017–0.0003**.
  - Sonnet 5.5: ≈ **$0.0034–0.006**.

### 3.3 Calibration

- **No probabilities or logprobs are returned.** The structured-outputs page mentions "confidence" only as a field the user defines in the schema.
- A `confidence` number written by the model is a verbal self-estimate, not a distribution. Anthropic makes no calibration claim for it.
- Ways to approximate a distribution:
  - Sample N times and count. This multiplies cost and latency, and it can't be steered with temperature.
  - Ask for a probability per option as a schema field. That is still a verbal estimate.

### 3.4 Browser reach

- **Already proven in this repo.** The live preflight from `localhost` returned `access-control-allow-origin: *` and allowed `anthropic-dangerous-direct-browser-access`.
- The SDK needs `dangerouslyAllowBrowser` (ADR 0005).
- **It uses the same key and spend limit as the coding agent,** so there is no new vendor.

### 3.5 Availability risk

- **Low.** Both models are GA.
- Retirement is "not sooner than" 2027-10-07 for Haiku 5.5 and 2027-09-28 for Sonnet 5.5.
- They are also served on Bedrock, Google Cloud and Foundry, which fits ADR 0005's failover seam.
- New on Haiku 5.5: safety classifiers can return `stop_reason: "refusal"`, and Haiku has no server-side fallback. The decider has to treat a refusal as "no decision".

### 3.6 Multimodal state

- **Text/JSON:** yes. Claude handles numbers in JSON better than Jev claims to, but turning audio features into words is still good practice.
- **Images:** yes, GA. JPEG, PNG, GIF and WebP are accepted, and large images are downscaled rather than rejected. An image costs `⌈w/28⌉ × ⌈h/28⌉` tokens, so a 512×288 thumbnail of the Hydra canvas costs about 209 tokens (≈ $0.00002 on Haiku). That makes "is the visual too busy?" and before/after "better or worse?" comparisons cheap to ask.
- **Audio:** no.

---

## 4. Comparison

Per-decision cost assumes ~1.5 K input tokens. "Per hour" assumes ~4 decisions per 15 s phrase, ≈ 960 per hour.

| | **TypeSafe Jev** | **OpenAI Decisions** (`gpt-6-luna`) | **Claude Haiku 5.5** (structured outputs) | **Claude Sonnet 5.5** (structured outputs) |
|---|---|---|---|---|
| Output declared as | Typed questions: Noul / Choice (≤255) / Score (2–10) / Box | Typed questions: predicate / choice / score | JSON Schema / Zod: enums, numbers, bools, small records | same as Haiku |
| Records in one answer | No (compose several questions) | No (compose several questions) | **Yes** | **Yes** |
| Probabilities returned | **Yes**: full distribution + `confidence` formula | **Yes**: full distribution + `confidence` | No (self-reported only) | No (self-reported only) |
| Calibration evidence | Claimed, no metrics; option-order bias admitted | No claim; forum: `choice` overconfident, order-sensitive | None (no probabilities) | None |
| Latency | 70–500 ms (vendor, US West) | "~10× faster than Responses"; forum 0.8–1.6 s | "Fastest" (no figure) | "Fast" (no figure) |
| Price | $0.042/MTok in, output free | $0.10/MTok in, output free, no caching | $0.10 in / $0.50 out, caching | $2 in / $10 out, caching |
| ≈ per decision / per hour | $0.00006 / $0.06 | $0.00015 / $0.14 | $0.0002–0.0003 / $0.16–0.30 | $0.003–0.006 / $3–6 |
| Browser (CORS from localhost) | **Rejected** (origin allowlist), needs proxy | Allowed (`*`), `dangerouslyAllowBrowser` | Allowed (`*`), already in use | Allowed, already in use |
| Key | New vendor key | New vendor key | **Same key as the agent** | **Same key** |
| Images | Contradictory docs; "Dreamer-ready" behind header | Yes (base64 only) | **Yes, GA** | **Yes, GA** |
| Audio | No | No (transcripts via GPT-Live) | No | No |
| Numbers in state | Documented weak spot | Not documented | Fine | Fine |
| Availability | Early access / waitlist; prices may be subsidized; aliases move | Public beta; one model; GA "coming weeks" | GA; retire ≥ 2027-10-07 | GA; retire ≥ 2027-09-28 |

---

## 5. Recommendation

1. **Build the decider as our own `Decider` service** (an Effect `Layer`, like `Model` in ADR 0005). Its vocabulary copies the specialists' three primitives:
   - **yes/no** (Noul/predicate).
   - **pick one** (Choice).
   - **rate on ordered levels** (Score).

   Each answer carries an **optional** distribution. The state machine reads answers in those terms, so it never learns which vendor answered.
2. **First implementation: Claude Haiku 5.5 with `output_config.format`.** Use effort `low`, thinking disabled, a cached fixed preamble (the Brief and the state definitions), and the schema warmed at session start.
   - Ask all of a transition's questions in **one** call, as one small record. This is something the specialists can't do.
   - Send audio features as words computed in the page, plus an optional small canvas thumbnail.
   - Treat `refusal` and timeouts as "no decision" (keep the current state).
3. **Use Sonnet 5.5 only for the evaluative question ("was that change better or worse?"), and only if Haiku proves weak on it.** It costs about 20× as much, but still only a few dollars an hour at this rate.
4. **A separate decider vendor isn't worth it yet.**
   - Latency and cost are both far inside the budget with Haiku.
   - A specialist adds a second key and spend limit.
     - For Jev, it also adds a proxy, a waitlist, a moving price and text-only (or "Dreamer-ready") state.
     - For Decisions, it also adds a beta API with one model.
   - Its one real advantage is a probability distribution, and neither vendor has shown that distribution to be calibrated.
5. **When to revisit:**
   - The state machine starts gating on confidence thresholds.
   - Or decisions must happen many times per second.
   - Or Haiku's answers prove noisy on recorded states.

   Then run a bake-off on a few hundred recorded transition states, labelled by the human: Haiku (point answer, or N samples) against Jev against Decisions. **Prefer predicate/Noul questions** for any thresholded gate (the forum coin test and Jev's own docs both point at Choice order bias). Jev is the first specialist to try, for its price and latency, once off the waitlist and behind a dev proxy.

---

## Unverified / open

- **No live latency was measured** for any candidate. All figures are vendor claims or forum anecdotes. A one-hour spike, timing ~50 calls per candidate from Italy, would settle it. It needs the human's keys and approval.
- **Calibration is unmeasured** for all three. The only evidence is one forum user's coin test and one forum user's few-hundred-question comparison.
- **Can `@typesafe-ai/sdk` run in a browser bundle at all?** The docs say Node 22+ and mention `node:` modules in examples. The CORS rejection makes it moot without a proxy.
- **Jev image support:** the Models page ("text only") contradicts the Images page. Ask TypeSafe.
- **Decisions rate limits** and pricing after GA are unpublished. The Decisions rows are absent from the general pricing page; the price comes from the guide and the forum announcement.
- **Haiku 5.5 with thinking disabled at effort `low`:** the decision quality of this setting is untested. The migration notes warn that, with thinking off, JSON output plus tools can skip a tool call. That doesn't apply to a tool-less decider call.
- The OpenAI `POST` probe without a key returned an unexpected `invalid_agent_instance_assertion` 401, probably an artifact of this sandbox's network. Only the preflight result is relied on.
