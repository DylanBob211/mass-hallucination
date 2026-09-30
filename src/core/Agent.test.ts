import { describe, expect, it } from "@effect/vitest";
import { Effect, Fiber, Layer, Stream, TestClock } from "effect";
import { Agent } from "./Agent";
import { AgentApplies } from "./AgentApplies";
import { apply } from "./apply";
import { AutonomyStore } from "./AutonomyStore";
import { ErrorSlotStore } from "./ErrorSlotStore";
import {
  answers,
  fails,
  hangs,
  hangsWriting,
  makeFakeEditor,
  makeFakeModel,
  makeFakeStrudel,
} from "./fakes";
import { LiveCodeStore } from "./LiveCodeStore";
import type { DraftChange } from "./draft";
import { revOf } from "./Performance";
import { ProposalStore } from "./ProposalStore";
import type { Autonomy, TurnState } from "./viewModel";

const seed = `samples('github:tidalcycles/dirt-samples')
setcps(0.5)
kick: s("bd*4")
hats: s("hh*8").gain(.6)
chords: note("<c3 eb3 g3 bb3>").s("sawtooth").lpf(800)`;

const hats = 'hats: s("hh*8").gain(.6)';
const busier = 'hats: s("hh*16").swingBy(1/3, 4).gain(.6)';

/** A `change_parts` input changing `hats` from the text it had at `rev` to `busier`. */
const changeHats = (rev = revOf(hats)) => ({ changes: [{ part: "hats", rev, text: busier }] });

/** The seed Performance, Applied, at `autonomy`, with the agent over a fake Model replaying `replies`. */
const setup = (autonomy: Autonomy, replies: ReadonlyArray<unknown>) =>
  Effect.gen(function* () {
    const editor = yield* makeFakeEditor(seed);
    const strudel = yield* makeFakeStrudel();
    const model = makeFakeModel(replies);
    const context = yield* Layer.build(
      Agent.layer.pipe(
        Layer.provideMerge(ProposalStore.layer),
        Layer.provideMerge(AgentApplies.layer),
        Layer.provideMerge(AutonomyStore.layer),
        Layer.provideMerge(LiveCodeStore.layer),
        Layer.provideMerge(ErrorSlotStore.layer),
        Layer.provideMerge(Layer.mergeAll(editor.layer, strudel.layer, model.layer)),
      ),
    );
    yield* Effect.provide(apply(), context);
    yield* Effect.provide(
      Effect.flatMap(AutonomyStore, (store) => store.set(autonomy)),
      context,
    );
    const agent = Effect.provide(Agent, context);
    const instruct = (instruction: string, aim: string | null = null) =>
      Effect.flatMap(agent, (a) => a.instruct(instruction, aim));
    const turns = Effect.flatMap(agent, (a) => a.turns);
    const stop = Effect.flatMap(agent, (a) => a.stop);
    /** Waits until the latest Turn is `state`. */
    const reaches = (state: TurnState) =>
      Effect.flatMap(agent, (a) =>
        a.changes.pipe(
          Stream.filter((all) => all.at(-1)?.state === state),
          Stream.runHead,
        ),
      );
    /** Every draft the agent has shown, the first being none. */
    const drafts: Array<ReadonlyArray<DraftChange> | undefined> = [];
    yield* Effect.forkScoped(
      Stream.runForEach(Stream.unwrap(Effect.map(agent, (a) => a.drafts)), (draft) =>
        Effect.sync(() => drafts.push(draft)),
      ),
    );
    yield* Effect.yieldNow();
    return { editor, strudel, model, instruct, turns, stop, reaches, drafts };
  });

