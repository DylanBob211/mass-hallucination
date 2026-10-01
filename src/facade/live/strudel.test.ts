import { parse } from "acorn";
import { describe, expect, it } from "vitest";
import { evalErrorOf, lateAtOutput, playbackErrorOf, withOnsets } from "./strudel";

describe("evalErrorOf", () => {
  it("takes a syntax error's offset, and drops its position in the composition", () => {
    const code = 'kick: s("bd*4")\nhats: s("hh*8").gain(';
    let thrown: unknown;
    try {
      parse(code, { ecmaVersion: 2022 });
    } catch (error) {
      thrown = error;
    }

    expect(evalErrorOf(thrown, code)).toMatchObject({
      message: "Unexpected token",
      offset: code.length,
    });
  });

  it("places a mini-notation error at the start of its line", () => {
    const code = 'kick: s("bd*4")\nhats: s("hh*[8")';
    const error = new Error("[mini] parse error at line 2: Expected ']' but end of input found.");

    expect(evalErrorOf(error, code)).toMatchObject({
      message: "[mini] parse error: Expected ']' but end of input found.",
      offset: 16,
    });
  });

  it("gives a runtime error no offset, as Strudel's generated code has other positions", () => {
    const error = evalErrorOf(new ReferenceError("nope is not defined"), "kick: nope");

    expect(error.message).toBe("nope is not defined");
    expect(error.offset).toBeUndefined();
  });
});

describe("playbackErrorOf", () => {
  it("takes the message of an error the scheduler, a query or a trigger logged", () => {
    expect(playbackErrorOf("[cyclist] error: no time set!")).toBe("no time set!");
    expect(playbackErrorOf("[query] error: x is not a function")).toBe("x is not a function");
    expect(playbackErrorOf("[getTrigger] error: sound nope not found")).toBe(
      "sound nope not found",
    );
  });

  it("ignores every other log line, evaluate errors included", () => {
    expect(playbackErrorOf("[eval] error: Unexpected token")).toBeUndefined();
    expect(playbackErrorOf("[eval] code updated")).toBeUndefined();
  });
});

describe("lateAtOutput", () => {
  it("passes every note on to the output, telling of each that came after its time", () => {
    const played: Array<number> = [];
    const late: Array<number> = [];
    let now = 10;
    const output = lateAtOutput(
      (_hap, _deadline, _duration, _cps, time) => {
        played.push(time);
      },
      () => now,
      (lateBy) => late.push(lateBy),
    );

    output({}, 0.1, 0.25, 0.5, 10.1);
    now = 10.2;
    output({}, 0, 0.25, 0.5, 10.15);

    expect(played).toEqual([10.1, 10.15]);
    expect(late).toHaveLength(1);
    expect(late[0]).toBeCloseTo(50);
  });
});

describe("withOnsets", () => {
  it("tells of each onset's time, and plays the note even when telling throws", () => {
    const played: Array<number> = [];
    const told: Array<number> = [];
    const output = withOnsets(
      (_hap, _deadline, _duration, _cps, time) => {
        played.push(time);
      },
      (time) => {
        told.push(time);
        throw new Error("no output timestamp");
      },
    );

    output({}, 0.1, 0.25, 0.5, 10.1);

    expect(told).toEqual([10.1]);
    expect(played).toEqual([10.1]);
  });
});
