// `pnpm check:reference`: fails when a prompt-reference file in src/reference/ names versions other
// than the ones pnpm-lock.yaml pins (spec §9). Runs before every build.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { staleReferences } from "./reference/versions.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const dir = join(root, "src/reference");
const expected = ["strudel-index.txt", "strudel-vs-tidal.txt", "strudel-do-not-use.txt"];
const present = readdirSync(dir);
const files = present.map((file) => ({
  path: `src/reference/${file}`,
  text: readFileSync(join(dir, file), "utf8"),
}));
const problems = [
  ...expected
    .filter((file) => !present.includes(file))
    .map((file) => `src/reference/${file} is missing`),
  ...staleReferences(files, readFileSync(join(root, "pnpm-lock.yaml"), "utf8")),
];

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(
    "\nRun `pnpm build:reference`, then check each hand-kept list still holds for the new versions and update its Versions line.",
  );
  process.exit(1);
}