describe("Agent", () => {
  it.scoped("a Turn whose change lands ends landed, with the note the model wrote first", () =>
    Effect.gen(function* () {
      const { editor, instruct, turns } = yield* setup("write", [changeHats()]);

      yield* instruct("make the hats busier and swing it", "hats");

      expect(yield* turns).toEqual([
        {
          instruction: "make the hats busier and swing it",
          aim: "hats",
          state: "landed",
          landed: "written",
          note: "Changing it.",
          retries: 0,
        },
      ]);
      expect(yield* editor.read).toContain(busier);
    }),
  );

  it.scoped("a landed Turn keeps the dry-run's warnings", () =>
    Effect.gen(function* () {
      const { strudel, instruct, turns } = yield* setup("write", [changeHats()]);
      yield* strudel.warnDryRun("size and roomsize both set", (code) => code.indexOf("hh*16"));

      yield* instruct("make the hats busier");

      expect(yield* turns).toMatchObject([
        { state: "landed", warnings: ["hats: size and roomsize both set"] },
      ]);
    }),
  );

  it.scoped("the snapshot it sends is the Performance as asked, with the aim", () =>
    Effect.gen(function* () {
      const { model, instruct } = yield* setup("write", [changeHats()]);

      yield* instruct("make the hats busier", "hats");

      const [request] = model.requests;
      expect(request?.instruction).toBe("make the hats busier");
      expect(request?.retries).toEqual([]);
      expect(request?.snapshot.source).toBe(seed);
      expect(request?.snapshot.aim).toBe("hats");
      expect(request?.snapshot.transport.started).toBe(true);
    }),
  );

  it.scoped(
    "a Turn whose model answers in words ends answered, with the answer, changing nothing",
    () =>
      Effect.gen(function* () {
        const { editor, strudel, instruct, turns } = yield* setup("apply", [
          answers("The hats are already busy."),
        ]);

        yield* instruct("are the hats busy?");

        expect(yield* turns).toMatchObject([
          { state: "answered", note: "The hats are already busy.", retries: 0 },
        ]);
        expect(yield* editor.read).toBe(seed);
        expect(strudel.evaluated).toHaveLength(1);
      }),
  );

  it.scoped("a refused change is retried with the call and its refusal, and counted", () =>
    Effect.gen(function* () {
      const stale = changeHats(revOf('hats: s("hh*4")'));
      const { editor, model, instruct, turns } = yield* setup("write", [stale, changeHats()]);

      yield* instruct("make the hats busier");

      expect(yield* turns).toMatchObject([{ state: "landed", landed: "written", retries: 1 }]);
      expect(yield* editor.read).toContain(busier);
      const retry = model.requests[1];
      expect(retry?.snapshot).toBe(model.requests[0]?.snapshot);
      expect(retry?.retries).toEqual([
        {
          call: { _tag: "ToolCall", input: stale, reply: { input: stale } },
          result: { ok: false, reason: "stale", part: "hats", rev: revOf(hats), text: hats },
        },
      ]);
    }),
  );

  it.scoped("the fourth refusal ends the Turn out of retries, having landed nothing", () =>
    Effect.gen(function* () {
      const stale = changeHats("00000000");
      const { editor, model, instruct, turns } = yield* setup("write", [
        stale,
        stale,
        stale,
        stale,
        changeHats(),
      ]);

      yield* instruct("make the hats busier");

      expect(yield* turns).toMatchObject([{ state: "out of retries", retries: 3 }]);
      expect(model.requests).toHaveLength(4);
      expect(yield* editor.read).toBe(seed);
    }),
  );

  it.scoped("a model or network error ends the Turn failed, with the message", () =>
    Effect.gen(function* () {
      const { instruct, turns } = yield* setup("write", [fails("Overloaded")]);

      yield* instruct("make the hats busier");

      expect(yield* turns).toMatchObject([{ state: "failed", error: "Overloaded" }]);
    }),
  );

  it.scoped("stopping a Turn aborts the model's stream and ends it stopped, landing nothing", () =>
    Effect.gen(function* () {
      const { editor, model, instruct, turns, stop, reaches } = yield* setup("apply", [hangs]);
      const running = yield* Effect.fork(instruct("make the hats busier"));
      yield* reaches("writing");

      yield* stop;
      yield* Fiber.join(running);

      expect(yield* turns).toMatchObject([{ state: "stopped", note: "Working on it." }]);
      expect(model.aborted).toBe(1);
      expect(yield* editor.read).toBe(seed);
    }),
  );

  it.scoped("stopping after a change landed leaves the Turn landed and the change in place", () =>
    Effect.gen(function* () {
      const { editor, instruct, turns, stop } = yield* setup("write", [changeHats()]);
      yield* instruct("make the hats busier");

      yield* stop;

      expect(yield* turns).toMatchObject([{ state: "landed" }]);
      expect(yield* editor.read).toContain(busier);
    }),
  );

  it.scoped("while it writes, the draft shows the tool input so far; stopping drops it", () =>
    Effect.gen(function* () {
      const { instruct, stop, reaches, drafts } = yield* setup("write", [
        hangsWriting('{"changes":[{"part":"hats","rev":"x","text":"hats: s(\\"hh'),
      ]);
      const running = yield* Effect.fork(instruct("make the hats busier"));
      yield* reaches("writing");

      expect(drafts.at(-1)).toEqual([{ part: "hats", text: 'hats: s("hh' }]);

      yield* stop;
      yield* Fiber.join(running);

      expect(drafts.at(-1)).toBeUndefined();
    }),
  );

  it.scoped("the draft goes once the change lands, and between a refusal and its retry", () =>
    Effect.gen(function* () {
      const stale = changeHats(revOf('hats: s("hh*4")'));
      const { instruct, drafts } = yield* setup("write", [stale, changeHats()]);

      yield* instruct("make the hats busier");

      const draft = [{ part: "hats", text: busier }];
      expect(drafts).toEqual([undefined, draft, undefined, draft, undefined]);
    }),
  );

  it.scoped("a new Instruction supersedes the running Turn, which lands nothing", () =>
    Effect.gen(function* () {
      const { editor, model, instruct, turns, reaches } = yield* setup("write", [
        hangs,
        changeHats(),
      ]);
      const first = yield* Effect.fork(instruct("add a bassline"));
      yield* reaches("writing");

      yield* instruct("make the hats busier", "hats");
      yield* Fiber.join(first);

      expect(yield* turns).toMatchObject([
        { instruction: "add a bassline", state: "superseded" },
        { instruction: "make the hats busier", state: "landed" },
      ]);
      expect(model.aborted).toBe(1);
      expect(model.requests[1]?.retries).toEqual([]);
      expect(yield* editor.read).toContain(busier);
    }),
  );

  it.scoped("a Turn that runs 60 seconds times out, aborting the stream", () =>
    Effect.gen(function* () {
      const { model, instruct, turns, reaches } = yield* setup("write", [hangs]);
      const running = yield* Effect.fork(instruct("make the hats busier"));
      yield* reaches("writing");

      yield* TestClock.adjust("60 seconds");
      yield* Fiber.join(running);

      expect(yield* turns).toMatchObject([{ state: "timed out" }]);
      expect(model.aborted).toBe(1);
    }),
  );

  it.scoped("the next Instruction starts afresh: no retries carried, a new snapshot", () =>
    Effect.gen(function* () {
      const stale = changeHats("00000000");
      const { model, instruct } = yield* setup("write", [stale, changeHats()]);
      yield* instruct("make the hats busier");

      yield* instruct("now the kick");

      const next = model.requests[2];
      expect(next?.retries).toEqual([]);
      expect(next?.snapshot.source).toContain(busier);
    }),
  );
});
