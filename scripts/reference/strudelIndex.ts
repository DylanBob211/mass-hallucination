/** One entry of the `doc.json` Strudel's `npm run jsdoc-json` writes: the parts the index reads. */
export interface DocEntry {
  readonly name?: string;
  readonly kind?: string;
  /** HTML. */
  readonly description?: string;
  readonly synonyms?: ReadonlyArray<string>;
  readonly params?: ReadonlyArray<DocParam>;
}

/** A param; `config.rate` names the key `rate` of the param `config`. */
export interface DocParam {
  readonly name?: string;
  readonly optional?: boolean;
  readonly defaultvalue?: unknown;
  /** A rest param. */
  readonly variable?: boolean;
}

/** What each name the bundle exposes is: something to call, or a value such as `sine`. */
export type BundleNames = ReadonlyMap<string, "function" | "value">;

/**
 * The prompt's Strudel index, one line per name: `name(params) =synonyms — first sentence`. Keeps
 * the entries autocomplete keeps that the app's bundle can also reach (spec §9.1).
 */
export function strudelIndex(
  docs: ReadonlyArray<DocEntry>,
  names: BundleNames,
): ReadonlyArray<string> {
  // doc.json documents some names twice, e.g. a control and supradough's undocumented
  // `DoughVoice#attack`: one line each, from the first entry that says something.
  const entries = new Map<string, DocEntry>();
  for (const entry of docs) {
    const { name, kind } = entry;
    if (!name || name.startsWith("_") || kind === "package" || !names.has(name)) continue;
    const listed = entries.get(name);
    if (!listed || !summary(listed)) entries.set(name, entry);
  }
  // supradough's `DoughVoice#cutoff` is `lpf`'s synonym `cutoff`: already listed there.
  const synonyms = new Set([...entries.values()].flatMap((entry) => entry.synonyms ?? []));
  return [...entries]
    .filter(([name, entry]) => !(synonyms.has(name) && !summary(entry)))
    .map(([name, entry]) => {
      const signature = names.get(name) === "value" ? name : `${name}(${paramList(entry.params)})`;
      const alsoNamed = entry.synonyms?.length ? ` =${entry.synonyms.join(", ")}` : "";
      const sentence = summary(entry);
      return `${signature}${alsoNamed}${sentence ? ` — ${sentence}` : ""}`;
    });
}

/** The first sentence of an entry's docs, or "" when it has none. */
const summary = (entry: DocEntry) => firstSentence(entry.description ?? "");

function paramList(params: ReadonlyArray<DocParam> = []): string {
  const param = (p: DocParam, name: string) =>
    `${p.variable ? "..." : ""}${name}${p.optional ? "?" : ""}` +
    (p.defaultvalue === undefined ? "" : `=${JSON.stringify(p.defaultvalue)}`);
  return params
    .flatMap((p) => {
      const name = p.name ?? "";
      if (name.includes(".")) return [];
      const keys = params
        .filter((key) => key.name?.startsWith(`${name}.`))
        .map((key) => param(key, (key.name ?? "").slice(name.length + 1)));
      return [param(p, name) + (keys.length ? `{${keys.join(", ")}}` : "")];
    })
    .join(", ");
}

function firstSentence(html: string): string {
  const paragraph = html.split("</p>")[0] ?? "";
  const text = paragraph
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  return text.split(/(?<=\.)(?<!\b(?:i\.e|e\.g)\.)\s/)[0] ?? "";
}
