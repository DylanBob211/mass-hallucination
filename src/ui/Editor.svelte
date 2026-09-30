<script lang="ts">
  import type { EditorView } from "@codemirror/view";
  import type { Attachment } from "svelte/attachments";
  import type { ProposalView } from "../facade/facade";
  import { type AgentWork, showAgentWork } from "./agentWork";
  import { showProposal } from "./proposal";

  // The agent work comes as separate props, whose references hold while only the cycle changes.
  let {
    view,
    proposal,
    turn,
    draft,
    parts,
  }: { view: EditorView; proposal: ProposalView | undefined } & AgentWork = $props();

  const mount: Attachment<HTMLElement> = (node) => {
    node.append(view.dom);
    view.focus();
    return () => {
      view.dom.remove();
    };
  };

  // CodeMirror is outside Svelte, so the view model's parts it shows are handed to it as they
  // change.
  $effect(() => {
    view.dispatch({ effects: showProposal.of(proposal) });
  });
  $effect(() => {
    view.dispatch({ effects: showAgentWork.of({ turn, draft, parts }) });
  });
</script>

<div class="h-full" {@attach mount}></div>
