import { expect, test } from "vitest";
import { createEditor } from "./editor";

test("the editor document holds the Source it was created with", () => {
  const parent = document.createElement("div");
  document.body.append(parent);

  const view = createEditor(parent, 'kick: s("bd*4")');

  expect(view.state.doc.toString()).toBe('kick: s("bd*4")');
  expect(parent.querySelector(".cm-content")?.textContent).toBe('kick: s("bd*4")');
  view.destroy();
  parent.remove();
});
