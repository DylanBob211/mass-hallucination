import { Duration, Effect, Layer } from "effect";
import { describe, expect, it, vi } from "vitest";
import { hangs, makeFakeEditor, makeFakeModel, makeFakeStrudel } from "../core/fakes";
import { revOf } from "../core/Performance";
import { transportPollInterval } from "../core/ViewModelStore";
import { createFacade, type ViewModel } from "./facade";

const setup = (source: string, replies: ReadonlyArray<unknown> = []) => {
  const editor = Effect.runSync(makeFakeEditor(source));
  const strudel = Effect.runSync(makeFakeStrudel());
  const model = makeFakeModel(replies);
  const facade = createFacade(Layer.mergeAll(editor.layer, strudel.layer, model.layer));
  return { editor, strudel, model, facade };
};

/** Waits out one poll of the transport on the real clock. */
const nextPoll = () =>
  new Promise((resolve) => setTimeout(resolve, 2 * Duration.toMillis(transportPollInterval)));

describe("façade", () => {
  it("publishes a stopped, immutable view model to a new subscriber", async () => {
    const { facade } = setup("");
    const received: ViewModel[] = [];

    const unsubscribe = facade.subscribe((viewModel) => received.push(viewModel));

    expect(received).toEqual([
      {
        transport: { started: false, cps: 0.5 },
        cycle: 0,
        parts: [],
        autonomy: "propose",
        turns: [],
      },
    ]);
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

  it("setAutonomy() sets where the agent's changes land, and the view model shows it", async () => {
    const { facade } = setup("");

    await facade.setAutonomy("write");
    await nextPoll();

    expect(facade.viewModel.autonomy).toBe("write");
    await facade.dispose();
  });

  it("instruct() asks the agent, and the view model shows the Proposal and the Turn landed", async () => {
    const hats = 'hats: s("hh*8")';
    const busier = 'hats: s("hh*16")';
    const { facade, model } = setup(hats, [
      { changes: [{ part: "hats", rev: revOf(hats), text: busier }] },
    ]);
    await facade.apply();

    await facade.instruct("make the hats busier", "hats");
    await nextPoll();

    expect(model.requests[0]?.snapshot.aim).toBe("hats");
    expect(facade.viewModel.proposal?.changes).toEqual([
      { part: "hats", text: busier, added: false },
    ]);
    expect(facade.viewModel.turns).toMatchObject([
      { instruction: "make the hats busier", state: "landed", landed: "proposed" },
    ]);
    await facade.dispose();
  });

  it("stop() stops the running Turn", async () => {
    const { facade, model } = setup('hats: s("hh*8")', [hangs]);

    const turn = facade.instruct("make the hats busier", null);
    await vi.waitUntil(() => facade.viewModel.turns.at(-1)?.state === "writing");
    await facade.stop();
    await turn;
    await nextPoll();

    expect(facade.viewModel.turns).toMatchObject([{ state: "stopped" }]);
    expect(model.aborted).toBe(1);
    await facade.dispose();
  });
});
