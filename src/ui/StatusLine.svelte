<script lang="ts">
  import { turnEndings, type ViewModel } from "../facade/facade";

  let { viewModel }: { viewModel: ViewModel } = $props();

  const transport = $derived(viewModel.transport);
  const error = $derived(viewModel.error);
  const waitingApply = $derived(viewModel.waitingApply);
  const turn = $derived(viewModel.turns.at(-1));
  const working = $derived(turn !== undefined && !turnEndings.has(turn.state));
  // What the note line says: the model's own words, or what went wrong.
  const note = $derived(turn?.state === "failed" ? turn.error : turn?.note.trim());

  // Named with the Alt key that sets each (spec §10).
  const autonomyLabels = { propose: "1 propose", write: "2 write", apply: "3 apply" } as const;
</script>

<footer
  class="flex h-7 items-center gap-4 border-t border-white/10 px-3 font-mono text-sm text-dim"
>
  <span class="shrink-0 text-fg" title="Autonomy: Alt-1 propose, Alt-2 write, Alt-3 apply">
    {autonomyLabels[viewModel.autonomy]}
  </span>
  {#if turn}
    <span class="flex min-w-0 shrink items-center gap-2" title={turn.instruction}>
      <span
        class="shrink-0 {working ? 'text-caret' : ''} {turn.state === 'failed' ? 'text-error' : ''}"
      >
        {turn.state}{turn.landed ? ` (${turn.landed})` : ""}
      </span>
      {#if turn.retries > 0}
        <span class="shrink-0" title="refused changes retried">↻{turn.retries}</span>
      {/if}
      {#if turn.warnings}
        <span class="min-w-0 truncate text-caret" title={turn.warnings.join("\n")}>
          ⚠ {turn.warnings.join("; ")}
        </span>
      {/if}
      {#if note}
        <span class="min-w-0 truncate text-fg" title={note}>{note}</span>
      {/if}
      {#if working}
        <span class="shrink-0">esc stop</span>
      {/if}
    </span>
  {/if}
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
