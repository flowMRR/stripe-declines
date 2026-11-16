// Turns codes.json and guides.json into a TypeScript module, so the library
// works the same under ESM, CommonJS and every bundler without JSON import
// attributes. Run before tsc and before the tests (npm scripts do).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const codes = JSON.parse(readFileSync(join(root, "codes.json"), "utf8"));
const guides = JSON.parse(readFileSync(join(root, "guides.json"), "utf8"));

const out = `// Generated from codes.json and guides.json by scripts/gen-data.mjs. Do not edit.
export const data = ${JSON.stringify(codes, null, 2)};
export const guides: Record<string, string> = ${JSON.stringify(guides, null, 2)};
`;
writeFileSync(join(root, "src", "data.generated.ts"), out);
console.log(`gen-data: ${codes.codes.length} codes, ${codes.notes.length} notes, ${Object.keys(guides).length} guides (reviewed ${codes.reviewed})`);
