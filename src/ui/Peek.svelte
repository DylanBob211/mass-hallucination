<script lang="ts">
  import type { TurnView } from "../facade/facade";
  import type { PeekState } from "./peekState.svelte";

  let {
    peek,
    turns,
    downloadLog,
  }: { peek: PeekState; turns: ReadonlyArray<TurnView>; downloadLog: () => void } = $props();

  const popup = (list: HTMLElement) => {
    // Clicking it keeps focus in the editor (ADR 0007).
    const keepFocus = (event: MouseEvent) => {
      event.preventDefault();
    };
    list.addEventListener("mousedown", keepFocus);
    // The latest Turn stays in view as the list grows.
    $effect(() => {
      list.scrollTop = turns.length > 0 ? list.scrollHeight : 0;
    });
    return () => {
      list.removeEventListener("mousedown", keepFocus);
    };
  };
</script>

{#if peek.open}
  <!-- For the human only (ADR 0007). -->
  <div
    class="peek absolute right-3 bottom-full left-3 mb-1 max-h-[40vh] overflow-y-auto border border-white/10 bg-panel px-3 py-2 font-mono text-sm"
    role="log"
    aria-label="this session's Instructions"
    {@attach popup}
  >
    <!-- The same as Alt-L (ADR 0007); clicking it keeps focus in the editor. -->
    <button
      type="button"
      class="float-right text-dim hover:text-fg"
      title="The instrumentation log, as JSON (spec §11)"
      onclick={downloadLog}
    >
      download log (Alt-L)
    </button>
    {#if turns.length === 0}
      <p class="text-dim">No Instructions yet. Ctrl-K asks the agent.</p>
    {:else}
      <ol class="flex flex-col gap-1">
        {#each turns as turn, index (index)}
          {@const said = turn.state === "failed" ? turn.error : turn.note.trim()}
          <li>
            <span class="text-caret">@{turn.aim ?? "all"}</span>
            <span class="text-fg">{turn.instruction}</span>
            <span class="text-dim {turn.state === 'failed' ? 'text-error' : ''}">
              {turn.state}{turn.landed ? ` (${turn.landed})` : ""}
            </span>
            {#if turn.retries > 0}
              <span class="text-dim">↻{turn.retries}</span>
            {/if}
            {#if turn.warnings}
              <span class="text-caret">⚠ {turn.warnings.join("; ")}</span>
            {/if}
            {#if said}
              <p class="whitespace-pre-wrap text-fg">{said}</p>
            {/if}
          </li>
        {/each}
      </ol>
    {/if}
  </div>
{/if}
