// The Landing site installs this package and keeps its long-form guides next to
// it; guides.json must list exactly those guides. Skipped outside the FlowMRR
// monorepo.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const guidesTs = join(here, "..", "..", "Landing", "src", "data", "decline-code-guides.ts");

test("guides.json lists the Landing site's guide slugs", { skip: !existsSync(guidesTs) && "Landing not checked out" }, () => {
  const guides = JSON.parse(readFileSync(join(here, "..", "guides.json"), "utf8")) as Record<string, string>;
  const src = readFileSync(guidesTs, "utf8");
  const pairs = [...src.matchAll(/slug:\s*"([a-z-]+)",\s*\n?\s*code:\s*"([a-z_]+)"/g)].map((m) => [m[2], m[1]]);
  assert.ok(pairs.length > 0, "no guides found in decline-code-guides.ts");
  assert.deepEqual(guides, Object.fromEntries(pairs));
});
