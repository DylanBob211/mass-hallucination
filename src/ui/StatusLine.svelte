<script lang="ts">
  import type { ViewModel } from "../facade/facade";

  // Empty for now: transport (ticket 02) and the error slot (ticket 05) render here.
  let { viewModel }: { viewModel: ViewModel } = $props();
</script>

<footer class="h-7 border-t border-white/10 px-3 font-mono text-sm text-dim">
  {#each Object.entries(viewModel) as [name, value] (name)}
    <span>{name}: {value}</span>
  {/each}
</footer>
