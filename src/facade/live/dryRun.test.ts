import { describe, expect, it } from "vitest";
import { synonymsSetTwice } from "./dryRun";

/** Strudel 1.2.6's registered synonyms for the two controls the spec names. */
const synonyms = [
  ["roomsize", "size", "sz", "rsize"],
  ["clip", "legato"],
];
const sameControl = (a: string, b: string) =>
  synonyms.some((names) => names.includes(a) && names.includes(b));

describe("synonymsSetTwice", () => {
  it("warns where one chain sets a control under two of its names", () => {
    const code = 'kick: s("bd*4")\nhats: s("hh*8").size(.5).gain(.6).roomsize(.9)';

    expect(synonymsSetTwice(code, sameControl)).toEqual([
      {
        message: "size and roomsize set the same control; only the last one counts",
        offset: code.indexOf('s("hh*8")'),
      },
    ]);
  });

  it("warns once per pair, for legato and clip too", () => {
    const code = 'note("c e").legato(.5).clip(1).s("piano")';

    expect(synonymsSetTwice(code, sameControl).map((w) => w.message)).toEqual([
      "legato and clip set the same control; only the last one counts",
    ]);
  });

  it("does not warn about separate chains, even nested ones", () => {
    const code = `a: s("bd").size(.5)
b: s("hh").roomsize(.9)
c: stack(s("cp").legato(1), s("sd")).clip(.5)`;

    expect(synonymsSetTwice(code, sameControl)).toEqual([]);
  });

  it("does not warn about one name set twice, or about unrelated controls", () => {
    expect(synonymsSetTwice('s("bd").gain(1).gain(.5).room(.3)', sameControl)).toEqual([]);
  });

  it("says nothing about code that does not parse, which the evaluation reports", () => {
    expect(synonymsSetTwice('s("bd").size(.5).roomsize(', sameControl)).toEqual([]);
  });
});
