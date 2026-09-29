<script lang="ts">
  import type { ViewModel } from "../facade/facade";

  // The error slot (ticket 05) and the agent's state render here later.
  let { viewModel }: { viewModel: ViewModel } = $props();

  const transport = $derived(viewModel.transport);
</script>

<footer
  class="flex h-7 items-center gap-4 border-t border-white/10 px-3 font-mono text-sm text-dim"
>
  <span class={transport.started ? "text-fg" : ""}>
    {transport.started ? "▶ running" : "■ stopped"}
  </span>
  <span>cycle {viewModel.cycle}</span>
  <span>{Number(transport.cps.toFixed(3))} cps</span>
</footer>
