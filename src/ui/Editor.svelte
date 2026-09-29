<script lang="ts">
  import type { EditorView } from "@codemirror/view";
  import type { Attachment } from "svelte/attachments";

  let { view }: { view: EditorView } = $props();

  const mount: Attachment<HTMLElement> = (node) => {
    node.append(view.dom);
    view.focus();
    return () => {
      view.dom.remove();
    };
  };
</script>

<div class="h-full" {@attach mount}></div>
