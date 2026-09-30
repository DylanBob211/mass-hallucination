<script lang="ts">
  import type { ViewModel } from "../facade/facade";

  // The agent's Turn renders here later.
  let { viewModel }: { viewModel: ViewModel } = $props();

  const transport = $derived(viewModel.transport);
  const error = $derived(viewModel.error);
  const waitingApply = $derived(viewModel.waitingApply);

  // Named with the Alt key that sets each (spec §10).
  const autonomyLabels = { propose: "1 propose", write: "2 write", apply: "3 apply" } as const;
</script>

<footer
  class="flex h-7 items-center gap-4 border-t border-white/10 px-3 font-mono text-sm text-dim"
>
  <span class="shrink-0 text-fg" title="Autonomy: Alt-1 propose, Alt-2 write, Alt-3 apply">
    {autonomyLabels[viewModel.autonomy]}
  </span>
  {#if waitingApply}
    <span class="shrink-0 text-fg">plays at cycle {waitingApply.cycle}</span>
  {/if}
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
