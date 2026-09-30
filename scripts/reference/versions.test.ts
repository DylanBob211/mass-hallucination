import { describe, expect, it } from "vitest";
import { staleReferences, versionsLine } from "./versions.ts";

/** Trimmed from this repo's pnpm-lock.yaml. */
const lockfile = `lockfileVersion: '9.0'

importers:

  .:
    dependencies:
      '@strudel/web':
        specifier: 1.3.0
        version: 1.3.0

packages:

  '@strudel/core@1.2.6':
    resolution: {integrity: sha512-FA5K}

  '@strudel/web@1.3.0':
    resolution: {integrity: sha512-iob9}

  acorn@8.18.0:
    resolution: {integrity: sha512-a}

snapshots:

  '@strudel/web@1.3.0':
    dependencies:
      '@strudel/core': 1.2.6
`;

const reference = (versions: string) =>
  `Strudel functions and signals this app can call (1): name(params) — first sentence of its docs.\n${versions}\n\nfast(factor)\n`;

describe("staleReferences", () => {
  it("passes outputs generated from the versions the lockfile pins", () => {
    const text = reference(versionsLine(["@strudel/web@1.3.0", "@strudel/core@1.2.6"]));

    expect(staleReferences([{ path: "strudel-index.txt", text }], lockfile)).toEqual([]);
  });

  it("names each output whose versions the lockfile no longer pins", () => {
    const outputs = [
      {
        path: "strudel-index.txt",
        text: reference("Versions: @strudel/web@1.2.0 @strudel/core@1.2.6"),
      },
      {
        path: "strudel-vs-tidal.txt",
        text: reference("Versions: @strudel/web@1.3.0 acorn@8.17.0"),
      },
    ];

    expect(staleReferences(outputs, lockfile)).toEqual([
      "strudel-index.txt was generated from @strudel/web@1.2.0; the lockfile pins @strudel/web@1.3.0",
      "strudel-vs-tidal.txt was generated from acorn@8.17.0; the lockfile pins acorn@8.18.0",
    ]);
  });

  it("fails an output that names no versions, or a package the lockfile does not have", () => {
    const outputs = [
      { path: "notes.txt", text: "Hand-written notes.\n" },
      { path: "empty.txt", text: reference("Versions: (to be filled in)") },
      { path: "hydra-index.txt", text: reference("Versions: hydra-synth@1.4.0") },
    ];

    expect(staleReferences(outputs, lockfile)).toEqual([
      "notes.txt names no versions: its second line must read `Versions: <package>@<version> …`",
      "empty.txt names no versions: its second line must read `Versions: <package>@<version> …`",
      "hydra-index.txt was generated from hydra-synth@1.4.0; the lockfile has no hydra-synth",
    ]);
  });
});
