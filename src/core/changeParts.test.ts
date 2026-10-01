import { describe, expect, it } from "@effect/vitest";
import { Effect, Fiber, Layer, Option, Stream, TestClock } from "effect";
import { AgentApplies } from "./AgentApplies";
import { apply } from "./apply";
import { AutonomyStore } from "./AutonomyStore";
import { type ChangePartsResult, changeParts } from "./changeParts";
import { ErrorSlotStore } from "./ErrorSlotStore";
import { makeFakeEditor, makeFakeModel, makeFakeStrudel } from "./fakes";
import { preambleId } from "./liveCode";
import { LiveCodeStore } from "./LiveCodeStore";
import { Model, type Retry } from "./Model";
import { revOf } from "./Performance";
import { ProposalStore } from "./ProposalStore";
import { takeSnapshot } from "./snapshot";
import { Strudel } from "./Strudel";
import type { Autonomy } from "./viewModel";

const seed = `samples('github:tidalcycles/dirt-samples')
setcps(0.5)
kick: s("bd*4")
hats: s("hh*8").gain(.6)
chords: note("<c3 eb3 g3 bb3>").s("sawtooth").lpf(800)`;

const hats = 'hats: s("hh*8").gain(.6)';
const chords = 'chords: note("<c3 eb3 g3 bb3>").s("sawtooth").lpf(800)';

/**
 * The seed Performance, Applied, at `autonomy`, with a fake Model replaying `calls`. `turn` asks
 * the Model and passes each call to `change_parts`, retrying on a refusal as the loop will
 * (ticket 10), and returns every result.
 */
