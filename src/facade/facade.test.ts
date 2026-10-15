import { Duration, Effect, Layer } from "effect";
import { describe, expect, it, vi } from "vitest";
import type { Log } from "../core/Instrumentation";
import { hangs, makeFakeEditor, makeFakeModel, makeFakePage, makeFakeStrudel } from "../core/fakes";
import { revOf } from "../core/Performance";
import { transportPollInterval } from "../core/ViewModelStore";
import { createFacade, type ViewModel } from "./facade";

const setup = (source: string, replies: ReadonlyArray<unknown> = []) => {
  const editor = Effect.runSync(makeFakeEditor(source));
  const strudel = Effect.runSync(makeFakeStrudel());
  const model = makeFakeModel(replies);
  const page = Effect.runSync(makeFakePage());
  const facade = createFacade(Layer.mergeAll(editor.layer, strudel.layer, model.layer, page.layer));
  return { editor, strudel, model, page, facade };
};

/** The log `facade` hands over once `until` holds of it, as what it records may come later. */
const logOnce = async (
  { page, facade }: Pick<ReturnType<typeof setup>, "page" | "facade">,
  until: (log: Partial<Log>) => boolean,
) => {
  const latest = () => JSON.parse(page.downloads.at(-1)?.text ?? "{}") as Partial<Log>;
  await vi.waitUntil(async () => {
    await facade.downloadLog();
    return until(latest());
  });
  return latest();
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

  it("downloadLog() hands over the log as JSON, each stall marked by whether a Turn ran", async () => {
    const { strudel, page, facade } = setup('hats: s("hh*8")', [hangs]);
    await facade.apply();
    const before = Date.now() - 10_000;
    Effect.runSync(page.longTask(before, 80));
    Effect.runSync(strudel.noteLate(before + 5, 12));

    const turn = facade.instruct("make the hats busier", "hats");
    await vi.waitUntil(() => facade.viewModel.turns.at(-1)?.state === "writing");
    // Began before Enter, ran into the Turn.
    Effect.runSync(page.longTask(before + 9_000, 2_000));
    Effect.runSync(strudel.noteLate(Date.now(), 30));
    await facade.stop();
    await turn;
    await facade.downloadLog();

    expect(page.downloads).toHaveLength(1);
    const [{ name, text }] = page.downloads as [{ name: string; text: string }];
    expect(name).toMatch(/^mass-hallucination-log-.+\.json$/);
    const log = JSON.parse(text) as Record<string, unknown>;
    expect(log["turns"]).toMatchObject([
      { instruction: "make the hats busier", aim: "hats", ending: "stopped", calls: 1 },
    ]);
    expect(log["longTasks"]).toEqual([
      { at: before, duration: 80, duringTurn: false },
      { at: before + 9_000, duration: 2_000, duringTurn: true },
    ]);
    expect(log["lateNotes"]).toMatchObject([
      { at: before + 5, lateBy: 12, duringTurn: false },
      { lateBy: 30, duringTurn: true },
    ]);
    await facade.dispose();
  });
  it("downloadLog() has the frame times of the second after each Apply, with its Visual Parts", async () => {
    const { editor, page, facade } = setup('kick: s("bd*4")');
    Effect.runSync(page.drawFrames([16.7, 16.6, 50, 16.7, 116.6], 16.7));
    await facade.apply();
    Effect.runSync(
      editor.type(
        'kick: s("bd*4")\n' +
          "flash: hydra`osc().out()`\n" +
          "_muted: hydra`noise().out(o1)`\n" +
          "glow: hydra`shape().out(o2)`",
      ),
    );
    const applied = Date.now();
    await facade.apply();
    const log = await logOnce({ page, facade }, ({ frameTimes }) => frameTimes?.length === 2);

    const { frameTimes } = log;
    expect(frameTimes).toMatchObject([
      { visualParts: 0, frames: [16.7, 16.6, 50, 16.7, 116.6], longest: 116.6, dropped: 8 },
      { visualParts: 2, frames: [16.7, 16.6, 50, 16.7, 116.6], longest: 116.6, dropped: 8 },
    ]);
    expect(frameTimes?.[1]?.at).toBeGreaterThanOrEqual(applied);
    await facade.dispose();
  });

  it("downloadLog() counts frames dropped by the display's rate before the Apply", async () => {
    const { page, facade } = setup("flash: hydra`osc().out()`");
    // A 60 Hz display falling to a steady 30 fps.
    Effect.runSync(page.drawFrames([33.4, 33.4, 33.4, 33.4], 16.7));
    await facade.apply();
    const log = await logOnce({ page, facade }, ({ frameTimes }) => frameTimes?.length === 1);

    expect(log.frameTimes).toMatchObject([{ longest: 33.4, dropped: 4 }]);
    await facade.dispose();
  });

  it("downloadLog() counts only the soloed Visual Parts while one is, and no failed Apply", async () => {
    const { editor, strudel, page, facade } = setup(
      "a: hydra`osc().out()`\nb: hydra`noise().out(o1)`\nc: hydra`shape().out(o2)`",
    );
    Effect.runSync(strudel.failWith("Unexpected token"));
    await facade.apply();
    Effect.runSync(strudel.succeed);
    Effect.runSync(
      editor.type("a: hydra`osc().out()`\nSb: hydra`noise().out(o1)`\nc: hydra`shape().out(o2)`"),
    );
    await facade.apply();
    const log = await logOnce({ page, facade }, ({ frameTimes }) => frameTimes?.length === 1);

    expect(log).toMatchObject({ frameTimes: [{ visualParts: 1 }] });
    await facade.dispose();
  });

  it("downloadLog() has each onset-to-flash estimate", async () => {
    const { strudel, page, facade } = setup("");
    const sync = { at: Date.now(), lead: 104, outputLatency: 88, baseLatency: 12, onsetToFlash: 9 };
    Effect.runSync(strudel.synced(sync));
    const log = await logOnce({ page, facade }, ({ syncs }) => syncs?.length === 1);

    expect(log.syncs).toEqual([sync]);
    await facade.dispose();
  });
});
