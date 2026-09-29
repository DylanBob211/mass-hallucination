/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** From the git-ignored `.env.local`; see `.env.example` (ADR 0005). */
  readonly VITE_ANTHROPIC_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
