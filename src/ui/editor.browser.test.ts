import { userEvent } from "@vitest/browser/context";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { PartView, TurnView } from "../facade/facade";
import { showAgentWork } from "./agentWork";
import { createEditor } from "./editor";
import { showProposal } from "./proposal";

const mounted = (source: string, cursor = 0) => {
  const commands = {
    apply: vi.fn(),
    stopTransport: vi.fn(),
    setAutonomy: vi.fn(),
    accept: vi.fn(),
    acceptAndPlay: vi.fn(),
    reject: vi.fn(),
    instruct: vi.fn(),
    stop: vi.fn(),
    togglePeek: vi.fn(),
    closePeek: vi.fn(() => false),
  };
  const view = createEditor(source, commands);
  document.body.append(view.dom);
  view.dispatch({ selection: { anchor: cursor } });
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

describe("an Instruction", () => {
  const source = 'kick: s("bd*4")\nhats: s("hh*8")\n\nsetcps(.5)';
  const inHats = source.indexOf("hh");
  const input = () => document.querySelector<HTMLInputElement>(".cm-instruction input");
  const aim = () => document.querySelector(".cm-instruction-aim")?.textContent;

  test("Ctrl-K opens an input under the cursor's line, aimed at the Part there", async () => {
    const { view } = mounted(source, inHats);

    await userEvent.keyboard("{Control>}k{/Control}");

    expect(document.activeElement).toBe(input());
    expect(aim()).toBe("@hats");
    const lines = [...view.dom.querySelectorAll(".cm-line, .cm-instruction")];
    expect(lines.map((el) => el.classList.contains("cm-instruction"))).toEqual([
      false,
      false,
      true,
      false,
      false,
    ]);
    view.destroy();
  });

  test("Enter sends it with its aim, closes the input and gives focus back to the editor", async () => {
    const { view, commands } = mounted(source, inHats);
    await userEvent.keyboard("{Control>}k{/Control}");

    await userEvent.keyboard("make it swing{Enter}");

    expect(commands.instruct).toHaveBeenCalledExactlyOnceWith("make it swing", "hats");
    expect(input()).toBeNull();
    expect(view.hasFocus).toBe(true);
    expect(view.state.doc.toString()).toBe(source);
    view.destroy();
  });

  test("Tab switches the aim to @all and back", async () => {
    const { view, commands } = mounted(source, inHats);
    await userEvent.keyboard("{Control>}k{/Control}");

    await userEvent.keyboard("{Tab}");
    expect(aim()).toBe("@all");
    await userEvent.keyboard("{Tab}");
    expect(aim()).toBe("@hats");
    await userEvent.keyboard("{Tab}add a bassline{Enter}");

    expect(commands.instruct).toHaveBeenCalledExactlyOnceWith("add a bassline", null);
    view.destroy();
  });

  test("on a blank line or in the Preamble it opens on @all", async () => {
    const { view } = mounted(source, source.indexOf("\n\n") + 1);
    await userEvent.keyboard("{Control>}k{/Control}");
    expect(aim()).toBe("@all");
    await userEvent.keyboard("{Escape}");

    view.dispatch({ selection: { anchor: source.indexOf("setcps") } });
    await userEvent.keyboard("{Control>}k{/Control}");
    expect(aim()).toBe("@all");
    view.destroy();
  });

  test("Esc cancels it, sending nothing, and gives focus back to the editor", async () => {
    const { view, commands } = mounted(source, inHats);
    await userEvent.keyboard("{Control>}k{/Control}");

    await userEvent.keyboard("never mind{Escape}");

    expect(commands.instruct).not.toHaveBeenCalled();
    expect(commands.stop).not.toHaveBeenCalled();
    expect(input()).toBeNull();
    expect(view.hasFocus).toBe(true);
    view.destroy();
  });

  test("Enter on an empty input sends nothing", async () => {
    const { view, commands } = mounted(source, inHats);
    await userEvent.keyboard("{Control>}k{/Control}");

    await userEvent.keyboard("  {Enter}");

    expect(commands.instruct).not.toHaveBeenCalled();
    expect(input()).toBeNull();
    view.destroy();
  });
});

test("Esc in the editor closes the open peek, and stops the running Turn only once it is closed", async () => {
  const { view, commands } = mounted('s("bd")');
  commands.closePeek.mockReturnValueOnce(true);

  await userEvent.keyboard("{Escape}");
  expect(commands.closePeek).toHaveBeenCalledOnce();
  expect(commands.stop).not.toHaveBeenCalled();

  await userEvent.keyboard("{Escape}");
  expect(commands.stop).toHaveBeenCalledOnce();
  expect(view.hasFocus).toBe(true);
  view.destroy();
});

test("Ctrl-J toggles the peek, and focus stays in the editor", async () => {
  const { view, commands } = mounted('s("bd")');

  await userEvent.keyboard("{Control>}j{/Control}");

  expect(commands.togglePeek).toHaveBeenCalledOnce();
  expect(view.state.doc.toString()).toBe('s("bd")');
  expect(view.hasFocus).toBe(true);
  view.destroy();
});

describe("the agent at work", () => {
  const source = 'kick: s("bd*4")\n// the hats\nhats: s("hh*8")\n  .gain(.6)\nsetcps(.5)';
  const turn = (state: TurnView["state"], aim: string | null): TurnView => ({
    instruction: "make it busier",
    aim,
    state,
    note: "",
    retries: 0,
  });
  const part = (id: string): PartView => ({
    id,
    muted: false,
    soloed: false,
    surface: "audio",
    unapplied: false,
    deleted: false,
  });
  const parts = [part("kick"), part("hats")];

  test("streams its change as a dashed block under the Part, a new Part at the end", () => {
    const { view } = mounted(source);

    view.dispatch({
      effects: showAgentWork.of({
        turn: turn("writing", "hats"),
        draft: [
          { part: "hats", text: 'hats: s("hh*16")' },
          { part: "bass", text: "bass: n" },
        ],
        parts,
      }),
    });

    const blocks = [...view.dom.querySelectorAll(".cm-draft")];
    expect(blocks.map((el) => el.textContent)).toEqual(['hats: s("hh*16")', "bass: n"]);
    const order = [...view.dom.querySelectorAll(".cm-line, .cm-draft")].map((el) =>
      el.classList.contains("cm-draft") ? "draft" : "line",
    );
    expect(order).toEqual(["line", "line", "line", "line", "draft", "line", "draft"]);
    expect(view.state.doc.toString()).toBe(source);

    view.dispatch({
      effects: showAgentWork.of({ turn: turn("stopped", "hats"), draft: undefined, parts }),
    });
    expect(view.dom.querySelectorAll(".cm-draft")).toHaveLength(0);
    view.destroy();
  });

  test("badges the label line of the Part it is aimed at while the Turn runs", () => {
    const { view } = mounted(source);
    const badged = () =>
      [...view.dom.querySelectorAll(".cm-line")]
        .filter((line) => line.querySelector(".cm-agent-badge") !== null)
        .map((line) => line.textContent.replace(/agent at work$/, ""));

    view.dispatch({
      effects: showAgentWork.of({ turn: turn("thinking", "hats"), draft: undefined, parts }),
    });
    expect(badged()).toEqual(['hats: s("hh*8")']);

    view.dispatch({
      effects: showAgentWork.of({ turn: turn("landed", "hats"), draft: undefined, parts }),
    });
    expect(badged()).toEqual([]);
    view.destroy();
  });

  test("once it writes, badges the Parts its change touches instead", () => {
    const { view } = mounted(source);

    view.dispatch({
      effects: showAgentWork.of({
        turn: turn("writing", null),
        draft: [
          { part: "kick", text: "kick: s(" },
          { part: "bass", text: "" },
        ],
        parts,
      }),
    });

    const badges = [...view.dom.querySelectorAll(".cm-line .cm-agent-badge")];
    expect(badges.map((badge) => badge.closest(".cm-line")?.firstChild?.textContent)).toEqual([
      'kick: s("bd*4")',
    ]);
    view.destroy();
  });

  test("shows a deleted Part still sounding as a struck-through ghost at the end", () => {
    const { view } = mounted(source);

    view.dispatch({
      effects: showAgentWork.of({
        turn: undefined,
        draft: undefined,
        parts: [
          ...parts,
          { ...part("bass"), unapplied: true, deleted: true, live: 'bass: note("c2")' },
        ],
      }),
    });

    const lines = [...view.dom.querySelectorAll(".cm-line, .cm-ghost")];
    expect(lines.at(-1)?.classList.contains("cm-ghost")).toBe(true);
    expect(lines.at(-1)?.textContent).toBe('bass: note("c2")');

    view.dispatch({ effects: showAgentWork.of({ turn: undefined, draft: undefined, parts }) });
    expect(view.dom.querySelectorAll(".cm-ghost")).toHaveLength(0);
    view.destroy();
  });
});
