/** One change of the tool input as far as it has streamed: its Part, and its text so far. */
export interface DraftChange {
  readonly part: string;
  readonly text: string;
}

/**
 * The changes in `change_parts` input cut off anywhere (ADR 0007): each change whose Part is named
 * in full, with its text as far as it has come. Input that is not a change list reads as none.
 */
export const draftOf = (partial: string): ReadonlyArray<DraftChange> => {
  const input = new Reader(partial).value();
  if (!isRecord(input) || !Array.isArray(input.changes)) return [];
  return Object.freeze(
    input.changes.flatMap((change: unknown) => {
      if (!isRecord(change) || typeof change.part !== "string") return [];
      const { text } = change;
      return [
        Object.freeze({
          part: change.part,
          text: typeof text === "string" ? text : text instanceof Unfinished ? text.text : "",
        }),
      ];
    }),
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A JSON string's body, decoded; empty when it is not valid JSON. */
const decode = (body: string): string => {
  try {
    return JSON.parse(`"${body}"`) as string;
  } catch {
    return "";
  }
};

/** A string the input ends inside of; kept apart so a half-named Part never counts. */
class Unfinished {
  constructor(readonly text: string) {}
}

/**
 * A JSON reader that stops wherever the input does, keeping what it has read so far: a string cut
 * off is `Unfinished`, an object or array cut off holds what it had, a key cut off is left out,
 * and anything else cut off is `undefined`.
 */
class Reader {
  private at = 0;

  constructor(private readonly input: string) {}

  value(): unknown {
    this.skipSpace();
    const next = this.input[this.at];
    if (next === "{") return this.object();
    if (next === "[") return this.array();
    if (next === '"') return this.string();
    return this.literal();
  }

  private object(): Record<string, unknown> {
    this.at++;
    const object: Record<string, unknown> = {};
    for (;;) {
      this.skipSpace();
      const next = this.input[this.at];
      if (next === undefined || next === "}") break;
      if (next === ",") {
        this.at++;
        continue;
      }
      const key = this.string();
      this.skipSpace();
      if (key instanceof Unfinished || this.input[this.at] !== ":") break;
      this.at++;
      this.skipSpace();
      if (this.at >= this.input.length) break;
      object[key] = this.value();
    }
    this.at++;
    return object;
  }

  private array(): Array<unknown> {
    this.at++;
    const array: Array<unknown> = [];
    for (;;) {
      this.skipSpace();
      const next = this.input[this.at];
      if (next === undefined || next === "]") break;
      if (next === ",") {
        this.at++;
        continue;
      }
      array.push(this.value());
    }
    this.at++;
    return array;
  }

  /** A string at the cursor, decoded; `Unfinished` when the input ends inside it. */
  private string(): string | Unfinished {
    const start = this.at;
    this.at++;
    for (;;) {
      const next = this.input[this.at];
      if (next === undefined) return new Unfinished(this.decodeCut(start));
      if (next === "\\") this.at += 2;
      else if (next === '"') {
        this.at++;
        return decode(this.input.slice(start + 1, this.at - 1));
      } else this.at++;
    }
  }

  /** The string opened at `start` and cut off by the input's end, without a half escape. */
  private decodeCut(start: number): string {
    const body = this.input.slice(start + 1);
    // An odd run of backslashes at the end opens an escape; an even one is escaped backslashes.
    return decode(body.replace(/(?<!\\)((?:\\\\)*)\\(?:u[0-9a-fA-F]{0,3})?$/, "$1"));
  }

  /** A number, `true`, `false` or `null`; `undefined` when cut off or not JSON. */
  private literal(): unknown {
    const match = /^[^,\]}\s]*/.exec(this.input.slice(this.at))?.[0] ?? "";
    this.at += Math.max(match.length, 1);
    try {
      return JSON.parse(match) as unknown;
    } catch {
      return undefined;
    }
  }

  private skipSpace() {
    while (/\s/.test(this.input[this.at] ?? "")) this.at++;
  }
}
