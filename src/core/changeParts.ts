import { Effect, Either, ParseResult, Schema } from "effect";
import { AgentApplies } from "./AgentApplies";
import { AutonomyStore } from "./AutonomyStore";
import { badRequest, type PartChange, type Refusal, refusalOf } from "./checks";
import { Editor } from "./Editor";
import { composeWith, preambleId, writeTexts } from "./liveCode";
import { type DryRun, LiveCodeStore } from "./LiveCodeStore";
import { parsePerformance } from "./Performance";
import { ProposalStore } from "./ProposalStore";

/**
 * The agent's one tool's input (spec §6.2): each Part's whole new text, and the rev of the text it
 * replaces (`null` for a new Part).
 */
const ChangePartsInput = Schema.Struct({
  changes: Schema.Array(
    Schema.Struct({ part: Schema.String, rev: Schema.NullOr(Schema.String), text: Schema.String }),
  ),
});

/** What `change_parts` tells the agent (spec §6.2). */
export type ChangePartsResult =
  | {
      readonly ok: true;
      readonly landed: "proposed" | "written" | "applied";
      readonly warnings?: ReadonlyArray<string>;
    }
  | {
      readonly ok: false;
      readonly reason: "stale";
      readonly part: string;
      readonly rev: string;
      readonly text: string;
    }
  | { readonly ok: false; readonly reason: "unapplied"; readonly part: string }
  | {
      readonly ok: false;
      readonly reason: "invalid";
      readonly message: string;
      readonly part?: string;
      /** For a Visual Part (ticket 16). */
      readonly kind?: "syntax" | "name" | "argument" | "shader" | "parameter";
    }
  | { readonly ok: false; readonly reason: "bad_request"; readonly message: string };

/**
 * The agent's one tool (spec §6.2, ADR 0004): checks the request's shape, then that every Part
 * it changes is as the agent read it and holds no Unapplied edits, then dry-runs it, and lands it
 * by Autonomy. Atomic: a refusal writes, applies and schedules nothing.
 */
export const changeParts = (input: unknown) =>
  Effect.gen(function* () {
    const decoded = Schema.decodeUnknownEither(ChangePartsInput)(input);
    if (Either.isLeft(decoded))
      return badRequest(ParseResult.TreeFormatter.formatErrorSync(decoded.left));
    const { changes } = decoded.right;
    const neverLands = malformed(changes);
    if (neverLands !== undefined) return neverLands;

    const editor = yield* Editor;
    const liveCode = yield* LiveCodeStore;
    const texts = new Map(changes.map(({ part, text }) => [part, text]));
    const scope = [...texts.keys()];

    // The human keeps typing while the dry-run runs. The change lands only onto a Source that
    // still passes the checks, whose composition is the one the dry-run passed.
    let checked: DryRun | undefined;
    for (;;) {
      const source = yield* editor.read;
      const live = yield* liveCode.current;
      const performance = parsePerformance(source);
      const refusal = refusalOf(performance, live, changes);
      if (refusal !== undefined) return refusal;
      if (checked?.code !== composeWith(performance, live, scope, texts).code) {
        const dryRun = yield* Effect.either(liveCode.dryRun(scope, texts));
        if (Either.isLeft(dryRun)) {
          const { message, part } = dryRun.left;
          return {
            ok: false,
            reason: "invalid",
            message,
            ...(part !== undefined && { part }),
          } satisfies ChangePartsResult;
        }
        checked = dryRun.right;
        continue;
      }
      const landed = yield* Effect.either(land(source, changes));
      if (Either.isRight(landed)) {
        const { warnings } = checked;
        return {
          ok: true,
          landed: landed.right,
          ...(warnings.length > 0 && { warnings }),
        } satisfies ChangePartsResult;
      }
    }
  });

/**
 * Lands checked `changes` onto `source` by Autonomy (ADR 0003): as the open Proposal, or written,
 * or written and then Applied by the agent. Fails as `SourceMoved`, landing nothing, once the
 * Source is no longer `source`.
 */
const land = (source: string, changes: ReadonlyArray<PartChange>) =>
  Effect.gen(function* () {
    const autonomy = yield* (yield* AutonomyStore).current;
    if (autonomy === "propose") {
      yield* (yield* ProposalStore).propose(source, changes);
      return "proposed" as const;
    }
    const texts = new Map(changes.map(({ part, text }) => [part, text]));
    yield* (yield* Editor).write(source, writeTexts(source, texts));
    if (autonomy === "write") return "written" as const;
    yield* (yield* AgentApplies).schedule([...texts.keys()], texts);
    return "applied" as const;
  });

/**
 * A request whose texts could never land, whatever the Source: no change, a Part changed twice,
 * a Part's text that is not exactly that one Part, or a Preamble holding a Part.
 */
const malformed = (changes: ReadonlyArray<PartChange>): Refusal | undefined => {
  if (changes.length === 0) return badRequest("changes is empty");
  const seen = new Set<string>();
  for (const { part, text } of changes) {
    if (seen.has(part)) return badRequest(`${part} is changed twice; send each Part once`);
    seen.add(part);
    const parsed = parsePerformance(text);
    if (part === preambleId) {
      const [inside] = parsed.parts;
      if (inside !== undefined)
        return badRequest(`the Preamble's text holds the Part ${inside.id}; send it on its own`);
    } else {
      const [only, ...more] = parsed.parts;
      if (only === undefined || more.length > 0 || parsed.preamble.text !== "")
        return badRequest(`${part}'s text must be exactly one labelled Part, and nothing else`);
      if (only.id !== part)
        return badRequest(
          `${part}'s text is labelled ${only.id}; only its mute and solo marks may change`,
        );
    }
  }
  return undefined;
};
