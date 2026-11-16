// While the Landing site still carries its own copy of the data, the two must
// be identical: FlowMRR's backend parity test reads the Landing copy and this
// package publishes it. Skipped outside the FlowMRR monorepo.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ours = join(here, "..", "codes.json");
const landing = join(here, "..", "..", "Landing", "src", "lib", "decline-rules", "codes.json");
const guidesTs = join(here, "..", "..", "Landing", "src", "data", "decline-code-guides.ts");

test("codes.json matches the Landing site's copy", { skip: !existsSync(landing) && "Landing not checked out" }, () => {
  assert.deepEqual(JSON.parse(readFileSync(ours, "utf8")), JSON.parse(readFileSync(landing, "utf8")));
});

test("guides.json lists the Landing site's guide slugs", { skip: !existsSync(guidesTs) && "Landing not checked out" }, () => {
  const guides = JSON.parse(readFileSync(join(here, "..", "guides.json"), "utf8")) as Record<string, string>;
  const src = readFileSync(guidesTs, "utf8");
  const pairs = [...src.matchAll(/slug:\s*"([a-z-]+)",\s*\n?\s*code:\s*"([a-z_]+)"/g)].map((m) => [m[2], m[1]]);
  assert.ok(pairs.length > 0, "no guides found in decline-code-guides.ts");
  assert.deepEqual(guides, Object.fromEntries(pairs));
});
