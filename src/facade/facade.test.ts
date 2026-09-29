import { describe, expect, it } from "vitest";
import { createFacade } from "./facade";

describe("façade", () => {
  it("publishes an empty, immutable view model to a new subscriber", async () => {
    const facade = createFacade();
    const received: unknown[] = [];

    const unsubscribe = facade.subscribe((viewModel) => received.push(viewModel));

    expect(received).toEqual([{}]);
    expect(Object.isFrozen(received[0])).toBe(true);
    unsubscribe();
    await facade.dispose();
  });
});
