import { describe, expect, test } from "vitest";
import type { PartView } from "../facade/facade";
import { CodeViewState, shownCodeView, visualErrorOf } from "./codeView.svelte";

describe("Alt-H", () => {
  test("cycles all code, the Part in focus only, no code, and back to all", () => {
    const codeView = new CodeViewState();
    expect(codeView.chosen).toBe("all");

    const seen = [1, 2, 3].map(() => {
      codeView.cycle();
      return codeView.chosen;
    });

    expect(seen).toEqual(["focus", "none", "all"]);
  });
});

describe("the code shown", () => {
  test("is the view chosen while no Proposal is open", () => {
    expect(shownCodeView("all", false)).toBe("all");
    expect(shownCodeView("focus", false)).toBe("focus");
    expect(shownCodeView("none", false)).toBe("none");
  });

  test("reveals a Proposal, only as far as the Part in focus", () => {
    expect(shownCodeView("none", true)).toBe("focus");
    expect(shownCodeView("focus", true)).toBe("focus");
    expect(shownCodeView("all", true)).toBe("all");
  });
});

describe("the error badged on its Part", () => {
  const part = (id: string, surface: PartView["surface"]): PartView => ({
    id,
    muted: false,
    soloed: false,
    surface,
    unapplied: false,
    deleted: false,
  });
  const parts = [part("kick", "audio"), part("viz", "visual")];

  test("is a Visual Part's error", () => {
    const error = { message: "o0 froze", phase: "playback", part: "viz" } as const;
    expect(visualErrorOf(error, parts)).toEqual(error);
  });

  test("is none for an Audio Part's error, one with no Part, or none at all", () => {
    expect(visualErrorOf({ message: "x", phase: "eval", part: "kick" }, parts)).toBeUndefined();
    expect(visualErrorOf({ message: "x", phase: "playback" }, parts)).toBeUndefined();
    expect(visualErrorOf(undefined, parts)).toBeUndefined();
  });

  test("is none for a deleted Visual Part's error, since it has no label line", () => {
    const deleted = [{ ...part("viz", "visual"), deleted: true }];
    expect(visualErrorOf({ message: "x", phase: "eval", part: "viz" }, deleted)).toBeUndefined();
  });
});
