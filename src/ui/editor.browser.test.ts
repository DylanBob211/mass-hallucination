import { userEvent } from "@vitest/browser/context";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createEditor } from "./editor";
import { showProposal } from "./proposal";

const mounted = (source: string) => {
  const commands = {
    apply: vi.fn(),
    stopTransport: vi.fn(),
    setAutonomy: vi.fn(),
    accept: vi.fn(),
    acceptAndPlay: vi.fn(),
    reject: vi.fn(),
  };
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

test("Alt-1, Alt-2 and Alt-3 set the Autonomy to Propose, Write and Apply", async () => {
  const { view, commands } = mounted('s("bd")');

  await userEvent.keyboard("{Alt>}3{/Alt}{Alt>}2{/Alt}{Alt>}1{/Alt}");

  expect(commands.setAutonomy.mock.calls).toEqual([["apply"], ["write"], ["propose"]]);
  expect(view.state.doc.toString()).toBe('s("bd")');
  view.destroy();
});

test("Alt-A, Alt-P and Alt-R accept, accept & play and reject the Proposal", async () => {
  const { view, commands } = mounted('s("bd")');

  await userEvent.keyboard("{Alt>}a{/Alt}{Alt>}p{/Alt}{Alt>}r{/Alt}");

  expect(commands.accept).toHaveBeenCalledOnce();
  expect(commands.acceptAndPlay).toHaveBeenCalledOnce();
  expect(commands.reject).toHaveBeenCalledOnce();
  expect(view.state.doc.toString()).toBe('s("bd")');
  view.destroy();
});

describe("a Proposal", () => {
  const source = 'kick: s("bd*4")\nhats: s("hh*8")\nsetcps(.5)';

  test("strikes the Part's lines and shows its new text beneath them, a new Part at the end", () => {
    const { view } = mounted(source);

    view.dispatch({
      effects: showProposal.of({
        changes: [
          { part: "kick", text: 'kick: s("bd*2")', added: false },
          { part: "bass", text: 'bass: note("c2")', added: true },
        ],
        stale: false,
      }),
    });

    const struck = [...view.dom.querySelectorAll(".cm-proposal-old")].map((el) => el.textContent);
    const blocks = [...view.dom.querySelectorAll(".cm-proposal-new")].map((el) => el.textContent);
    expect(struck).toEqual(['kick: s("bd*4")']);
    expect(blocks).toEqual(['kick: s("bd*2")', 'bass: note("c2")']);
    const lines = [...view.dom.querySelectorAll(".cm-line, .cm-proposal")];
    expect(lines.map((el) => el.classList.contains("cm-proposal"))).toEqual([
      false,
      true,
      false,
      false,
      true,
    ]);
    expect(view.state.doc.toString()).toBe(source);

    view.dispatch({ effects: showProposal.of(undefined) });
    expect(view.dom.querySelectorAll(".cm-proposal, .cm-proposal-old")).toHaveLength(0);
    view.destroy();
  });

  test("shows a new Part at the end even once the human has taken its name", () => {
    const { view } = mounted(source);

    view.dispatch({
      effects: showProposal.of({
        changes: [{ part: "kick", text: 'kick: s("bd*2")', added: true }],
        stale: true,
      }),
    });

    expect(view.dom.querySelectorAll(".cm-proposal-old")).toHaveLength(0);
    const lines = [...view.dom.querySelectorAll(".cm-line, .cm-proposal")];
    expect(lines.at(-1)?.classList.contains("cm-proposal")).toBe(true);
    view.destroy();
  });

  test("offers accept, accept & play and reject as buttons that keep focus in the editor", async () => {
    const { view, commands } = mounted(source);
    view.dispatch({
      effects: showProposal.of({
        changes: [{ part: "kick", text: 'kick: s("bd*2")', added: false }],
        stale: false,
      }),
    });

    for (const button of view.dom.querySelectorAll<HTMLButtonElement>(".cm-proposal button"))
      await userEvent.click(button);

    expect(commands.accept).toHaveBeenCalledOnce();
    expect(commands.acceptAndPlay).toHaveBeenCalledOnce();
    expect(commands.reject).toHaveBeenCalledOnce();
    expect(view.hasFocus).toBe(true);
    view.destroy();
  });

  test("when Stale, is greyed out and offers only to dismiss it", () => {
    const { view } = mounted(source);

    view.dispatch({
      effects: showProposal.of({
        changes: [{ part: "kick", text: 'kick: s("bd*2")', added: false }],
        stale: true,
      }),
    });

    const block = view.dom.querySelector(".cm-proposal");
    expect(block?.classList.contains("cm-proposal-stale")).toBe(true);
    expect([...(block?.querySelectorAll("button") ?? [])].map((b) => b.textContent)).toEqual([
      "Alt-R dismiss",
    ]);
    view.destroy();
  });
});
