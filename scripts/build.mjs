// dist/esm (with types and the CLI) and dist/cjs, from one source tree.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const tsc = require.resolve("typescript/bin/tsc");
// Everything runs through the current node binary, no shell: a path with a
// space in it (C:\Program Files\nodejs) is then just a path.
const node = (...args) => execFileSync(process.execPath, args, { cwd: root, stdio: "inherit" });

rmSync(join(root, "dist"), { recursive: true, force: true });
node(join(root, "scripts", "gen-data.mjs"));
node(tsc, "-p", "tsconfig.esm.json");
node(tsc, "-p", "tsconfig.cjs.json");
// The package is "type": "module"; the CommonJS build says otherwise for itself.
mkdirSync(join(root, "dist", "cjs"), { recursive: true });
writeFileSync(join(root, "dist", "cjs", "package.json"), '{ "type": "commonjs" }\n');
console.log("build: dist/esm and dist/cjs written");
