// `pnpm build:reference`: writes the Strudel and Hydra grounding text the agent's cached prompt
// carries (spec §9 items 1, 2 and 4) into src/reference/, from the versions pnpm-lock.yaml pins.
// Re-run whenever a pin moves; `pnpm check:reference` fails the build until then. The do-not-use
// list (§9.3) and the "Hydra inside Strudel" note (§9.5) are hand-kept and not written here.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import hydraRegistry from "hydra-synth/src/glsl/glsl-functions.js";
import { bundleNames } from "./reference/bundle.ts";
import { hydraIndex, hydraRuntime } from "./reference/hydraIndex.ts";
import { strudelIndex, type DocEntry } from "./reference/strudelIndex.ts";
import { lockedVersions, versionsLine } from "./reference/versions.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = join(root, "src/reference");
// Not under node_modules: Strudel's jsdoc config skips every path that contains it.
const cache = join(tmpdir(), "pair-formance-build-reference");
const checkout = join(cache, "strudel");
const tools = join(cache, "tools");

const run = (cwd: string, command: string, ...args: ReadonlyArray<string>) =>
  execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();

/** The one version pnpm-lock.yaml resolves `pkg` to. */
function pinned(pkg: string): string {
  const versions =
    lockedVersions(readFileSync(join(root, "pnpm-lock.yaml"), "utf8")).get(pkg) ?? [];
  if (versions.length !== 1)
    throw new Error(`pnpm-lock.yaml resolves ${pkg} to ${String(versions.length)} versions`);
  return versions[0] ?? "";
}

const web = pinned("@strudel/web");
const core = pinned("@strudel/core");
const hydra = pinned("hydra-synth");
const installed = (
  JSON.parse(readFileSync(join(root, "node_modules/hydra-synth/package.json"), "utf8")) as {
    version: string;
  }
).version;
if (installed !== hydra)
  throw new Error(
    `node_modules has hydra-synth@${installed}, the lockfile pins ${hydra}: run pnpm install`,
  );

// 1. The Strudel monorepo at the commit that published both pins.
mkdirSync(cache, { recursive: true });
if (existsSync(checkout)) run(checkout, "git", "fetch", "--quiet", "origin");
else
  run(
    cache,
    "git",
    "clone",
    "--quiet",
    "--filter=blob:none",
    "https://codeberg.org/uzu/strudel.git",
  );

const versionAt = (commit: string, pkg: string) =>
  (
    JSON.parse(run(checkout, "git", "show", `${commit}:packages/${pkg}/package.json`)) as {
      version: string;
    }
  ).version;
const commit = run(
  checkout,
  "git",
  "log",
  "origin/HEAD",
  "--reverse",
  "--format=%H",
  `-G"version": "${web}"`,
  "--",
  "packages/web/package.json",
)
  .split("\n")
  .find((c) => c && versionAt(c, "web") === web && versionAt(c, "core") === core);
if (!commit)
  throw new Error(`No Strudel commit publishes @strudel/web@${web} with @strudel/core@${core}`);
run(checkout, "git", "checkout", "--quiet", "--force", "--detach", commit);

// 2. doc.json, by the repo's own `npm run jsdoc-json`, with the jsdoc its lockfile pins.
const strudelLock = readFileSync(join(checkout, "pnpm-lock.yaml"), "utf8");
const devVersion = (name: string) => {
  const match = new RegExp(`^ {6}${name}:\\n {8}specifier: .*\\n {8}version: (\\S+)`, "m").exec(
    strudelLock,
  );
  if (!match?.[1]) throw new Error(`Strudel's pnpm-lock.yaml pins no ${name}`);
  return match[1];
};
mkdirSync(tools, { recursive: true });
writeFileSync(
  join(tools, "package.json"),
  JSON.stringify({
    private: true,
    dependencies: { jsdoc: devVersion("jsdoc"), "jsdoc-json": devVersion("jsdoc-json") },
  }),
);
run(tools, "npm", "install", "--silent", "--no-audit", "--no-fund", "--no-package-lock");
if (!existsSync(join(checkout, "node_modules")))
  symlinkSync(join(tools, "node_modules"), join(checkout, "node_modules"));
run(checkout, "npm", "run", "--silent", "jsdoc-json");
const { docs } = JSON.parse(readFileSync(join(checkout, "doc.json"), "utf8")) as {
  docs: ReadonlyArray<DocEntry>;
};

// 3. The outputs, each headed by the versions it came from.
const strudelVersions =
  versionsLine([`@strudel/web@${web}`, `@strudel/core@${core}`]) +
  ` (codeberg.org/uzu/strudel commit ${commit})`;
const write = (file: string, title: string, body: string, versions = strudelVersions) => {
  const text = `${title}\n${versions}\n\n${body}`;
  writeFileSync(join(out, file), text);
  const chars = text.length;
  console.log(
    `${file}: ${String(chars)} chars, ~${String(Math.round(chars / 4))} tokens (chars/4)`,
  );
};

const index = strudelIndex(docs, await bundleNames());
write(
  "strudel-index.txt",
  `Strudel functions and signals this app can call (${String(index.length)}): name(params) =synonyms — first sentence of its docs.`,
  index.join("\n") + "\n",
);
write(
  "strudel-vs-tidal.txt",
  "Strudel vs Tidal, verbatim from Strudel's website/src/pages/learn/strudel-vs-tidal.mdx.",
  readFileSync(join(checkout, "website/src/pages/learn/strudel-vs-tidal.mdx"), "utf8"),
);

// 4. The Hydra index, from the registry of the hydra-synth the app bundles.
const registry = hydraRegistry();
write(
  "hydra-index.txt",
  `Hydra functions a Visual Part can call (${String(registry.length)}, from hydra-synth's src/glsl/glsl-functions.js): name(input=default, …) by type, then the rest of Hydra a Visual Part can use. Nothing else exists: no blur, mirror, glow or sharpen.`,
  [...hydraIndex(registry), ...hydraRuntime].join("\n") + "\n",
  versionsLine([`hydra-synth@${hydra}`]),
);
