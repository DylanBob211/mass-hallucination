<script lang="ts">
  import type { EditorView } from "@codemirror/view";
  import type { Attachment } from "svelte/attachments";
  import type { ProposalView } from "../facade/facade";
  import { showProposal } from "./proposal";

  let { view, proposal }: { view: EditorView; proposal: ProposalView | undefined } = $props();

  const mount: Attachment<HTMLElement> = (node) => {
    node.append(view.dom);
    view.focus();
    return () => {
      view.dom.remove();
    };
  };

  // CodeMirror is outside Svelte, so the open Proposal is handed to it as it changes.
  $effect(() => {
    view.dispatch({ effects: showProposal.of(proposal) });
  });
</script>

<div class="h-full" {@attach mount}></div>
