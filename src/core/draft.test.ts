import { describe, expect, it } from "vitest";
import { draftOf } from "./draft";

const whole = JSON.stringify({
  changes: [
    { part: "hats", rev: "0123abcd", text: 'hats: s("hh*16")\n  .gain(.6)' },
    { part: "bass", rev: null, text: 'bass: note("c2")' },
  ],
});

/** The draft once `length` characters of `whole` have streamed. */
const after = (length: number) => draftOf(whole.slice(0, length));

describe("draftOf", () => {
  it("reads every change of complete tool input", () => {
    expect(draftOf(whole)).toEqual([
      { part: "hats", text: 'hats: s("hh*16")\n  .gain(.6)' },
      { part: "bass", text: 'bass: note("c2")' },
    ]);
  });

  it("shows a text as far as it has streamed, its escapes decoded", () => {
    expect(after(whole.indexOf("\\n") + 2)).toEqual([{ part: "hats", text: 'hats: s("hh*16")\n' }]);
  });

  it("drops an escape cut in half", () => {
    expect(after(whole.indexOf("\\n") + 1)).toEqual([{ part: "hats", text: 'hats: s("hh*16")' }]);
    expect(draftOf('{"changes":[{"part":"a","text":"x\\u00')).toEqual([{ part: "a", text: "x" }]);
    expect(draftOf('{"changes":[{"part":"a","text":"x\\\\')).toEqual([{ part: "a", text: "x\\" }]);
    expect(draftOf('{"changes":[{"part":"a","text":"x\\\\\\')).toEqual([
      { part: "a", text: "x\\" },
    ]);
  });

  it("shows a change once its Part is named in full, with no text yet", () => {
    expect(after(whole.indexOf('"hats"') + 3)).toEqual([]);
    expect(after(whole.indexOf('"hats"') + 6)).toEqual([{ part: "hats", text: "" }]);
    expect(after(whole.indexOf('"text"') + 3)).toEqual([{ part: "hats", text: "" }]);
  });

  it("is empty before any change has streamed, and for input that is not a change list", () => {
    expect(draftOf("")).toEqual([]);
    expect(draftOf('{"chan')).toEqual([]);
    expect(draftOf('{"changes":[')).toEqual([]);
    expect(draftOf('{"changes":"no"}')).toEqual([]);
    expect(draftOf("[1, 2")).toEqual([]);
    expect(draftOf('{"changes":[{"part":1,"text":"x"}, 3, {"part":"b","text":2}]}')).toEqual([
      { part: "b", text: "" },
    ]);
  });

  it("reads through numbers, literals and nesting it does not need", () => {
    expect(
      draftOf('{"x": [1.5e3, true, null, {"y": false}], "changes": [{"part": "a", "text": "t"'),
    ).toEqual([{ part: "a", text: "t" }]);
  });
});
