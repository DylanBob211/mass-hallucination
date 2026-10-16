import { describe, expect, it } from "@effect/vitest";
import { Chunk, Effect, Layer, Stream } from "effect";
import { Agent } from "../../core/Agent";
import { AgentApplies } from "../../core/AgentApplies";
import { apply } from "../../core/apply";
import { AutonomyStore } from "../../core/AutonomyStore";
import { ErrorSlotStore } from "../../core/ErrorSlotStore";
import { makeFakeEditor, makeFakePage, makeFakeStrudel } from "../../core/fakes";
import { Instrumentation } from "../../core/Instrumentation";
import { LiveCodeStore } from "../../core/LiveCodeStore";
import { Model } from "../../core/Model";
import { ProposalStore } from "../../core/ProposalStore";
import { takeSnapshot } from "../../core/snapshot";
import { anthropicModel, type ModelConfig, modelConfigFromEnv } from "./model";

/**
 * Against the real API, and billed: runs only under `pnpm test:real`, never `pnpm check`, and only
 * with a key, the app's from `.env.local` or else `ANTHROPIC_API_KEY`.
 * `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` override the app's configuration. The dry-run is
 * faked, so this checks the model and the loop, not Strudel.
 */
const fromEnvLocal = modelConfigFromEnv();
const config: ModelConfig = {
  ...fromEnvLocal,
  apiKey: process.env["ANTHROPIC_API_KEY"] ?? fromEnvLocal.apiKey,
  model: process.env["ANTHROPIC_MODEL"] ?? fromEnvLocal.model,
};

const seed = `samples('github:tidalcycles/dirt-samples')
setcps(0.5)
kick: s("bd*4")
hats: s("hh*8").gain(.6)
chords: note("<c3 eb3 g3 bb3>").s("sawtooth").lpf(800)`;

const performance = Effect.gen(function* () {
  const editor = yield* makeFakeEditor(seed);
  const strudel = yield* makeFakeStrudel();
  const page = yield* makeFakePage();
  const context = yield* Layer.build(
    Agent.layer.pipe(
      Layer.provideMerge(Instrumentation.layer),
      Layer.provideMerge(ProposalStore.layer),
      Layer.provideMerge(AgentApplies.layer),
      Layer.provideMerge(AutonomyStore.layer),
      Layer.provideMerge(LiveCodeStore.layer),
      Layer.provideMerge(ErrorSlotStore.layer),
      Layer.provideMerge(
        Layer.mergeAll(editor.layer, strudel.layer, anthropicModel(config), page.layer),
      ),
    ),
  );
  yield* Effect.provide(apply(), context);
  return { editor, context };
});

describe.skipIf(config.apiKey === "")("the real model", () => {
  // Spec §13.3: the note before the tool call comes back as visible text.
  it.scopedLive(
    "writes a visible note before calling change_parts",
    () =>
      Effect.gen(function* () {
        const { context } = yield* performance;
        const events = yield* Effect.provide(
          Effect.gen(function* () {
            const snapshot = yield* takeSnapshot("hats");
            return yield* Stream.runCollect(
              (yield* Model).stream({
                snapshot,
                instruction: "make the hats busier and swing it",
                retries: [],
              }),
            );
          }),
          context,
        );
        const tags = Chunk.toArray(events).map((event) => event._tag);
        const note = Chunk.toArray(events)
          .flatMap((event) => (event._tag === "Text" ? [event.delta] : []))
          .join("");
        yield* Effect.log({
          note,
          firstCall: tags.indexOf("ToolCall"),
          lastText: tags.lastIndexOf("Text"),
        });
        expect(note.trim()).not.toBe("");
        expect(tags.lastIndexOf("Text")).toBeLessThan(tags.indexOf("ToolCall"));
      }),
    120_000,
  );

  // Scenario 12.1, at Write Autonomy.
  it.scopedLive(
    "varies what I have: a change to hats only lands",
    () =>
      Effect.gen(function* () {
        const { editor, context } = yield* performance;
        yield* Effect.provide(
          Effect.gen(function* () {
            yield* (yield* AutonomyStore).set("write");
            yield* (yield* Agent).instruct("make the hats busier and swing it", "hats");
          }),
          context,
        );
        const turns = yield* Effect.provide(
          Effect.flatMap(Agent, (agent) => agent.turns),
          context,
        );
        const source = yield* editor.read;
        yield* Effect.log(turns, source);
        expect(turns).toMatchObject([{ state: "landed", landed: "written" }]);
        expect(source).toContain('kick: s("bd*4")');
        expect(source).toContain('chords: note("<c3 eb3 g3 bb3>").s("sawtooth").lpf(800)');
        expect(source).not.toContain('hats: s("hh*8").gain(.6)');
      }),
    120_000,
  );
});
