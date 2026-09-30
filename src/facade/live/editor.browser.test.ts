import { undo } from "@codemirror/commands";
import { userEvent } from "@vitest/browser/context";
import { Effect, Either } from "effect";
import type { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, test } from "vitest";
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
    instruct: () => {},
    stop: () => {},
    togglePeek: () => {},
    closePeek: () => false,
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

describe("agent-written text", () => {
  /** The text of each tinted stretch, in order. */
  const tinted = (view: EditorView) =>
    [...view.dom.querySelectorAll(".cm-agent-text")].map((el) => el.textContent);
  /** Writes `hats` as the agent would, whole, over the Source as it is. */
  const writeHats = (
    view: EditorView,
    write: ReturnType<typeof mounted>["write"],
    text: string,
  ) => {
    const current = view.state.doc.toString();
    const from = current.indexOf("hats");
    return write(current, [{ from, to: from + 'hats: s("hh*8")'.length, insert: text }]);
  };

  test("is tinted where it differs from what it replaced", async () => {
    const { view, write } = mounted();

    await writeHats(view, write, 'hats: s("hh*16").gain(.6)');

    expect(tinted(view)).toEqual(['16").gain(.6']);
    view.destroy();
  });

  test("stays tinted while the human edits another Part, and not once they edit its own", async () => {
    const { view, write } = mounted();
    await writeHats(view, write, 'hats: s("hh*16")');

    view.dispatch({ selection: { anchor: 'kick: s("bd*4"'.length } });
    await userEvent.keyboard(".fast(2)");
    expect(tinted(view)).toEqual(["16"]);

    view.dispatch({ selection: { anchor: view.state.doc.length } });
    await userEvent.keyboard(".gain(1)");
    expect(tinted(view)).toEqual([]);
    view.destroy();
  });

  test("loses its tint when the human undoes the write", async () => {
    const { view, write } = mounted();
    await writeHats(view, write, 'hats: s("hh*16")');

    undo(view);

    expect(view.state.doc.toString()).toBe(source);
    expect(tinted(view)).toEqual([]);
    view.destroy();
  });

  test("a new Part the agent adds is tinted whole", async () => {
    const { view, write } = mounted();

    await write(source, [{ from: source.length, to: source.length, insert: '\nbass: note("c2")' }]);

    expect(tinted(view)).toEqual(['bass: note("c2")']);
    view.destroy();
  });
});
