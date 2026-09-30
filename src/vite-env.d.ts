/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** From the git-ignored `.env.local`; see `.env.example` (ADR 0005). */
  readonly VITE_ANTHROPIC_API_KEY?: string;
  /** A fallback model id, such as `claude-sonnet-5-5` (spec §7); `claude-opus-5-5` if unset. */
  readonly VITE_ANTHROPIC_MODEL?: string;
  /** A fallback endpoint, such as Bedrock Mantle's (spec §7); the Anthropic API if unset. */
  readonly VITE_ANTHROPIC_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
