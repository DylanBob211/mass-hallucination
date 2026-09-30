import { describe, expect, test } from "vitest";
import type { TurnView } from "../facade/facade";
import { PeekState } from "./peekState.svelte";

const asked: TurnView = {
  instruction: "is the kick too loud?",
  aim: null,
  state: "thinking",
  note: "",
  retries: 0,
};
const answered: TurnView = { ...asked, state: "answered", note: "No." };

describe("the peek", () => {
  test("is closed until toggled, and toggles closed again", () => {
    const peek = new PeekState();
    expect(peek.open).toBe(false);

    peek.toggle();
    expect(peek.open).toBe(true);
    peek.toggle();
    expect(peek.open).toBe(false);
  });

  test("closing says whether it was open", () => {
    const peek = new PeekState();
    expect(peek.close()).toBe(false);

    peek.toggle();
    expect(peek.close()).toBe(true);
    expect(peek.open).toBe(false);
  });

  test("opens itself when the latest Turn answers in words, once for each answer", () => {
    const peek = new PeekState();

    peek.see([asked]);
    expect(peek.open).toBe(false);
    peek.see([answered]);
    expect(peek.open).toBe(true);

    peek.close();
    peek.see([answered]);
    expect(peek.open).toBe(false);
    peek.see([answered, { ...asked, state: "landed" }]);
    expect(peek.open).toBe(false);
    peek.see([answered, answered]);
    expect(peek.open).toBe(true);
  });
});
