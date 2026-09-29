import { Duration, Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { makeFakeEditor, makeFakeStrudel } from "../core/fakes";
import { transportPollInterval } from "../core/ViewModelStore";
import { createFacade, type ViewModel } from "./facade";

const setup = (source: string) => {
  const editor = Effect.runSync(makeFakeEditor(source));
  const strudel = Effect.runSync(makeFakeStrudel());
  const facade = createFacade(Layer.merge(editor.layer, strudel.layer));
  return { editor, strudel, facade };
};

/** Waits out one poll of the transport on the real clock. */
const nextPoll = () =>
  new Promise((resolve) => setTimeout(resolve, 2 * Duration.toMillis(transportPollInterval)));

describe("façade", () => {
  it("publishes a stopped, immutable view model to a new subscriber", async () => {
    const { facade } = setup("");
    const received: ViewModel[] = [];

    const unsubscribe = facade.subscribe((viewModel) => received.push(viewModel));

    expect(received).toEqual([{ transport: { started: false, cps: 0.5 }, cycle: 0, parts: [] }]);
    expect(Object.isFrozen(received[0])).toBe(true);
    unsubscribe();
    await facade.dispose();
  });

  it("apply() evaluates the Source and the view model shows the transport running", async () => {
    const { strudel, facade } = setup('s("bd*4")');

    await facade.apply();
    await nextPoll();

    expect(strudel.evaluated).toEqual(['s("bd*4")']);
    expect(facade.viewModel.transport.started).toBe(true);
    await facade.dispose();
  });

  it("stopTransport() stops it again", async () => {
    const { facade } = setup('s("bd*4")');
    await facade.apply();

    await facade.stopTransport();
    await nextPoll();

    expect(facade.viewModel.transport.started).toBe(false);
    await facade.dispose();
  });

  it("apply() resolves when evaluation fails, leaving the transport as it was", async () => {
    const { strudel, facade } = setup("s(");
    Effect.runSync(strudel.failWith("Unexpected token"));

    await facade.apply();
    await nextPoll();

    expect(facade.viewModel.transport.started).toBe(false);
    await facade.dispose();
  });

  it("apply(scope) applies only those Parts, and the view model shows the rest Unapplied", async () => {
    const { editor, strudel, facade } = setup('kick: s("bd*4")\nhats: s("hh*8")');
    await facade.apply();
    Effect.runSync(editor.type('kick: s("bd*2")\nhats: s("hh*16")'));

    await facade.apply(["hats"]);
    await nextPoll();

    expect(strudel.evaluated[1]).toBe('kick: s("bd*4")\nhats: s("hh*16")');
    expect(facade.viewModel.parts.map((p) => [p.id, p.unapplied])).toEqual([
      ["kick", true],
      ["hats", false],
    ]);
    await facade.dispose();
  });
});