const setup = (autonomy: Autonomy, calls: ReadonlyArray<unknown>, source = seed) =>
  Effect.gen(function* () {
    const editor = yield* makeFakeEditor(source);
    const strudel = yield* makeFakeStrudel();
    const model = makeFakeModel(calls);
    const context = yield* Layer.build(
      ProposalStore.layer.pipe(
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
    const turn = Effect.provide(
      Effect.gen(function* () {
        const results: ChangePartsResult[] = [];
        const retries: Array<Retry> = [];
        const snapshot = yield* takeSnapshot(null);
        for (;;) {
          const events = yield* Stream.runCollect(
            (yield* Model).stream({
              snapshot,
              instruction: "make the hats busier",
              retries: [...retries],
            }),
          );
          const call = Option.fromNullable([...events].find((event) => event._tag === "ToolCall"));
          if (Option.isNone(call)) return results;
          const result = yield* changeParts(call.value.input);
          results.push(result);
          if (result.ok) return results;
          retries.push({ call: call.value, result });
        }
      }),
      context,
    );
    const liveCode = Effect.provide(
      Effect.flatMap(LiveCodeStore, (store) => store.current),
      context,
    );
    const waiting = Effect.provide(
      Effect.flatMap(AgentApplies, (applies) => applies.waiting.pipe(Stream.runHead)),
      context,
    );
    /** Runs `effect` against the open Proposal's store. */
    const proposals = <A, E>(effect: (store: ProposalStore["Type"]) => Effect.Effect<A, E>) =>
      Effect.provide(Effect.flatMap(ProposalStore, effect), context);
    const proposal = proposals((store) => store.current);
    return {
      editor,
      strudel,
      model,
      context,
      turn,
      liveCode,
      waiting,
      proposals,
      proposal,
      source: editor.read,
    };
  });

const change = (part: string, rev: string | null, text: string) => ({
  changes: [{ part, rev, text }],
});

describe("change_parts", () => {
  it.scoped(
    "at Write, lands a change to hats while the human is mid-edit in chords, which keeps its Live code",
    () =>
      Effect.gen(function* () {
        const midEdit = seed.replace(".lpf(800)", ".lpf(12");
        const { editor, strudel, turn, liveCode, source } = yield* setup("write", [
          change("hats", revOf(hats), 'hats: s("hh*16").swingBy(1/3, 4).gain(.6)'),
        ]);
        yield* editor.type(midEdit);

        const results = yield* turn;

        expect(results).toEqual([{ ok: true, landed: "written" }]);
        expect(yield* source).toBe(
          midEdit.replace(hats, 'hats: s("hh*16").swingBy(1/3, 4).gain(.6)'),
        );
        expect(editor.writes).toHaveLength(1);
        expect(strudel.evaluated).toHaveLength(1);
        expect((yield* liveCode).parts.get("hats")).toBe(hats);
        expect((yield* liveCode).parts.get("chords")).toBe(chords);
      }),
  );

  describe("refuses, changing nothing,", () => {
    /** Runs one turn of `calls` and checks it wrote, evaluated and made live nothing. */
    const refused = (calls: ReadonlyArray<unknown>, autonomy: Autonomy = "apply") =>
      Effect.gen(function* () {
        const { editor, strudel, turn, liveCode, source } = yield* setup(autonomy, calls);
        const before = { source: yield* source, live: yield* liveCode };
        const results = yield* turn;
        expect(yield* source).toBe(before.source);
        expect(yield* liveCode).toBe(before.live);
        expect(editor.writes).toEqual([]);
        expect(strudel.evaluated).toHaveLength(1);
        return results;
      });

    it.scoped("a request that is not change_parts' shape, as bad_request", () =>
      Effect.gen(function* () {
        const [result] = yield* refused([{ changes: [{ part: "hats", text: "hats: s()" }] }]);
        expect(result).toMatchObject({ ok: false, reason: "bad_request" });
      }),
    );

    it.scoped("a Part the Source does not have, as bad_request", () =>
      Effect.gen(function* () {
        const results = yield* refused([change("bass", "0badc0de", 'bass: note("c2")')]);
        expect(results).toEqual([
          { ok: false, reason: "bad_request", message: "there is no Part bass" },
        ]);
      }),
    );

    it.scoped("a label changed beyond its mute and solo marks, as bad_request", () =>
      Effect.gen(function* () {
        const results = yield* refused([change("hats", revOf(hats), 'hat: s("hh*16")')]);
        expect(results).toEqual([
          {
            ok: false,
            reason: "bad_request",
            message: "hats's text is labelled hat; only its mute and solo marks may change",
          },
        ]);
      }),
    );

    it.scoped("a text holding more than its one Part, as bad_request", () =>
      Effect.gen(function* () {
        const [result] = yield* refused([
          change("hats", revOf(hats), 'hats: s("hh*16")\nbass: note("c2")'),
        ]);
        expect(result).toMatchObject({ ok: false, reason: "bad_request" });
      }),
    );

    it.scoped("rev: null on a name the Source has, as bad_request", () =>
      Effect.gen(function* () {
        const results = yield* refused([change("hats", null, 'hats: s("hh*16")')]);
        expect(results).toEqual([
          { ok: false, reason: "bad_request", message: "hats exists; send the rev you read" },
        ]);
      }),
    );

    it.scoped("a Part changed twice in one request, as bad_request", () =>
      Effect.gen(function* () {
        const results = yield* refused([
          {
            changes: [
              { part: "hats", rev: revOf(hats), text: 'hats: s("hh*16")' },
              { part: "hats", rev: revOf(hats), text: 'hats: s("hh*4")' },
            ],
          },
        ]);
        expect(results).toEqual([
          {
            ok: false,
            reason: "bad_request",
            message: "hats is changed twice; send each Part once",
          },
        ]);
      }),
    );

    it.scoped("a Part changed since the agent read it, as stale with its text now", () =>
      Effect.gen(function* () {
        const results = yield* refused([change("hats", "0badc0de", 'hats: s("hh*16")')]);
        expect(results).toEqual([
          { ok: false, reason: "stale", part: "hats", rev: revOf(hats), text: hats },
        ]);
      }),
    );

    it.scoped("the whole request when one of its Parts is stale", () =>
      Effect.gen(function* () {
        const results = yield* refused([
          {
            changes: [
              { part: "hats", rev: revOf(hats), text: 'hats: s("hh*16")' },
              { part: "kick", rev: "0badc0de", text: 'kick: s("bd*2")' },
            ],
          },
        ]);
        expect(results).toMatchObject([{ ok: false, reason: "stale", part: "kick" }]);
      }),
    );

    it.scoped("a Part the dry-run rejects, as invalid with the message and its Part", () =>
      Effect.gen(function* () {
        const { editor, strudel, turn, source } = yield* setup("apply", [
          change("hats", revOf(hats), "hats: s(nope)"),
        ]);
        const before = yield* source;
        yield* strudel.failDryRunWith("nope is not defined", {
          at: (code) => code.indexOf("nope"),
        });

        const results = yield* turn;

        expect(results).toEqual([
          { ok: false, reason: "invalid", message: "nope is not defined", part: "hats" },
        ]);
        expect(yield* source).toBe(before);
        expect(editor.writes).toEqual([]);
        expect(strudel.evaluated).toHaveLength(1);
      }),
    );

    it.scoped("a Visual Part the dry-run rejects, as invalid with what kind of error it is", () =>
      Effect.gen(function* () {
        const { strudel, turn } = yield* setup("write", [
          change("viz", null, "viz: hydra`osc(10).nope().out()`"),
        ]);
        yield* strudel.failDryRunWith("osc(...).nope is not a function", {
          at: (code) => code.indexOf("osc"),
          kind: "name",
        });

        const results = yield* turn;

        expect(results).toEqual([
          {
            ok: false,
            reason: "invalid",
            message: "osc(...).nope is not a function",
            part: "viz",
            kind: "name",
          },
        ]);
      }),
    );
  });

  it.scoped("refuses a Part holding the human's Unapplied edits, naming only the Part", () =>
    Effect.gen(function* () {
      const midEdit = seed.replace(".lpf(800)", ".lpf(12");
      const { editor, strudel, turn, source } = yield* setup("apply", [
        change("chords", revOf(chords.replace(".lpf(800)", ".lpf(12")), 'chords: note("c3")'),
      ]);
      yield* editor.type(midEdit);

      const results = yield* turn;

      expect(results).toEqual([{ ok: false, reason: "unapplied", part: "chords" }]);
      expect(yield* source).toBe(midEdit);
      expect(strudel.dryRuns).toEqual([]);
    }),
  );

  it.scoped("lands the retry after a stale refusal, sent with the rev it returned", () =>
    Effect.gen(function* () {
      const { model, turn, source } = yield* setup("write", [
        change("hats", "0badc0de", 'hats: s("hh*16")'),
        change("hats", revOf(hats), 'hats: s("hh*16")'),
      ]);

      const results = yield* turn;

      expect(results.map((result) => (result.ok ? result.landed : result.reason))).toEqual([
        "stale",
        "written",
      ]);
      expect(model.requests[1]?.retries).toHaveLength(1);
      expect(yield* source).toBe(seed.replace(hats, 'hats: s("hh*16")'));
    }),
  );

  it.scoped("appends a new Part (rev: null) at the end of the Source", () =>
    Effect.gen(function* () {
      const bass = '// root notes under the chords\nbass: note("<c2 eb2 g2 bb1>").s("sawtooth")';
      const { turn, source } = yield* setup("write", [change("bass", null, bass)]);

      const results = yield* turn;

      expect(results).toEqual([{ ok: true, landed: "written" }]);
      expect(yield* source).toBe(`${seed}\n${bass}`);
    }),
  );

  it.scoped("writes the Preamble as one unit, where its first segment stood", () =>
    Effect.gen(function* () {
      const preamble = 'setcps(.5)\n$: s("cp")';
      const { turn, strudel, source } = yield* setup(
        "write",
        [change(preambleId, revOf(preamble), "setcps(.6)")],
        'setcps(.5)\nkick: s("bd*4")\n$: s("cp")\nhats: s("hh*8")',
      );

      const results = yield* turn;

      expect(results).toEqual([{ ok: true, landed: "written" }]);
      expect(yield* source).toBe('setcps(.6)\nkick: s("bd*4")\n\nhats: s("hh*8")');
      expect(strudel.dryRuns).toEqual(['setcps(.6)\nkick: s("bd*4")\nhats: s("hh*8")']);
    }),
  );

  it.scoped("keeps a new Preamble comment its own, not the next Part's", () =>
    Effect.gen(function* () {
      const source = `setcps(.5)\nkick: s("bd*4")`;
      const { turn, source: after } = yield* setup(
        "write",
        [change(preambleId, revOf("setcps(.5)"), "setcps(.5)\n// four on the floor")],
        source,
      );

      yield* turn;

      expect(yield* after).toBe(`setcps(.5)\n// four on the floor\n\nkick: s("bd*4")`);
    }),
  );

  it.scoped("lands with the dry-run's warnings", () =>
    Effect.gen(function* () {
      const { strudel, turn } = yield* setup("write", [
        change("hats", revOf(hats), 'hats: s("hh*8").size(1).roomsize(2)'),
      ]);
      yield* strudel.warnDryRun("size and roomsize set the same control", (code) =>
        code.indexOf("hats"),
      );

      const results = yield* turn;

      expect(results).toEqual([
        {
          ok: true,
          landed: "written",
          warnings: ["hats: size and roomsize set the same control"],
        },
      ]);
    }),
  );

  describe("while the human types during the dry-run", () => {
    const typingDuringDryRun = (typed: (source: string) => string) =>
      Effect.gen(function* () {
        const { editor, strudel, turn, source } = yield* setup("write", [
          change("hats", revOf(hats), 'hats: s("hh*16")'),
        ]);
        yield* strudel.holdDryRuns;
        const turning = yield* Effect.fork(turn);
        yield* TestClock.adjust(0);
        yield* editor.type(typed(yield* source));
        yield* strudel.releaseDryRuns;
        return { results: yield* Fiber.join(turning), source: yield* source, strudel };
      });

    it.scoped("lands onto the Source as it is now when the typing is in another Part", () =>
      Effect.gen(function* () {
        const { results, source, strudel } = yield* typingDuringDryRun((now) =>
          now.replace(".lpf(800)", ".lpf(12"),
        );

        expect(results).toEqual([{ ok: true, landed: "written" }]);
        expect(source).toBe(seed.replace(".lpf(800)", ".lpf(12").replace(hats, 'hats: s("hh*16")'));
        expect(strudel.dryRuns).toHaveLength(1);
      }),
    );

    it.scoped("refuses as stale when the typing is in the Part it changes", () =>
      Effect.gen(function* () {
        const { results, source } = yield* typingDuringDryRun((now) =>
          now.replace("gain(.6)", "gain(.7)"),
        );

        expect(results).toEqual([
          {
            ok: false,
            reason: "stale",
            part: "hats",
            rev: revOf(hats.replace(".6", ".7")),
            text: hats.replace(".6", ".7"),
          },
        ]);
        expect(source).toBe(seed.replace("gain(.6)", "gain(.7)"));
      }),
    );
  });

  describe("at Apply", () => {
    const stop = Effect.flatMap(Strudel, (strudel) => strudel.stop);
    const busier = 'hats: s("hh*16").swingBy(1/3, 4).gain(.6)';

    /** At Apply, playing at `position` in cycles, with the human mid-edit in chords. */
    const playing = (position: number) =>
      Effect.gen(function* () {
        const at = yield* setup("apply", [change("hats", revOf(hats), busier)]);
        yield* at.strudel.setPosition(position);
        yield* at.editor.type(seed.replace(".lpf(800)", ".lpf(12"));
        return at;
      });

    it.scoped("writes at once, then Applies the Parts it touched at the next cycle boundary", () =>
      Effect.gen(function* () {
        const { strudel, turn, liveCode, waiting, source } = yield* playing(12.5);

        const results = yield* turn;
        yield* TestClock.adjust("1 second");
        const beforeBoundary = { evaluated: strudel.evaluated.length, waiting: yield* waiting };
        yield* strudel.setPosition(13.01);
        yield* TestClock.adjust("1 second");

        expect(results).toEqual([{ ok: true, landed: "applied" }]);
        expect(yield* source).toBe(seed.replace(".lpf(800)", ".lpf(12").replace(hats, busier));
        expect(beforeBoundary).toEqual({ evaluated: 1, waiting: Option.some(13) });
        // chords plays its Live code, not the human's half-typed text.
        expect(strudel.evaluated[1]).toBe(seed.replace(hats, busier));
        expect((yield* liveCode).parts.get("hats")).toBe(busier);
        expect((yield* liveCode).parts.get("chords")).toBe(chords);
        expect(yield* waiting).toEqual(Option.some(undefined));
      }),
    );

    it.scoped("plays nothing once the human edits, undoes or deletes what it wrote", () =>
      Effect.gen(function* () {
        const takeOvers: ReadonlyArray<(written: string) => string> = [
          (written) => written.replace("hh*16", "hh*12"),
          (written) => written.replace(busier, hats),
          (written) => written.replace(`\n${busier}`, ""),
        ];
        for (const takeOver of takeOvers) {
          const { editor, strudel, turn, liveCode, waiting, source } = yield* playing(12.5);
          yield* turn;
          yield* editor.type(takeOver(yield* source));
          yield* strudel.setPosition(13);
          yield* TestClock.adjust("1 second");

          expect(strudel.evaluated).toHaveLength(1);
          expect((yield* liveCode).parts.get("hats")).toBe(hats);
          expect(yield* waiting).toEqual(Option.some(undefined));
        }
      }),
    );

    it.scoped("on a stopped transport, makes it Live code and starts nothing", () =>
      Effect.gen(function* () {
        const { context, strudel, turn, liveCode, waiting } = yield* playing(12.5);
        yield* Effect.provide(stop, context);

        const results = yield* turn;
        yield* TestClock.adjust("2 seconds");

        expect(results).toEqual([{ ok: true, landed: "applied" }]);
        expect(strudel.evaluated).toHaveLength(1);
        expect((yield* liveCode).parts.get("hats")).toBe(busier);
        expect(yield* waiting).toEqual(Option.some(undefined));
      }),
    );

    it.scoped("makes it Live code without playing if the transport stops before the boundary", () =>
      Effect.gen(function* () {
        const { context, strudel, turn, liveCode, waiting } = yield* playing(12.5);

        yield* turn;
        yield* Effect.provide(stop, context);
        yield* TestClock.adjust("2 seconds");

        expect(strudel.evaluated).toHaveLength(1);
        expect((yield* liveCode).parts.get("hats")).toBe(busier);
        expect(yield* waiting).toEqual(Option.some(undefined));
      }),
    );

    it.scoped(
      "makes it Live code without playing if the transport restarts before the boundary",
      () =>
        Effect.gen(function* () {
          const { strudel, turn, liveCode } = yield* playing(12.5);

          yield* turn;
          yield* TestClock.adjust(0);
          // Stopped and started again between two looks at the scheduler.
          yield* strudel.setPosition(0.2);
          yield* TestClock.adjust("2 seconds");

          expect(strudel.evaluated).toHaveLength(1);
          expect((yield* liveCode).parts.get("hats")).toBe(busier);
        }),
    );

    it.scoped("keeps its queued Apply when the Turn is interrupted after landing", () =>
      Effect.gen(function* () {
        const { strudel, turn } = yield* playing(12.5);

        const turning = yield* Effect.fork(Effect.andThen(turn, Effect.never));
        yield* TestClock.adjust(0);
        yield* Fiber.interrupt(turning);
        yield* strudel.setPosition(13);
        yield* TestClock.adjust("1 second");

        expect(strudel.evaluated[1]).toBe(seed.replace(hats, busier));
      }),
    );
  });

  describe("at Propose", () => {
    const busier = 'hats: s("hh*16").swingBy(1/3, 4).gain(.6)';

    it.scoped("opens a Proposal, and changes neither the Source nor what is heard", () =>
      Effect.gen(function* () {
        const { editor, strudel, turn, liveCode, proposal, source } = yield* setup("propose", [
          change("hats", revOf(hats), busier),
        ]);
        const live = yield* liveCode;

        const results = yield* turn;

        expect(results).toEqual([{ ok: true, landed: "proposed" }]);
        expect(yield* source).toBe(seed);
        expect(editor.writes).toEqual([]);
        expect(strudel.evaluated).toHaveLength(1);
        expect(yield* liveCode).toBe(live);
        expect(yield* proposal).toEqual({
          changes: [{ part: "hats", rev: revOf(hats), text: busier }],
          stale: false,
        });
      }),
    );

    it.scoped("replaces the open Proposal with a new one", () =>
      Effect.gen(function* () {
        const bass = 'bass: note("<c2 eb2>")';
        const { turn, proposal, source } = yield* setup("propose", [
          change("hats", revOf(hats), busier),
          change("bass", null, bass),
        ]);

        yield* turn;
        const results = yield* turn;

        expect(results).toEqual([{ ok: true, landed: "proposed" }]);
        expect(yield* source).toBe(seed);
        expect(yield* proposal).toEqual({
          changes: [{ part: "bass", rev: null, text: bass }],
          stale: false,
        });
      }),
    );

    it.scoped("accept writes it into the Source as one agent write, and plays nothing", () =>
      Effect.gen(function* () {
        const { editor, strudel, turn, liveCode, proposals, proposal, source } = yield* setup(
          "propose",
          [change("hats", revOf(hats), busier)],
        );
        yield* turn;
        yield* editor.type(seed.replace(".lpf(800)", ".lpf(12"));

        const accepted = yield* proposals((store) => store.accept);

        expect(accepted).toBe("accepted");
        expect(yield* source).toBe(seed.replace(".lpf(800)", ".lpf(12").replace(hats, busier));
        expect(editor.writes).toHaveLength(1);
        expect(strudel.evaluated).toHaveLength(1);
        expect((yield* liveCode).parts.get("hats")).toBe(hats);
        expect(yield* proposal).toBeUndefined();
      }),
    );

    it.scoped("reject closes it, changing nothing", () =>
      Effect.gen(function* () {
        const { editor, turn, proposals, proposal, source } = yield* setup("propose", [
          change("hats", revOf(hats), busier),
        ]);
        yield* turn;

        yield* proposals((store) => store.reject);

        expect(yield* proposal).toBeUndefined();
        expect(yield* source).toBe(seed);
        expect(editor.writes).toEqual([]);
        expect(yield* proposals((store) => store.accept)).toBe("none");
      }),
    );

    it.scoped(
      "accept & play writes it and Applies the Parts it touched at once, not at the boundary",
      () =>
        Effect.gen(function* () {
          const midEdit = seed.replace(".lpf(800)", ".lpf(12");
          const { editor, strudel, turn, liveCode, waiting, proposals, proposal, source } =
            yield* setup("propose", [change("hats", revOf(hats), busier)]);
          yield* strudel.setPosition(12.5);
          yield* turn;
          yield* editor.type(midEdit);

          const accepted = yield* proposals((store) => store.acceptAndPlay);

          expect(accepted).toBe("accepted");
          expect(yield* source).toBe(midEdit.replace(hats, busier));
          // chords plays its Live code, not the human's half-typed text.
          expect(strudel.evaluated[1]).toBe(seed.replace(hats, busier));
          expect((yield* liveCode).parts.get("hats")).toBe(busier);
          expect(yield* waiting).toEqual(Option.some(undefined));
          expect(yield* proposal).toBeUndefined();
        }),
    );

    describe("goes Stale, lands nothing, and can then only be dismissed,", () => {
      /** Proposes `proposed`, lets the human edit the Source with `edit`, then accepts. */
      const staleAt = (proposed: unknown, edit: (source: string) => string) =>
        Effect.gen(function* () {
          const { editor, turn, proposals, proposal, source } = yield* setup("propose", [proposed]);
          yield* turn;
          const edited = edit(yield* source);
          yield* editor.type(edited);

          expect(yield* proposals((store) => store.accept)).toBe("stale");
          expect(yield* proposal).toMatchObject({ stale: true });
          expect(yield* proposals((store) => store.acceptAndPlay)).toBe("stale");
          expect(yield* source).toBe(edited);
          expect(editor.writes).toEqual([]);
          yield* proposals((store) => store.reject);
          expect(yield* proposal).toBeUndefined();
        });

      it.scoped("when the human edited one of its Parts", () =>
        staleAt(change("hats", revOf(hats), busier), (source) =>
          source.replace("gain(.6)", "gain(.7)"),
        ),
      );

      it.scoped("when the human edited it and undid the edit", () =>
        Effect.gen(function* () {
          const { editor, turn, proposals, proposal } = yield* setup("propose", [
            change("hats", revOf(hats), busier),
          ]);
          yield* turn;
          yield* editor.type(seed.replace("gain(.6)", "gain(.7)"));
          yield* TestClock.adjust(0);
          yield* editor.type(seed);

          expect(yield* proposal).toMatchObject({ stale: true });
          expect(yield* proposals((store) => store.accept)).toBe("stale");
        }),
      );

      it.scoped("when the human added a Part of the name it adds", () =>
        staleAt(
          change("bass", null, 'bass: note("c2")'),
          (source) => `${source}
bass: s("bd")`,
        ),
      );
    });
  });
});
