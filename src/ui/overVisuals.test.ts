import { describe, expect, test } from "vitest";
import { locateUnits, type ProposalView, type TurnView } from "../facade/facade";
import { inFocus } from "./overVisuals";

describe("the Parts in focus", () => {
  const source = 'kick: s("bd*4")\nhats: s("hh*8")\n\nsetcps(.5)\nviz: hydra`osc().out()`';
  const inKick = source.indexOf("bd");
  const turn = (state: TurnView["state"], aim: string | null): TurnView => ({
    instruction: "make it busier",
    aim,
    state,
    note: "",
    retries: 0,
  });
  const proposal = (...parts: ReadonlyArray<string>): ProposalView => ({
    changes: parts.map((part) => ({ part, text: `${part}: s("x")`, added: false })),
    stale: false,
  });
  const units = locateUnits(source);
  const idle = { turn: undefined, draft: undefined, proposal: undefined };

  test("are the cursor's Part while the agent is idle", () => {
    expect(inFocus(units, inKick, idle)).toEqual(["kick"]);
    expect(inFocus(units, source.indexOf("osc"), idle)).toEqual(["viz"]);
  });

  test("are none with the cursor in the Preamble or between Parts", () => {
    expect(inFocus(units, source.indexOf("setcps"), idle)).toEqual([]);
    expect(inFocus(units, source.indexOf("\n\n") + 1, idle)).toEqual([]);
  });

  test("are the Part a running Turn was asked at, until its draft names some", () => {
    expect(inFocus(units, inKick, { ...idle, turn: turn("thinking", "hats") })).toEqual(["hats"]);
    expect(
      inFocus(units, inKick, {
        ...idle,
        turn: turn("writing", "hats"),
        draft: [
          { part: "viz", text: "viz: hy" },
          { part: "(preamble)", text: "setcps(1)" },
        ],
      }),
    ).toEqual(["viz", "(preamble)"]);
  });

  test("pass over a draft's new Parts, for the Turn's aim or else the cursor's Part", () => {
    const draft = [{ part: "bass", text: "bass: n" }];
    expect(inFocus(units, inKick, { ...idle, turn: turn("writing", "hats"), draft })).toEqual([
      "hats",
    ]);
    expect(inFocus(units, inKick, { ...idle, turn: turn("writing", null), draft })).toEqual([
      "kick",
    ]);
  });

  test("are every Part in the Source the open Proposal changes, once no Turn runs", () => {
    expect(
      inFocus(units, inKick, { ...idle, proposal: proposal("bass", "viz", "(preamble)") }),
    ).toEqual(["viz", "(preamble)"]);
    expect(
      inFocus(units, inKick, { ...idle, turn: turn("landed", "hats"), proposal: proposal("hats") }),
    ).toEqual(["hats"]);
    expect(
      inFocus(units, inKick, {
        ...idle,
        turn: turn("thinking", "viz"),
        proposal: proposal("hats"),
      }),
    ).toEqual(["viz"]);
  });
});
