<script lang="ts">
  import type { ViewModel } from "../facade/facade";

  // The agent's state renders here later.
  let { viewModel }: { viewModel: ViewModel } = $props();

  const transport = $derived(viewModel.transport);
  const error = $derived(viewModel.error);
</script>

<footer
  class="flex h-7 items-center gap-4 border-t border-white/10 px-3 font-mono text-sm text-dim"
>
  {#if error}
    <span class="min-w-0 truncate text-error" title={error.message}>
      ✕ {error.phase === "eval" ? "eval" : "playing"}{error.part ? ` in ${error.part}` : ""}: {error.message}
    </span>
  {/if}
  <span class="shrink-0 {transport.started ? 'text-fg' : ''}">
    {transport.started ? "▶ running" : "■ stopped"}
  </span>
  <span class="shrink-0">cycle {viewModel.cycle}</span>
  <span class="shrink-0">{Number(transport.cps.toFixed(3))} cps</span>
</footer>
