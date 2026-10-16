import type { EditorView } from "@codemirror/view";
import { userEvent } from "@vitest/browser/context";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { PartView, TurnView } from "../facade/facade";
import { showAgentWork } from "./agentWork";
import { createEditor } from "./editor";
import { showCodeView, showVisualError } from "./overVisuals";
import { showProposal } from "./proposal";
// The colour tokens the editor theme reads.
import "../app.css";

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
    downloadLog: vi.fn(),
    cycleCodeView: vi.fn(),
    showFormatRefusal: vi.fn(),
  };
  const view = createEditor(source, commands);
  document.body.append(view.dom);
  view.dispatch({ selection: { anchor: cursor } });
  view.focus();
  return { view, commands };
};

/** A line's own text, without the widgets on it. */
const sourceText = (line: Element | null | undefined) =>
  [...(line?.childNodes ?? [])]
    .filter((node) => !(node instanceof HTMLElement && node.contentEditable === "false"))
    .map((node) => node.textContent)
    .join("");

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

describe("a Format", () => {
  const long = `kick: s("bd*4").bank('RolandTR909').gain(.9).room(0.3).lpf(sine.range(200,2000).slow(4))`;

  test("Shift-Alt-F lays out the Source, the cursor kept on its code, as one undo step", async () => {
    const { view } = mounted(long, long.indexOf("room"));

    await userEvent.keyboard("{Shift>}{Alt>}F{/Alt}{/Shift}");

    const formatted = `kick: s("bd*4")
  .bank('RolandTR909')
  .gain(0.9)
  .room(0.3)
  .lpf(sine.range(200, 2000).slow(4))
`;
    await expect.poll(() => view.state.doc.toString()).toBe(formatted);
    expect(view.state.selection.main.head).toBe(formatted.indexOf("room"));
    expect(view.hasFocus).toBe(true);
    await userEvent.keyboard("{Control>}z{/Control}");
    expect(view.state.doc.toString()).toBe(long);
    view.destroy();
  });

  test("a refused Format leaves the Source as it is, and says why until the next edit", async () => {
    const { view, commands } = mounted('kick: s("bd*4").gain(');

    await userEvent.keyboard("{Shift>}{Alt>}F{/Alt}{/Shift}");

    await expect
      .poll(() => commands.showFormatRefusal.mock.calls)
      .toEqual([["syntax error at line 1"]]);
    expect(view.state.doc.toString()).toBe('kick: s("bd*4").gain(');
    await userEvent.keyboard("1");
    expect(commands.showFormatRefusal.mock.calls).toEqual([
      ["syntax error at line 1"],
      [undefined],
    ]);
    view.destroy();
  });
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

test("Alt-L downloads the instrumentation log, and focus stays in the editor", async () => {
  const { view, commands } = mounted('s("bd")');

  await userEvent.keyboard("{Alt>}l{/Alt}");

  expect(commands.downloadLog).toHaveBeenCalledOnce();
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
    expect(badges.map((badge) => sourceText(badge.closest(".cm-line")))).toEqual([
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

describe("over the visuals", () => {
  const source =
    'kick: s("bd*4")\n// the hats\nhats: s("hh*8")\n  .gain(.6)\nviz: hydra`osc().out()`';
  const lineTexts = (view: EditorView, selector: string) =>
    [...view.dom.querySelectorAll(selector)].map(sourceText);
  const banded = (view: EditorView) => lineTexts(view, ".cm-line.cm-focus-line");
  const turn = (state: TurnView["state"], aim: string | null): TurnView => ({
    instruction: "make it busier",
    aim,
    state,
    note: "",
    retries: 0,
  });

  test("the cursor's Part sits on a full-width band, and the band follows the cursor", () => {
    const { view } = mounted(source, source.indexOf("gain"));
    expect(banded(view)).toEqual(["// the hats", 'hats: s("hh*8")', "  .gain(.6)"]);

    view.dispatch({ selection: { anchor: 0 } });
    expect(banded(view)).toEqual(['kick: s("bd*4")']);
    view.destroy();
  });

  test("the band is as wide as the editor, every other line's box only as wide as its text", () => {
    const { view } = mounted(source, 0);
    const width = (text: string) =>
      [...view.dom.querySelectorAll<HTMLElement>(".cm-line")]
        .find((line) => line.textContent === text)
        ?.getBoundingClientRect().width;

    expect(width('kick: s("bd*4")')).toBe(view.contentDOM.getBoundingClientRect().width);
    expect(width("  .gain(.6)")).toBeLessThan(width('kick: s("bd*4")') ?? 0);
    expect(getComputedStyle(view.dom).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    view.destroy();
  });

  test("while a Turn runs or a Proposal is open, the band is on the Parts the agent works on", () => {
    const { view } = mounted(source, 0);

    view.dispatch({
      effects: showAgentWork.of({ turn: turn("thinking", "viz"), draft: undefined, parts: [] }),
    });
    expect(banded(view)).toEqual(["viz: hydra`osc().out()`"]);

    view.dispatch({
      effects: [
        showAgentWork.of({ turn: turn("landed", "viz"), draft: undefined, parts: [] }),
        showProposal.of({
          changes: [
            { part: "hats", text: 'hats: s("hh*16")', added: false },
            { part: "viz", text: "viz: hydra`osc(2).out()`", added: false },
          ],
          stale: false,
        }),
      ],
    });
    expect(banded(view)).toEqual([
      "// the hats",
      'hats: s("hh*8")',
      "  .gain(.6)",
      "viz: hydra`osc().out()`",
    ]);

    view.dispatch({ effects: showProposal.of(undefined) });
    expect(banded(view)).toEqual(['kick: s("bd*4")']);
    view.destroy();
  });

  test("Alt-H cycles the code view, and focus stays in the editor", async () => {
    const { view, commands } = mounted(source);

    await userEvent.keyboard("{Alt>}h{/Alt}");

    expect(commands.cycleCodeView).toHaveBeenCalledOnce();
    expect(view.state.doc.toString()).toBe(source);
    expect(view.hasFocus).toBe(true);
    view.destroy();
  });

  test("with the Part in focus only, the other lines and the ghosts are hidden", () => {
    const { view } = mounted(source, 0);
    view.dispatch({
      effects: [
        showCodeView.of("focus"),
        showAgentWork.of({
          turn: undefined,
          draft: undefined,
          parts: [
            {
              id: "bass",
              muted: false,
              soloed: false,
              surface: "audio",
              unapplied: true,
              deleted: true,
              live: 'bass: note("c2")',
            },
          ],
        }),
      ],
    });

    const visible = [...view.dom.querySelectorAll(".cm-line, .cm-ghost")]
      .filter((el) => getComputedStyle(el).visibility === "visible")
      .map((el) => el.textContent);
    expect(visible).toEqual(['kick: s("bd*4")']);
    view.destroy();
  });

  test("with no code, nothing shows, yet keys still work and focus stays in the editor", async () => {
    const { view, commands } = mounted(source, 0);
    view.dispatch({ effects: showCodeView.of("none") });

    const visible = [...view.dom.querySelectorAll(".cm-line, .cm-cursor")].filter(
      (el) => getComputedStyle(el).visibility === "visible",
    );
    expect(visible).toEqual([]);

    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(commands.apply).toHaveBeenCalledOnce();
    expect(view.hasFocus).toBe(true);

    view.dispatch({ effects: showCodeView.of("all") });
    expect(lineTexts(view, ".cm-line")).toHaveLength(5);
    expect(
      [...view.dom.querySelectorAll(".cm-line")].every(
        (el) => getComputedStyle(el).visibility === "visible",
      ),
    ).toBe(true);
    view.destroy();
  });

  test("a Visual Part's error is a badge on its label line", () => {
    const { view } = mounted(source, 0);
    const badges = () =>
      [...view.dom.querySelectorAll(".cm-error-badge")].map((badge) => [
        sourceText(badge.closest(".cm-line")),
        badge.textContent,
      ]);

    view.dispatch({
      effects: showVisualError.of({ message: "o0 froze", phase: "playback", part: "viz" }),
    });
    expect(badges()).toEqual([["viz: hydra`osc().out()`", "✕ playing"]]);

    view.dispatch({ effects: showVisualError.of(undefined) });
    expect(badges()).toEqual([]);
    view.destroy();
  });
});

describe("syntax highlighting", () => {
  const source = [
    'kick: s("bd*2 ~").gain(.8)',
    "_hats: s('hh')",
    'viz: hydra`osc(10).color("red").scale(pulse("kick")).out()`',
  ].join("\n");
  const colourOf = (view: EditorView, selector: string, text: string) => {
    const span = [...view.dom.querySelectorAll(selector)].find((el) => el.textContent === text);
    if (span === undefined) throw new Error(`no ${selector} reading ${text}`);
    return getComputedStyle(span).color;
  };

  test("colours labels, keywords, functions, Mini-notation, strings and link helpers apart", () => {
    const { view } = mounted(`const x = 1\n${source}`);
    const fg = getComputedStyle(view.contentDOM).color;

    const colours = [
      colourOf(view, ".cm-t-label", "kick"),
      colourOf(view, ".cm-t-keyword", "const"),
      colourOf(view, ".cm-t-function", "osc"),
      colourOf(view, ".cm-t-mini-word", "bd"),
      colourOf(view, ".cm-t-mini-structure", "*"),
      colourOf(view, ".cm-t-mini-rest", "~"),
      colourOf(view, ".cm-t-string", '"red"'),
      colourOf(view, ".cm-link-helper", "pulse"),
    ];
    expect(new Set([...colours, fg]).size).toBe(colours.length + 1);
    view.destroy();
  });

  test("dims a muted Part's body but not its label", () => {
    const { view } = mounted(source);
    const opacityOf = (text: string) => {
      const span = [...view.contentDOM.querySelectorAll("span")].find(
        (el) => el.textContent === text,
      );
      if (span === undefined) throw new Error(`no span reading ${text}`);
      return Number(getComputedStyle(span).opacity);
    };

    expect(opacityOf("_hats")).toBe(1);
    expect(opacityOf("'hh'")).toBeLessThan(1);
    expect(opacityOf("kick")).toBe(1);
    view.destroy();
  });

  test("colours the agent's draft, ghost and Proposal like the Source", () => {
    const { view } = mounted(source);
    const part = (id: string): PartView => ({
      id,
      muted: false,
      soloed: false,
      surface: "audio",
      unapplied: false,
      deleted: false,
    });

    view.dispatch({
      effects: [
        showAgentWork.of({
          turn: undefined,
          draft: [{ part: "kick", text: 'kick: s("sd")' }],
          parts: [part("kick"), { ...part("bass"), deleted: true, live: 'bass: note("c2")' }],
        }),
        showProposal.of({
          changes: [{ part: "kick", text: 'kick: s("cp")', added: false }],
          stale: false,
        }),
      ],
    });

    const words = (block: string) =>
      [...view.dom.querySelectorAll(`${block} .cm-t-mini-word`)].map((el) => el.textContent);
    expect(words(".cm-draft")).toEqual(["sd"]);
    expect(words(".cm-ghost")).toEqual(["c2"]);
    expect(words(".cm-proposal-new")).toEqual(["cp"]);
    view.destroy();
  });
});
