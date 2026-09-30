import { describe, expect, it } from "vitest";
import { liveCodeAfter, noLiveCode } from "./liveCode";
import { parsePerformance, revOf } from "./Performance";
import { snapshotOf } from "./snapshot";

const source = `samples('github:tidalcycles/dirt-samples')
kick: s("bd*4")
_hats: s("hh*8")`;

describe("snapshotOf", () => {
  it("gives the Source verbatim and each Part with its rev and marks, the Preamble first", () => {
    const performance = parsePerformance(source);
    const live = liveCodeAfter(performance, noLiveCode, "every");

    const snapshot = snapshotOf({
      performance,
      source,
      live,
      transport: { started: true, cps: 0.5 },
      error: undefined,
      aim: "kick",
    });

    expect(snapshot).toEqual({
      source,
      parts: [
        {
          part: "(preamble)",
          rev: revOf("samples('github:tidalcycles/dirt-samples')"),
          unapplied: false,
          muted: false,
          soloed: false,
          surface: "audio",
        },
        {
          part: "kick",
          rev: revOf('kick: s("bd*4")'),
          unapplied: false,
          muted: false,
          soloed: false,
          surface: "audio",
        },
        {
          part: "hats",
          rev: revOf('_hats: s("hh*8")'),
          unapplied: false,
          muted: true,
          soloed: false,
          surface: "audio",
        },
      ],
      live: {},
      transport: { started: true, cps: 0.5 },
      error: null,
      aim: "kick",
    });
  });

  it("gives the Live code of each Unapplied Part and deletion, but not of a Part never applied", () => {
    const applied = parsePerformance('kick: s("bd*4")\nhats: s("hh*8")\ngone: s("cp")');
    const live = liveCodeAfter(applied, noLiveCode, "every");
    const now = 'kick: s("bd*2")\nhats: s("hh*8")\nbass: note("c2")';

    const snapshot = snapshotOf({
      performance: parsePerformance(now),
      source: now,
      live,
      transport: { started: false, cps: 0.5 },
      error: { message: "boom", phase: "eval", part: "kick" },
      aim: null,
    });

    expect(snapshot.parts.map(({ part, unapplied }) => [part, unapplied])).toEqual([
      ["kick", true],
      ["hats", false],
      ["bass", true],
    ]);
    expect(snapshot.live).toEqual({ kick: 'kick: s("bd*4")', gone: 'gone: s("cp")' });
    expect(snapshot.error).toEqual({ message: "boom", phase: "eval", part: "kick" });
    expect(snapshot.aim).toBeNull();
  });

  it("leaves out an empty Preamble that never ran", () => {
    const now = 'kick: s("bd*4")';

    const snapshot = snapshotOf({
      performance: parsePerformance(now),
      source: now,
      live: noLiveCode,
      transport: { started: false, cps: 0.5 },
      error: undefined,
      aim: null,
    });

    expect(snapshot.parts.map(({ part }) => part)).toEqual(["kick"]);
  });
});
