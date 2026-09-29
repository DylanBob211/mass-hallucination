import { userEvent } from "@vitest/browser/context";
import { afterEach, expect, test, vi } from "vitest";
import { createEditor } from "./editor";

const mounted = (source: string) => {
  const commands = { apply: vi.fn(), stopTransport: vi.fn() };
  const view = createEditor(source, commands);
  document.body.append(view.dom);
  view.focus();
  return { view, commands };
};

afterEach(() => {
  document.body.replaceChildren();
});

test("the editor document holds the Source it was created with", () => {
  const { view } = mounted('kick: s("bd*4")');

  expect(view.state.doc.toString()).toBe('kick: s("bd*4")');
  expect(view.contentDOM.textContent).toBe('kick: s("bd*4")');
  view.destroy();
});

test("Ctrl-Enter applies without touching the text, and focus stays in the editor", async () => {
  const { view, commands } = mounted('s("bd")');

  await userEvent.keyboard("{Control>}{Enter}{/Control}");

  expect(commands.apply).toHaveBeenCalledOnce();
  expect(view.state.doc.toString()).toBe('s("bd")');
  expect(view.hasFocus).toBe(true);
  view.destroy();
});

test("Ctrl-. stops the transport, and focus stays in the editor", async () => {
  const { view, commands } = mounted('s("bd")');

  await userEvent.keyboard("{Control>}.{/Control}");

  expect(commands.stopTransport).toHaveBeenCalledOnce();
  expect(commands.apply).not.toHaveBeenCalled();
  expect(view.hasFocus).toBe(true);
  view.destroy();
});
