<script lang="ts">
  import type { EditorView } from "@codemirror/view";
  import { createSubscriber } from "svelte/reactivity";
  import type { Facade } from "./facade/facade";
  import Editor from "./ui/Editor.svelte";
  import StatusLine from "./ui/StatusLine.svelte";

  let { facade, view }: { facade: Facade; view: EditorView } = $props();

  // The façade's view model is immutable and replaced whole on each update (ADR 0006), so it is
  // read as-is rather than copied into deep state.
  const track = $derived(createSubscriber((update) => facade.subscribe(update)));
  const viewModel = $derived.by(() => {
    track();
    return facade.viewModel;
  });
</script>

<main class="flex h-full flex-col">
  <div class="min-h-0 flex-1">
    <Editor {view} />
  </div>
  <StatusLine {viewModel} />
</main>
