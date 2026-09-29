<script lang="ts">
  import type { Attachment } from "svelte/attachments";
  import { createEditor } from "./editor";

  const mount: Attachment<HTMLElement> = (node) => {
    const view = createEditor(node, "");
    view.focus();
    return () => {
      view.destroy();
    };
  };
</script>

<div class="h-full" {@attach mount}></div>
