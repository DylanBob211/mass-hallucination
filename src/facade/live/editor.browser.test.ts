import { undo } from "@codemirror/commands";
import { userEvent } from "@vitest/browser/context";
import { Effect, Either } from "effect";
import { afterEach, expect, test } from "vitest";
import { Editor } from "../../core/Editor";
import { createEditor } from "../../ui/editor";
import { editorLayer } from "./editor";

const source = 'kick: s("bd*4")\nhats: s("hh*8")';

const mounted = () => {
  const view = createEditor(source, {
    apply: () => {},
    stopTransport: () => {},
    setAutonomy: () => {},
    accept: () => {},
    acceptAndPlay: () => {},
    reject: () => {},
  });
  document.body.append(view.dom);
  view.focus();
  const write = (onto: string, changes: Array<{ from: number; to: number; insert: string }>) =>
    Effect.runPromise(
      Effect.scoped(
        Effect.provide(
          Effect.either(Effect.flatMap(Editor, (editor) => editor.write(onto, changes))),
          editorLayer(view),
        ),
      ),
    );
  return { view, write };
};

afterEach(() => {
  document.body.replaceChildren();
});

test("an agent write is one undo step, and the cursor moves with the text around it", async () => {
  const { view, write } = mounted();
  // The human's cursor at the end of kick's line.
  view.dispatch({ selection: { anchor: source.indexOf("\n") } });
  await userEvent.keyboard("{End}.gain(1");
  const typed = view.state.doc.toString();
  const hats = typed.indexOf("hats");

  // Rewrite hats, then prepend a Preamble line, in one write.
  await write(typed, [
    { from: hats, to: typed.length, insert: 'hats: s("hh*16")' },
    { from: 0, to: 0, insert: "setcps(.6)\n" },
  ]);

  expect(view.state.doc.toString()).toBe('setcps(.6)\nkick: s("bd*4").gain(1\nhats: s("hh*16")');
  expect(view.state.selection.main.head).toBe("setcps(.6)\n".length + typed.indexOf("\n"));
  undo(view);
  expect(view.state.doc.toString()).toBe(typed);
  view.destroy();
});

test("an agent write onto a Source that has moved writes nothing", async () => {
  const { view, write } = mounted();

  const result = await write('kick: s("bd*2")', [{ from: 0, to: 0, insert: "x" }]);

  expect(Either.isLeft(result)).toBe(true);
  expect(view.state.doc.toString()).toBe(source);
  view.destroy();
});
