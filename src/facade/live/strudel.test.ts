import { parse } from "acorn";
import { describe, expect, it } from "vitest";
import { evalErrorOf, playbackErrorOf } from "./strudel";

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
