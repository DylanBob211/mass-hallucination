import { Effect } from "effect";
import { Editor } from "./Editor";
import { ErrorSlotStore } from "./ErrorSlotStore";
import { deleted, isUnapplied, type LiveCode, preambleId } from "./liveCode";
import { LiveCodeStore, outputsOf, type VisualOutputs } from "./LiveCodeStore";
import { type Performance, parsePerformance, type Surface } from "./Performance";
import { Strudel } from "./Strudel";
import type { ErrorSlot, Transport, VisualOutput } from "./viewModel";

/** The Performance as the agent receives it with every Instruction (spec §6.1). Plain JSON. */
export interface Snapshot {
  readonly source: string;
  /** The Preamble, as `(preamble)`, then the Source's Parts, in Source order. */
  readonly parts: ReadonlyArray<{
    readonly part: string;
    readonly rev: string;
    readonly unapplied: boolean;
    readonly muted: boolean;
    readonly soloed: boolean;
    readonly surface: Surface;
    /** A Visual Part's outputs, as the last dry-run of its exact text found them. */
    readonly outputs?: ReadonlyArray<VisualOutput>;
  }>;
  /**
   * The Live code of every Unapplied unit that has some, a deleted Part still sounding included,
   * by Part identity or `(preamble)`.
   */
  readonly live: Readonly<Record<string, string>>;
  readonly transport: Transport;
  readonly error: ErrorSlot | null;
  /** The Part the Instruction was asked at, or `null` for all of them. A hint only. */
  readonly aim: string | null;
}

/** The snapshot of `performance`, parsed from `source`, as it plays `live`. */
export const snapshotOf = ({
  performance,
  source,
  live,
  outputs,
  transport,
  error,
  aim,
}: {
  readonly performance: Performance;
  readonly source: string;
  readonly live: LiveCode;
  readonly outputs: VisualOutputs;
  readonly transport: Transport;
  readonly error: ErrorSlot | undefined;
  readonly aim: string | null;
}): Snapshot => {
  const parts: Array<Snapshot["parts"][number]> = [];
  const liveOf: Record<string, string> = {};
  const { preamble } = performance;
  // An empty Preamble is shown only while text it no longer has still plays.
  if (preamble.text !== "" || (live.preamble ?? "") !== "") {
    const unapplied = live.preamble !== preamble.text;
    parts.push({
      part: preambleId,
      rev: preamble.rev,
      unapplied,
      muted: false,
      soloed: false,
      surface: "audio",
    });
    if (unapplied && live.preamble !== undefined) liveOf[preambleId] = live.preamble;
  }
  for (const part of performance.parts) {
    const unapplied = isUnapplied(part, live);
    const { id, rev, muted, soloed, surface } = part;
    const written = outputsOf(part, outputs);
    parts.push({
      part: id,
      rev,
      unapplied,
      muted,
      soloed,
      surface,
      ...(written !== undefined && { outputs: [...written] }),
    });
    const running = live.parts.get(id);
    if (unapplied && running !== undefined) liveOf[id] = running;
  }
  for (const [id, text] of deleted(performance, live)) liveOf[id] = text;
  return {
    source,
    parts,
    live: liveOf,
    transport: { started: transport.started, cps: transport.cps },
    error: error === undefined ? null : { ...error },
    aim,
  };
};

/** The Performance's snapshot as of now, for an Instruction asked at `aim`. */
export const takeSnapshot = (aim: string | null) =>
  Effect.gen(function* () {
    const source = yield* (yield* Editor).read;
    const liveCode = yield* LiveCodeStore;
    return snapshotOf({
      performance: parsePerformance(source),
      source,
      live: yield* liveCode.current,
      outputs: yield* liveCode.outputs,
      transport: yield* (yield* Strudel).transport,
      error: yield* (yield* ErrorSlotStore).current,
      aim,
    });
  });
