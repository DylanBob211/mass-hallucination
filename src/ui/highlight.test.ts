import { describe, expect, test } from "vitest";
import { highlight } from "./highlight";

/** Each coloured stretch of `source` as its text and classes. */
const tokens = (source: string) =>
  highlight(source).map(({ from, to, classes }) => [source.slice(from, to), classes]);

describe("a muted Part", () => {
  test("has its body dimmed and its label not, while other Parts are not dimmed", () => {
    const source = ["// low end", '_bass: s("bd")', 'keys: s("c3")'].join("\n");

    expect(tokens(source)).toEqual(
      expect.arrayContaining([
        ["// low end", "cm-t-comment cm-muted"],
        ["_bass", "cm-t-label"],
        ["s", "cm-t-function cm-muted"],
        ["bd", "cm-t-mini-word cm-muted"],
        ["keys", "cm-t-label"],
        ["c3", "cm-t-mini-word"],
      ]),
    );
  });
});

describe("a Visual Part's body", () => {
  const source = 'viz: hydra`osc(10, 0.1).color("red").modulate(src(o0), pulse("kick")).out()`';

  test("is coloured as JavaScript, its strings plain strings", () => {
    expect(tokens(source)).toEqual(
      expect.arrayContaining([
        ["osc", "cm-t-function"],
        ["10", "cm-t-number"],
        ['"red"', "cm-t-string"],
        ['"kick"', "cm-t-string"],
      ]),
    );
  });

  test("accents the link helpers, and only them", () => {
    expect(tokens(source)).toContainEqual(["pulse", "cm-t-function cm-link-helper"]);
    expect(tokens('cycle("bd")')).toContainEqual(["cycle", "cm-t-function"]);
  });
});

describe("Mini-notation", () => {
  test("a double-quoted string is tokenised into words, numbers, rests and structure", () => {
    expect(tokens('s("bd*2 [~ sd:3]")')).toEqual(
      expect.arrayContaining([
        ["bd", "cm-t-mini-word"],
        ["*", "cm-t-mini-structure"],
        ["2", "cm-t-mini-number"],
        ["[", "cm-t-mini-structure"],
        ["~", "cm-t-mini-rest"],
        ["sd", "cm-t-mini-word"],
        [":", "cm-t-mini-structure"],
        ["3", "cm-t-mini-number"],
        ["]", "cm-t-mini-structure"],
      ]),
    );
  });

  test("reads sharps, Euclid groups, dash rests and decimals", () => {
    expect(tokens('n("c#3(3,8) - 0.5")')).toEqual([
      ["n", "cm-t-function"],
      ['"', "cm-t-string"],
      ["c#3", "cm-t-mini-word"],
      ["(", "cm-t-mini-structure"],
      ["3", "cm-t-mini-number"],
      [",", "cm-t-mini-structure"],
      ["8", "cm-t-mini-number"],
      [")", "cm-t-mini-structure"],
      ["-", "cm-t-mini-rest"],
      ["0.5", "cm-t-mini-number"],
      ['"', "cm-t-string"],
    ]);
  });

  test("a single-quoted string is a plain string", () => {
    expect(tokens("s('bd sd')")).toContainEqual(["'bd sd'", "cm-t-string"]);
  });

  test("an untagged backtick string is Mini-notation, a tagged one is not", () => {
    expect(tokens("note(`c3 ~`)")).toEqual(
      expect.arrayContaining([
        ["c3", "cm-t-mini-word"],
        ["~", "cm-t-mini-rest"],
      ]),
    );
    expect(tokens("tag`c3 ~`")).toContainEqual(["`c3 ~`", "cm-t-string"]);
  });

  test("is off between `// mini-off` and `// mini-on`", () => {
    const source = ['s("bd")', "// mini-off", 'label("bd")', "// mini-on", 's("sd")'].join("\n");

    expect(tokens(source)).toEqual(
      expect.arrayContaining([
        ["bd", "cm-t-mini-word"],
        ['"bd"', "cm-t-string"],
        ["sd", "cm-t-mini-word"],
      ]),
    );
  });

  test("stays off to the end after a `mini-off` with no `mini-on`", () => {
    const source = ['s("bd")', "  /* mini-off */", 's("sd")'].join("\n");

    expect(tokens(source)).toEqual(
      expect.arrayContaining([
        ["bd", "cm-t-mini-word"],
        ['"sd"', "cm-t-string"],
      ]),
    );
  });
});
