# Model-provider seam: Effect AI vs a hand-wrapped Anthropic SDK, and failover targets

This is research for issue `13-model-provider-seam`. It answers four questions. Can `@effect/ai` / `@effect/ai-anthropic` carry the features the design already uses? What does a hand-written Effect wrapper over `@anthropic-ai/sdk` look like? Which failover targets change the least? How does the Vercel AI SDK compare?

Whether failover is worth building is out of scope.

**Method.** Package claims come from the **published npm tarballs**, fetched with `npm pack` and read as source. Docs claims come from first-party doc pages. Browser (CORS) claims come from **live `OPTIONS` preflights sent on 2026-09-28** with `Origin: http://localhost:5173`. Nothing was sent with real credentials, so no end-to-end model call was made; see [Unverified / open](#c-unverified--open).

## Sources and versions read

| Package / source | Version | Notes |
|---|---|---|
| `effect` | **3.22.2** (`latest`, 2026-09-09); `4.0.0-rc.118` (`rc`, 2026-09-28) | Effect 4 is **not stable yet**. The `Effect-TS/effect` `main` branch is now v4. v3 lives on the `v3` branch. |
| `@effect/ai` | 0.37.0 (2026-07-13) | v3 line. Pre-1.0. |
| `@effect/ai-anthropic` | 0.27.0 (v3); 4.0.0-rc.118 (v4) | peer deps: v3 `effect ^3.22`, `@effect/platform ^0.97`; v4 `effect ^4.0.0-rc.118` only |
| `@effect/ai-openai` / `-google` / `-amazon-bedrock` / `-openrouter` | 0.41.0 / 0.16.0 / 0.17.0 / 0.12.0 | v3 line |
| `@anthropic-ai/sdk` | 0.129.0 | |
| `@anthropic-ai/bedrock-sdk` / `@anthropic-ai/vertex-sdk` | 0.34.0 / 0.20.0 | |
| `@ai-sdk/anthropic` / `ai` | 4.0.67 / 7.0.120 | |
| `@google/genai` / `openai` | 2.24.0 / 7.23.0 | |

Short link forms used below:
- `unpkg:<pkg>@<ver>/<path>` means `https://unpkg.com/<pkg>@<ver>/<path>`.
- EAv3 = `@effect/ai-anthropic@0.27.0`.
- EAv4 = `@effect/ai-anthropic@4.0.0-rc.118`.

---

## TL;DR

- **Effect AI covers most of the design, but not per-tool `eager_input_streaming`, in either v3 or v4.** Both provider versions build user tools as `{name, description, input_schema}` (plus `strict` in v4) and nothing else. So there is also no per-tool `cache_control`.
  - Everything else is there. `cache_control` works on system, user, tool-result and file parts, and on assistant parts in v3 only. `input_json_delta` surfaces as `tool-params-delta`. `pause_turn` maps to finish reason `"pause"`. `tool_choice` is supported. `apiUrl` and `transformClient` let you set the browser header or re-route.
  - Workarounds for the missing field:
    - Send the legacy `fine-grained-tool-streaming-2025-05-14` beta header through `transformClient`. The Anthropic docs say this turns eager streaming on for every tool that leaves the field unset.
    - Or rewrite the JSON body in `transformClient`.
- **Stability:** `@effect/ai` is 0.x, with 18 minor (breaking under 0.x semver) releases between Jun 2025 and Jul 2026.
  - Effect 4 moves the core AI modules into `effect/ai/*` and HTTP into `effect/http/*`.
  - The v4 provider packages are only `anthropic`, `openai`, `openai-compat` and `openrouter`. **Google and Bedrock have no v4 package yet.**
  - v4 is still an RC.
- **The cheapest failover is the same Claude model through Claude in Amazon Bedrock (the new "Mantle" Messages endpoint).**
  - It uses the same request body as the first-party API, fine-grained tool streaming and prompt caching are documented as supported, and it runs on AWS-operated infrastructure.
  - Its CORS preflight allows `*`, and a short-term Bedrock bearer token goes in `x-api-key`. So in principle only `baseURL`, key and model id change, and it is browser-reachable.
  - Vertex is next: the body needs a small reshape and it needs a Google OAuth access token.
  - OpenRouter is the easiest multi-provider hop, but it does not document `eager_input_streaming`, and its `/api/v1/messages` CORS rejects the `anthropic-version` header.
- **A different model family** (Gemini, OpenAI) means a different wire format. The Gemini API (not Vertex) sends whole function calls with no partial arguments. Prompt caching there is implicit or prefix-based, with no `cache_control` equivalent.
- **Vercel `@ai-sdk/anthropic` 4.0.67 does pass both through.** It sets `eager_input_streaming` (on by default via `toolStreaming`, and per tool) and `cache_control` on tools and messages. It maps `pause_turn`. It does **not** add the browser header by itself.

---

## 1. `@effect/ai` + `@effect/ai-anthropic`

### 1.1 Feature by feature (source-verified)

**`cache_control` breakpoints**
- **v3.** Provider options `anthropic.cacheControl` (type `{type:"ephemeral", ttl?: "5m"|"1h"}`) are declared on these types:
  - message types: `SystemMessageOptions`, `UserMessageOptions`, `AssistantMessageOptions`, `ToolMessageOptions`
  - part types: `TextPart`, `ReasoningPart`, `FilePart`, `ToolCallPart`, `ToolResultPart`

  A part-level value wins. A message-level value is applied to that message's last part. Source: `unpkg:@effect/ai-anthropic@0.27.0/src/AnthropicLanguageModel.ts` L105–210 (declarations), L468–702 (emission), L1683–1692 (`getCacheControl`). The `ttl` literals are in `src/Generated.ts` L118–132.
- **v4.** Same options (L128–380), but assistant-message parts are **not** emitted with `cache_control`: `// TODO: use cache_control in content blocks` / `void cacheControl` at L1093–1094.
- **Tool definitions carry no `cache_control` in either version.** This matters less than it looks. The cache prefix order is tools → system → messages, so a breakpoint on the system block also caches the tool list ([prompt caching docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)).

**`eager_input_streaming`**
- **Not settable in v3 or v4.** In v3, `prepareTools` pushes only `{ name, description, input_schema }` for user-defined tools (L1455–1461). In v4 it pushes `{ name, input_schema, description?, strict? }` (EAv4 L1405–1417).
- The v4 generated schema *does* contain the field (`Generated.ts` L3977/L4023, `BetaTool.eager_input_streaming`). Nothing sets it.
- **Partial deltas are surfaced:** `input_json_delta` → a `tool-params-delta` response part carrying the raw `partial_json` (EAv3 L1237–1250, EAv4 L2670–2700).
- **Workarounds:**
  - **(a)** `transformClient: HttpClient.mapRequest(HttpClientRequest.setHeader("anthropic-beta", "fine-grained-tool-streaming-2025-05-14"))`. Per [fine-grained tool streaming](https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming): "a request that still sends the legacy `fine-grained-tool-streaming-2025-05-14` beta header ... turns fine-grained streaming on for tools that leave the field unset." Careful: the provider sets its own `anthropic-beta` header when it needs betas (v3 `AnthropicClient.ts` L302–308; v4 L357–361), so merge rather than overwrite.
  - **(b)** Parse and re-serialise the body in `transformClient`. The stream request body is sent as raw JSON with no schema encoding (v3 `HttpBody.unsafeJson`, `AnthropicClient.ts` L305–309; v4 `HttpBody.jsonUnsafe` L364–367), so the added field would reach the API.

**`pause_turn`**
- **Yes.** `pause_turn` → `FinishReason "pause"`, in `src/internal/utilities.ts` L7 of both versions.
- The v3 stream schema `MessageDelta.stop_reason` is a closed literal set (`AnthropicClient.ts` L395–405). It **lacks `model_context_window_exceeded`**, which `@anthropic-ai/sdk@0.129.0` lists as a `StopReason`, so a v3 stream would fail to decode if that reason came back. The v4 generated schema includes it (`Generated.ts` L2860–2872).

**`tool_choice`**
- **Yes.** Provider-neutral `toolChoice: "auto" | "none" | "required" | {tool} | {mode, oneOf}` maps to Anthropic `auto` / `any` / `tool` with `disable_parallel_tool_use` from `Config.disableParallelToolCalls`. Source: EAv3 L1566–1593; `@effect/ai@0.37.0/src/LanguageModel.ts` L188.

**Browser header / custom HTTP client**
- **Yes, via options.** `AnthropicClient.layer({ apiKey, apiUrl, transformClient })` sits on any `HttpClient`, and `apiUrl` defaults to `https://api.anthropic.com` (v3 `AnthropicClient.ts` L118, L194–215; v4 L173–243).
- The header `anthropic-dangerous-direct-browser-access` is **not** set automatically: `grep` finds no occurrence in either version. Add it with `transformClient`.
- In the browser, provide `FetchHttpClient.layer`: `@effect/platform/FetchHttpClient` (exported by `@effect/platform@0.97`) for v3, `effect/http/FetchHttpClient` for v4.
- `AnthropicConfig.withClientTransform` also allows a per-request override (v3 `AnthropicConfig.ts` L35–62).

**Runs in the browser?**
- **Yes, in principle.** All I/O goes through `HttpClient` + `Sse` with no Node APIs in the request path.
- v3 depends on `@anthropic-ai/tokenizer`, but only through `AnthropicTokenizer`. Tree-shaking should drop it; not verified.

### 1.2 Other providers that ship

| Provider package | v3 (`effect@3.22`) | v4 (`4.0.0-rc.118`) |
|---|---|---|
| Anthropic | `@effect/ai-anthropic@0.27.0` | `@effect/ai-anthropic@4.0.0-rc.118` |
| OpenAI | `@effect/ai-openai@0.41.0` | yes |
| OpenAI-compatible | — | `@effect/ai-openai-compat@4.0.0-rc.118` |
| OpenRouter | `@effect/ai-openrouter@0.12.0` (supports `cache_control` on parts: `OpenRouterLanguageModel.ts` L368–410) | yes |
| Google (Gemini API) | `@effect/ai-google@0.16.0` (`generativelanguage.googleapis.com`, `x-goog-api-key`; `GoogleClient.ts` L80–87) | **none** |
| Amazon Bedrock | `@effect/ai-amazon-bedrock@0.17.0` (**Converse** API via `aws4fetch` SigV4; `AmazonBedrockClient.ts` L11, L181; has `CachePointBlock`) | **none** |

v4 directory listing: `github.com/Effect-TS/effect/tree/main/packages/ai` contains `anthropic`, `openai`, `openai-compat`, `openrouter`, `typesafe` (GitHub contents API, 2026-09-28). Third-party v4 forks exist, which suggests people patch providers themselves: `@tardie/ai-bedrock`, `@tardie/ai-anthropic`, `@humanlayer/effect-ai-anthropic`. I checked `@humanlayer/effect-ai-anthropic@0.1.28`, and it does **not** add `eager_input_streaming` either.

Note that the v3 Bedrock provider targets **Converse**, not the new Bedrock Messages ("Mantle") endpoint. Converse is not the Anthropic wire format, so `eager_input_streaming` cannot be expressed there. The better Bedrock path is the **Anthropic** provider with `apiUrl` pointed at Mantle (§3.1).

### 1.3 Provider-neutral tools

- **Defining a tool.** `Tool.make(name, { description, parameters: {field: Schema...}, success: Schema, failure: Schema })` builds a tool, and `Toolkit.make(...tools)` groups tools.
- **Handlers.** `toolkit.toLayer(Effect.gen(... return { Name: (params) => Effect }))` supplies them.
- **Calling.** `LanguageModel.generateText | streamText({ prompt, toolkit, toolChoice, disableToolCallResolution })`.
- Each provider turns the parameters `Schema` into JSON Schema (`Tool.getJsonSchema`).
- `disableToolCallResolution: true` stops the library from running the handler, so the caller runs the tool itself. That fits a hand-written loop (`@effect/ai@0.37.0/src/LanguageModel.ts` L208, L779, L841).

Docs: <https://effect.website/docs/ai/tool-use/>. The docs target v3.

**Provider-specific per-tool fields have no slot on `Tool`.** In v4 the only per-tool provider knob the Anthropic provider reads is `Tool.getStrictMode` (EAv4 L1409).

### 1.4 API stability

- `@effect/ai` had 18 minor releases from 0.20.0 (2025-06-23) to 0.37.0 (2026-07-13), from `npm view @effect/ai time`. Under 0.x semver each minor may break.
- Documented breaks include:
  - `AiLanguageModel` → `LanguageModel` and `AiInput` → `Prompt`, and the `system` option was removed.
  - Tool-handler error semantics changed.

  Source: [`packages/ai/ai/CHANGELOG.md` (v3 branch)](https://github.com/Effect-TS/effect/blob/v3/packages/ai/ai/CHANGELOG.md) L111–377.
- **Effect 4:**
  - AI modules move into core: `effect/ai/LanguageModel`, `effect/ai/Tool`, and so on. HTTP moves to `effect/http/*`.
  - Providers depend only on `effect`.
  - v4 adds `Tool.isDynamic`, `strict` tools, a `codecTransformer` for structured output, and a `Tool.NameMapper`.
  - rc.118 was published 2026-09-28. Its changelog still has behaviour changes in patch releases, for example rc.118 changes an error channel from `SchemaError` to `HttpClientError` ([CHANGELOG](https://github.com/Effect-TS/effect/blob/main/packages/ai/anthropic/CHANGELOG.md)).

---

## 2. Hand-wrapping `@anthropic-ai/sdk` in Effect

**What the SDK gives you** (`@anthropic-ai/sdk@0.129.0`):
- `dangerouslyAllowBrowser: true` sends `anthropic-dangerous-direct-browser-access: true` (`client.js` L92, L838–839).
- `fetch` and `fetchOptions` options (`client.d.ts` L101–107).
- A per-request `signal` (`internal/request-options.d.ts` L91).
- `messages.create({stream:true})` returns a `Stream` that is an `AsyncIterable` with an `AbortController`.
  - Breaking out of iteration calls `controller.abort()` (`core/streaming.js` L129–132).
  - `eager_input_streaming` is a typed field on `Tool` (`resources/messages/messages.d.ts` L2564).
  - `pause_turn` and `model_context_window_exceeded` are in `StopReason` (L2337).

**Idiomatic shape.** Tie the `AbortController` to the fiber's scope. Do not rely only on `iterator.return()`.

- `Stream.fromAsyncIterable` in `effect@3.22.2` releases by calling `iterator.return()` (`internal/stream.ts` L2968–2987). An async generator queues `return()` behind any in-flight `next()`, so an interrupt that lands while waiting for the next SSE chunk would only abort once that chunk arrives. This is JS async-generator semantics, reasoned from the spec and not measured.
- Aborting the signal directly from the scope finaliser is immediate.

```ts
// Effect 3 sketch (not compiled)
const streamMessage = (params: MessageCreateParamsStreaming) =>
  Stream.unwrapScoped(Effect.gen(function* () {
    const client = yield* AnthropicSdk               // Context.Tag holding `new Anthropic({ dangerouslyAllowBrowser: true, ... })`
    const ac = new AbortController()
    yield* Effect.addFinalizer(() => Effect.sync(() => ac.abort()))   // fiber interrupt => HTTP abort
    const sdkStream = yield* Effect.tryPromise({
      try: () => client.messages.create(params, { signal: ac.signal }),
      catch: (e) => new ProviderError({ cause: e })
    })
    return Stream.fromAsyncIterable(sdkStream, (e) => new ProviderError({ cause: e }))
  }))
// consumer: Stream.runForEach(streamMessage(p), onEvent) inside a fiber; Fiber.interrupt(fiber) cancels the request.
```

`Effect.tryPromise` also passes its own `AbortSignal` to `try: (signal) => ...`, which is aborted on interruption. That covers the request phase. The finaliser covers the body phase.

**Prior art.**
- The closest first-party prior art is `@effect/ai-anthropic` itself. It deliberately does **not** wrap the SDK. It calls the REST API through `HttpClient` + `Sse.makeChannel()` + `Stream.takeUntil(message_stop)` (EAv3 `AnthropicClient.ts` L227–260, L300–312). That gives interruption through `HttpClient` for free.
- A web search found no maintained library that wraps `@anthropic-ai/sdk` in Effect `Stream`s.

**A middle path worth noting.** Use the `@effect/ai-anthropic` **`AnthropicClient`** alone: `createMessageStream` returns `Stream<MessageStreamEvent>` of raw Anthropic events. Build the request payload by hand, including `eager_input_streaming`, and skip `LanguageModel`. The payload goes out as unencoded JSON (§1.1). But the payload *type* is `Generated.BetaCreateMessageParams.Encoded`, which lacks the field in v3, so it needs a cast.

---

## 3. Failover targets

### 3.1 The same Claude models on another platform

**Claude in Amazon Bedrock (Messages API, "Mantle")**
- Docs: [claude-in-amazon-bedrock](https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock).
- **Endpoint:** `https://bedrock-mantle.{region}.api.aws/anthropic/v1/messages`. Per the docs it has "the same request body shape as Anthropic's first-party API", with standard SSE.
- **Model ids** carry an `anthropic.` prefix, e.g. `anthropic.claude-opus-5-5`.
- **SDK:** `AnthropicBedrockMantle` in `@anthropic-ai/bedrock-sdk@0.34.0` (`mantle-client.d.ts`: `apiKey` bearer > SigV4 creds; `dangerouslyAllowBrowser`; `skipAuth`).
- The docs say the plain `Anthropic` client also works: set `base_url` to `https://bedrock-mantle.{region}.api.aws/anthropic` and pass a bearer token as `api_key`.
- **Auth:**
  - A service role, IAM assumed roles, or **short-term bearer tokens** (12 h max, minted with `aws-bedrock-token-generator`, sent in `x-api-key`).
  - The comparison table on the Claude Platform on AWS page lists Mantle auth as "AWS IAM / SigV4" only, which contradicts the Bedrock page. Treat the bearer-token path as open until tested.
- **Features:**
  - Prompt caching: listed as supported.
  - Fine-grained tool streaming: supported on Bedrock per the [fine-grained tool streaming](https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming) page.
  - Unsupported: structured outputs, server-side tools and the Files API. None of these is used by the design.
- **Browser:** the preflight returned `access-control-allow-origin: *` and `access-control-allow-headers: *`. Under the Fetch spec, a `*` in `Access-Control-Allow-Headers` does **not** cover `Authorization`. So SigV4 (which uses `Authorization`) would likely fail CORS, while the bearer token in `x-api-key` should pass.
- **Independence:** "runs on AWS-managed infrastructure ... Anthropic personnel have no access to the inference infrastructure" (Bedrock page). The legacy `bedrock-runtime` InvokeModel/Converse endpoint also answers CORS, but it is not the Anthropic wire format.

**Claude Platform on AWS**
- Docs: [claude-platform-on-aws](https://platform.claude.com/docs/en/build-with-claude/claude-platform-on-aws).
- Anthropic operates it. It serves the full Claude API at `aws-external-anthropic.{region}.api.aws`, with the `anthropic-workspace-id` header.
- The docs state: "uses a separate capacity pool from both the first-party Claude API and Amazon Bedrock. You can run workloads on more than one platform and fail over between them."
- Preflight: `*` / `*`.
- It needs an AWS Marketplace setup.
- Because Anthropic operates it, whether it shares failure modes with api.anthropic.com beyond capacity is **unknown**.

**Claude on Google Cloud (Vertex / "Agent Platform")**
- Docs: [claude-on-vertex-ai](https://platform.claude.com/docs/en/build-with-claude/claude-on-vertex-ai).
- **Two body differences:**
  - `model` goes in the URL (`.../publishers/anthropic/models/{id}:rawPredict` or `:streamRawPredict`).
  - `anthropic_version: "vertex-2023-10-16"` goes in the body.
- **Features:** prompt caching supported. Fine-grained tool streaming is supported on "Google Cloud" per the fine-grained tool streaming page.
- **SDK:** `@anthropic-ai/vertex-sdk@0.20.0` depends on `google-auth-library` but also accepts `accessToken` and `dangerouslyAllowBrowser` (`client.d.ts` L10, L63).
- **Browser:** the preflight to `aiplatform.googleapis.com` echoes the origin and explicitly allows `authorization`. So a browser holding a Google **OAuth access token** (for example from Google Identity Services) can call it. **No API-key path is documented.**
- **Independence:** Google-operated serving.

**Status pages.** `status.claude.com` lists only first-party components: claude.ai, Console, "Claude API (api.anthropic.com)", Claude Code, Cowork and Claude for Government (`/api/v2/components.json`). None of the last 50 incidents (2026-07-24 → 2026-09-22) mentions Bedrock or Vertex. Examples include "Elevated errors across all models" on 2026-07-29 (critical, ~2 h 47 m) and "Service disruption on Claude services" on 2026-08-16. So Anthropic's page gives **no evidence either way** about correlated outages. Bedrock and Vertex health is reported on the AWS Health Dashboard and the Google Cloud status page. I did not look for historical correlation.

### 3.2 OpenRouter (one multi-provider endpoint)

- **Two wire formats:** OpenAI-style `/api/v1/chat/completions` and an Anthropic-Messages-style `/api/v1/messages` ([API reference](https://openrouter.ai/docs/api/api-reference/anthropic-messages/create-a-message.md)).
- **Caching:** `cache_control` is supported per block (max 4 breakpoints, `ttl: "1h"`) or top-level, on both chat/completions and `/messages`. Provider-sticky routing keeps caches warm, and a `session_id` pins it ([prompt caching](https://openrouter.ai/docs/guides/best-practices/prompt-caching.md)).
- **Stop reasons and deltas:** the `/messages` schema lists `pause_turn` and `model_context_window_exceeded`, plus `input_json_delta`.
- **`eager_input_streaming` does not appear anywhere** in the `/messages` OpenAPI schema (grep of the 221 KB spec). Pass-through is unverified.
- **Browser:**
  - `chat/completions` passes a preflight with `Authorization`, and OpenRouter returns a fixed allow-list.
  - `/api/v1/messages` returns the **same** fixed list, which **lacks `anthropic-version`, `anthropic-beta` and `anthropic-dangerous-direct-browser-access`**. `@anthropic-ai/sdk` (and the Effect `AnthropicClient`, which always sets `anthropic-version`) would therefore be blocked by the browser unless those headers are stripped.
  - Auth is `Authorization: Bearer`.
- **Effect:** `@effect/ai-openrouter` uses chat/completions.

### 3.3 A different model family

**Gemini API (`@google/genai@2.24.0`)**
- **Tool calling:** `functionDeclarations`, and `toolConfig.functionCallingConfig.mode` = `AUTO | ANY | NONE | VALIDATED` (+ `allowedFunctionNames`). This is roughly `auto` / `any` / `none` / `tool`.
- **Partial tool input: none on the Gemini API.** `FunctionCall.partialArgs`, `willContinue` and `streamFunctionCallArguments` are all documented as "not supported in Gemini API" (Vertex only) (`dist/genai.d.ts` L5712–5733). On the Gemini API a streamed function call arrives whole in one chunk, so the live preview would degrade to "appears at the end".
- **Caching:** implicit and automatic on 2.5+, with a minimum of 2,048–4,096 tokens. Explicit caching is a separate `caches.create` resource (default TTL 1 h) referenced by `cachedContent`. It is a prefix, **not** per-block breakpoints ([caching](https://ai.google.dev/gemini-api/docs/generate-content/caching)).
- **Browser:** the package has a `browser` export (`dist/web`), and the preflight allows `x-goog-api-key`.
- **Effect v3:** `@effect/ai-google`.

**OpenAI (`openai@7.23.0`, Responses API)**
- **Tool calling:** function tools, `tool_choice`, `parallel_tool_calls`.
- **Partial tool input:** yes, the `response.function_call_arguments.delta` event (`resources/responses/responses.d.ts` L2679). No opt-in needed.
- **Caching:** automatic for prompts ≥1,024 tokens. Tools are part of the cached prefix. `prompt_cache_key` controls routing and accounting. Explicit `prompt_cache_breakpoint` exists only on GPT-5.6+, and retention is `in_memory`/`24h` or `30m` on 5.6+ ([prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)).
- **Browser:** `dangerouslyAllowBrowser` (`client.d.ts` L155). The preflight passes with `Authorization`.
- **Stop reasons:** no `pause_turn` equivalent in the same form.

---

## 4. Vercel AI SDK (comparison only)

`@ai-sdk/anthropic@4.0.67`:

- **`eager_input_streaming`:** yes. There is a model-level `toolStreaming` option, **default `true`**. It sets `eager_input_streaming: true` on every function tool, with a per-tool override `providerOptions.anthropic.eagerInputStreaming` (`src/anthropic-language-model-options.ts` L288–297; `src/anthropic-prepare-tools.ts` L95–115).
- **Partial deltas:** `input_json_delta` → `tool-input-delta` stream parts (`src/anthropic-language-model.ts` L2746–2788).
- **`cache_control`:** yes, via `providerOptions.anthropic.cacheControl` on messages and parts **and on tool definitions**. It validates a maximum of 4 breakpoints and warns if exceeded (`src/get-cache-control.ts`; `anthropic-prepare-tools.ts` L86–89, L113).
- **`pause_turn`** and `model_context_window_exceeded` are mapped (`src/map-anthropic-stop-reason.ts` L14, L23).
- **`toolChoice`:** yes.
- **Browser:** custom `fetch` and `headers` are supported (`anthropic-provider.ts` L104–110). The browser-access header is **not** added automatically (grep), so pass it in `headers`.

---

## (a) Feature-coverage table

Legend: ✅ supported · ⚠️ partial / workaround · ❌ not supported · ? unverified

| Feature | Effect AI v3 (`@effect/ai-anthropic@0.27`) | Effect AI v4 rc (`4.0.0-rc.118`) | Hand-wrapped `@anthropic-ai/sdk@0.129` | Vercel `@ai-sdk/anthropic@4.0.67` | Bedrock Mantle (same Claude) | Vertex (same Claude) | OpenRouter | Gemini API | OpenAI Responses |
|---|---|---|---|---|---|---|---|---|---|
| `cache_control` on arbitrary blocks | ⚠️ messages/parts yes, tools no ([src L105–702](https://unpkg.com/@effect/ai-anthropic@0.27.0/src/AnthropicLanguageModel.ts)) | ⚠️ assistant parts dropped (TODO L1093), tools no ([src](https://unpkg.com/@effect/ai-anthropic@4.0.0-rc.118/src/AnthropicLanguageModel.ts)) | ✅ raw API types ([messages.d.ts](https://unpkg.com/@anthropic-ai/sdk@0.129.0/resources/messages/messages.d.ts)) | ✅ incl. tools ([prepare-tools](https://unpkg.com/@ai-sdk/anthropic@4.0.67/src/anthropic-prepare-tools.ts)) | ✅ ([docs](https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock)) | ✅ ([docs](https://platform.claude.com/docs/en/build-with-claude/claude-on-vertex-ai)) | ✅ ([docs](https://openrouter.ai/docs/guides/best-practices/prompt-caching.md)) | ❌ implicit / `cachedContent` prefix ([docs](https://ai.google.dev/gemini-api/docs/generate-content/caching)) | ⚠️ automatic; breakpoints only GPT-5.6+ ([docs](https://developers.openai.com/api/docs/guides/prompt-caching)) |
| Per-tool `eager_input_streaming` | ⚠️ not settable; legacy beta header via `transformClient` ([src L1455](https://unpkg.com/@effect/ai-anthropic@0.27.0/src/AnthropicLanguageModel.ts), [docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming)) | ⚠️ same (schema has field, not set) ([src L1405](https://unpkg.com/@effect/ai-anthropic@4.0.0-rc.118/src/AnthropicLanguageModel.ts)) | ✅ typed field ([messages.d.ts L2564](https://unpkg.com/@anthropic-ai/sdk@0.129.0/resources/messages/messages.d.ts)) | ✅ default on ([options L288](https://unpkg.com/@ai-sdk/anthropic@4.0.67/src/anthropic-language-model-options.ts)) | ✅ ([docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming)) | ✅ ([docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming)) | ? not in schema ([spec](https://openrouter.ai/docs/api/api-reference/anthropic-messages/create-a-message.md)) | n/a | n/a |
| Partial tool-input deltas | ✅ `tool-params-delta` ([src L1237](https://unpkg.com/@effect/ai-anthropic@0.27.0/src/AnthropicLanguageModel.ts)) | ✅ ([src L2670](https://unpkg.com/@effect/ai-anthropic@4.0.0-rc.118/src/AnthropicLanguageModel.ts)) | ✅ `input_json_delta` ([docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming)) | ✅ `tool-input-delta` ([src L2746](https://unpkg.com/@ai-sdk/anthropic@4.0.67/src/anthropic-language-model.ts)) | ✅ same wire format ([docs](https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock)) | ✅ same wire format ([docs](https://platform.claude.com/docs/en/build-with-claude/claude-on-vertex-ai)) | ⚠️ `input_json_delta` in schema, eager ? ([spec](https://openrouter.ai/docs/api/api-reference/anthropic-messages/create-a-message.md)) | ❌ `partialArgs` Vertex-only ([genai.d.ts L5712](https://unpkg.com/@google/genai@2.24.0/dist/genai.d.ts)) | ✅ `function_call_arguments.delta` ([responses.d.ts L2679](https://unpkg.com/openai@7.23.0/resources/responses/responses.d.ts)) |
| `pause_turn` | ✅ → `"pause"` ([utilities.ts](https://unpkg.com/@effect/ai-anthropic@0.27.0/src/internal/utilities.ts)) | ✅ ([utilities.ts](https://unpkg.com/@effect/ai-anthropic@4.0.0-rc.118/src/internal/utilities.ts)) | ✅ ([messages.d.ts L2337](https://unpkg.com/@anthropic-ai/sdk@0.129.0/resources/messages/messages.d.ts)) | ✅ ([stop-reason](https://unpkg.com/@ai-sdk/anthropic@4.0.67/src/map-anthropic-stop-reason.ts)) | ? same API; server tools unsupported so rarely emitted ([docs](https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock)) | ? ([docs](https://platform.claude.com/docs/en/build-with-claude/claude-on-vertex-ai)) | ✅ in enum ([spec](https://openrouter.ai/docs/api/api-reference/anthropic-messages/create-a-message.md)) | ❌ no equivalent | ❌ no equivalent |
| `tool_choice` | ✅ ([src L1566](https://unpkg.com/@effect/ai-anthropic@0.27.0/src/AnthropicLanguageModel.ts)) | ✅ ([src](https://unpkg.com/@effect/ai-anthropic@4.0.0-rc.118/src/AnthropicLanguageModel.ts)) | ✅ | ✅ ([prepare-tools](https://unpkg.com/@ai-sdk/anthropic@4.0.67/src/anthropic-prepare-tools.ts)) | ✅ same API | ✅ same API | ✅ ([spec](https://openrouter.ai/docs/api/api-reference/anthropic-messages/create-a-message.md)) | ✅ `mode`+`allowedFunctionNames` ([genai.d.ts L5728](https://unpkg.com/@google/genai@2.24.0/dist/genai.d.ts)) | ✅ ([responses.d.ts](https://unpkg.com/openai@7.23.0/resources/responses/responses.d.ts)) |
| Browser header / custom fetch | ⚠️ add header via `transformClient`; `apiUrl` ([client](https://unpkg.com/@effect/ai-anthropic@0.27.0/src/AnthropicClient.ts)) | ⚠️ same ([client](https://unpkg.com/@effect/ai-anthropic@4.0.0-rc.118/src/AnthropicClient.ts)) | ✅ `dangerouslyAllowBrowser`, `fetch` ([client.js L92](https://unpkg.com/@anthropic-ai/sdk@0.129.0/client.js)) | ⚠️ `headers`+`fetch`, header manual ([provider](https://unpkg.com/@ai-sdk/anthropic@4.0.67/src/anthropic-provider.ts)) | ✅ CORS `*`; bearer in `x-api-key` (preflight 2026-09-28; [docs](https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock)) | ⚠️ CORS ok, needs OAuth token ([vertex-sdk](https://unpkg.com/@anthropic-ai/vertex-sdk@0.20.0/client.d.ts)) | ⚠️ `/messages` CORS lacks `anthropic-*` headers (preflight) | ✅ `web` build; CORS ok ([pkg](https://unpkg.com/@google/genai@2.24.0/package.json)) | ✅ `dangerouslyAllowBrowser` ([client.d.ts](https://unpkg.com/openai@7.23.0/client.d.ts)) |
| Provider-neutral tool defs | ✅ `Tool`/`Toolkit` + `Schema` ([docs](https://effect.website/docs/ai/tool-use/)) | ✅ (+`strict`, dynamic) | ❌ Anthropic-only | ✅ `tool()` + zod/JSON schema | — | — | — | — | — |

---

## (b) Failover targets, ranked by how little changes

1. **Same Claude model on Claude in Amazon Bedrock (Mantle).** Same body, same SSE events, same `cache_control` and `eager_input_streaming`. What changes:
   - `baseURL` → `https://bedrock-mantle.{region}.api.aws/anthropic`
   - model id → `anthropic.claude-…`
   - key → short-term Bedrock bearer token in `x-api-key`

   The CORS preflight allows it. The prompt cache is cold on switch. AWS operates the serving stack.
2. **Claude Platform on AWS.** Full Claude API surface. `baseURL` → `aws-external-anthropic.{region}.api.aws`, plus an `anthropic-workspace-id` header. It has a documented "separate capacity pool" and is documented as a failover target. But Anthropic operates it, so how independent it is from api.anthropic.com incidents is unclear. It needs an AWS Marketplace setup.
3. **Same Claude model on Vertex.** Small body reshape (`model` → URL, `anthropic_version` in body, `:streamRawPredict`). Needs a Google OAuth access token in the browser. Otherwise at parity for caching and eager streaming.
4. **OpenRouter `/api/v1/messages` → Claude.** Anthropic body and caching work. `eager_input_streaming` is unverified. The browser CORS path fails for the `anthropic-*` headers, so headers must be stripped (Effect `transformClient`, or a raw `fetch`). Its own routing may still land on Anthropic, Bedrock or Vertex.
5. **OpenAI (Responses).** Different wire format and tool schema. Partial tool-argument deltas ✅, automatic caching (no breakpoints before GPT-5.6), no `pause_turn`. Needs a second provider implementation behind the seam, or `@effect/ai-openai`.
6. **Gemini API.** Different wire format, **no partial tool-argument streaming** (so the live preview is lost), prefix or implicit caching only. The `@effect/ai-google` provider exists for v3 only.

---

## (c) Unverified / open

- **No end-to-end calls were made.** Every "works in the browser" claim rests on CORS preflight responses plus docs and source. The actual POST (streaming bodies, auth acceptance) was not exercised.
- **Bedrock Mantle bearer-token auth.** The Bedrock page says bearer tokens go in `x-api-key`. The comparison table on the Claude-Platform-on-AWS page lists Mantle auth as "AWS IAM / SigV4" only. Test it.
- **Bedrock Mantle and extra headers.** Whether Mantle accepts or ignores `anthropic-dangerous-direct-browser-access` and `anthropic-beta` (for example `fine-grained-tool-streaming-2025-05-14`) is unknown.
- **The Fetch-spec rule on `Authorization`.** "`Access-Control-Allow-Headers: *` excludes `Authorization`" is from the Fetch standard and was not re-checked against a live browser here. It bears on SigV4 and on any `Authorization: Bearer` to Mantle.
- **OpenRouter:**
  - Whether `eager_input_streaming` is passed through to Anthropic.
  - Whether `/api/v1/messages` accepts requests *without* `anthropic-version` (needed for browser CORS).
  - Whether `cache_control` on tool definitions is honoured.
- **`pause_turn` on Bedrock and Vertex.** Server tools (the usual trigger) are unsupported on Bedrock, so how often `pause_turn` happens there is unknown.
- **Effect `LanguageModel` and `pause_turn` continuation.** Whether `@effect/ai`'s `Prompt` round-trips the paused assistant content exactly, as the API needs for continuation, was not tested.
- **Effect v3 `transformClient` + legacy beta header.** Not run. The provider may set its own `anthropic-beta` on the same request (only when provider-defined tools or betas are in play), and the merge order was reasoned from source, not executed.
- **Tree-shaking.** Whether `@anthropic-ai/tokenizer` (v3 dependency) is dropped from a browser bundle when `AnthropicTokenizer` is unused.
- **Correlated outages.** Anthropic's status page does not cover Bedrock or Vertex, and no cross-provider incident correlation was researched. Independence of Bedrock and Vertex rests on "AWS-/Google-operated inference" statements, not on incident data.
- **Effect 4 GA date and API freeze.** Unknown. The RC is still changing error channels in patch releases.
- **Vercel `ai` core in the browser.** `streamText` running client-side was not verified. Only the provider package was read.
