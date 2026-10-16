<script lang="ts">
  import type { EditorView } from "@codemirror/view";
  import { createSubscriber } from "svelte/reactivity";
  import type { Facade } from "./facade/facade";
  import { type CodeViewState, shownCodeView, visualErrorOf } from "./ui/codeView.svelte";
  import Editor from "./ui/Editor.svelte";
  import type { FormatRefusalState } from "./ui/formatRefusal.svelte";
  import Peek from "./ui/Peek.svelte";
  import type { PeekState } from "./ui/peekState.svelte";
  import StatusLine from "./ui/StatusLine.svelte";

  let {
    facade,
    view,
    peek,
    codeView,
    formatRefusal,
  }: {
    facade: Facade;
    view: EditorView;
    peek: PeekState;
    codeView: CodeViewState;
    formatRefusal: FormatRefusalState;
  } = $props();

  // The façade's view model is immutable and replaced whole on each update (ADR 0006), so it is
  // read as-is rather than copied into deep state.
  const track = $derived(createSubscriber((update) => facade.subscribe(update)));
  const viewModel = $derived.by(() => {
    track();
    return facade.viewModel;
  });
  const shown = $derived(shownCodeView(codeView.chosen, viewModel.proposal !== undefined));
  const visualError = $derived(visualErrorOf(viewModel.error, viewModel.parts));
</script>

<main class="flex h-full flex-col">
  <div class="relative min-h-0 flex-1">
    <Editor
      {view}
      proposal={viewModel.proposal}
      turn={viewModel.turns.at(-1)}
      draft={viewModel.draft}
      parts={viewModel.parts}
      codeView={shown}
      {visualError}
    />
    {#if shown !== "all" && visualError}
      <!-- Stands in for the error badge while code is hidden (ADR 0007 amendment), which in the
           focus view may be the broken Part's label line. -->
      <span
        class="absolute top-2 right-3 bg-error px-1.5 font-mono text-sm text-bg"
        title={visualError.message}
      >
        ✕ {visualError.part}
      </span>
    {/if}
  </div>
  <div class="relative">
    <Peek {peek} turns={viewModel.turns} downloadLog={() => void facade.downloadLog()} />
    <StatusLine {viewModel} codeView={shown} formatRefusal={formatRefusal.reason} />
  </div>
</main>
