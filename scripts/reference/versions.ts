/**
 * Every prompt-reference file starts with a title line, then the versions it was generated from
 * (spec §9): `Versions: @strudel/web@1.3.0 @strudel/core@1.2.6`, space-separated, possibly followed
 * by a note in parentheses.
 */
export const versionsLine = (versions: ReadonlyArray<string>) => `Versions: ${versions.join(" ")}`;

/** A prompt-reference file and its contents. */
export interface ReferenceFile {
  readonly path: string;
  readonly text: string;
}

/** One problem per file whose versions are not the ones the pnpm lockfile resolves. */
export function staleReferences(
  files: ReadonlyArray<ReferenceFile>,
  lockfile: string,
): ReadonlyArray<string> {
  const pinned = lockedVersions(lockfile);
  return files.flatMap(({ path, text }) => {
    const line = text.split("\n")[1] ?? "";
    const named = line.startsWith("Versions: ")
      ? [...line.matchAll(/(?<=^|\s)(@?[^@\s]+)@(\d\S*)/g)]
      : [];
    if (!named.length) {
      return [
        `${path} names no versions: its second line must read \`Versions: <package>@<version> …\``,
      ];
    }
    return named.flatMap(([named = "", pkg = "", version]) => {
      const locked = pinned.get(pkg);
      if (!locked) return [`${path} was generated from ${named}; the lockfile has no ${pkg}`];
      if (locked.includes(version ?? "")) return [];
      return [
        `${path} was generated from ${named}; the lockfile pins ${locked.map((v) => `${pkg}@${v}`).join(", ")}`,
      ];
    });
  });
}

/** Package → the versions a pnpm v9 lockfile resolves it to, from the keys of its `packages:`. */
export function lockedVersions(lockfile: string): ReadonlyMap<string, ReadonlyArray<string>> {
  const packages = lockfile.split(/^packages:$/m)[1]?.split(/^\S/m)[0] ?? "";
  const versions = new Map<string, Array<string>>();
  for (const [, pkg = "", version = ""] of packages.matchAll(
    /^ {2}'?(@?[^@\s']+)@([^\s':]+)'?:/gm,
  )) {
    versions.set(pkg, [...(versions.get(pkg) ?? []), version]);
  }
  return versions;
}
