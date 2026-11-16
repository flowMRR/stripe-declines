// Installs the packed tarball into a throwaway project and uses it the way
// consumers do: ESM import, CommonJS require, the JSON exports, the CLI through
// npx and stdin, and a TypeScript compile under every module resolution mode
// (bundler, node16 for ESM and CommonJS files, node10). Run after `npm run build`.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const tsc = require.resolve("typescript/bin/tsc");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const tarball = join(root, `stripe-declines-${version}.tgz`);

// npm and npx without a shell: through their own entry scripts when they sit next to
// the node binary (Windows and nvm installs), else as commands on the PATH.
const cli = (name) => {
  const script = join(dirname(process.execPath), "node_modules", "npm", "bin", `${name}-cli.js`);
  return existsSync(script) ? [process.execPath, [script]] : [name, []];
};
const [npm, npmArgs] = cli("npm");
const [npx, npxArgs] = cli("npx");

const failures = [];
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
  if (!ok) failures.push(name);
};
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") + (r.error ? String(r.error) : "") };
};

const pack = run(npm, [...npmArgs, "pack", "--silent"], { cwd: root });
check("npm pack", pack.code === 0 && pack.out.includes(`stripe-declines-${version}.tgz`), pack.out.trim());

const dir = mkdtempSync(join(tmpdir(), "stripe-declines-consumer-"));
try {
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "consumer", private: true, version: "0.0.0" }));
  const install = run(npm, [...npmArgs, "install", "--no-audit", "--no-fund", "--silent", tarball], { cwd: dir });
  check("npm install <tarball>", install.code === 0, install.out.trim().split("\n").slice(-3).join(" | "));

  // ESM consumer, with the JSON exports and the package.json export.
  writeFileSync(join(dir, "esm.mjs"), `
    import { explain, customerMessage, findAdvice, templateFor, DECLINE_CODES, REVIEWED } from "stripe-declines";
    import { createRequire } from "node:module";
    const require = createRequire(import.meta.url);
    const codes = require("stripe-declines/codes.json");
    const guides = require("stripe-declines/guides.json");
    const pkg = require("stripe-declines/package.json");
    const x = explain('{"decline_code":"do_not_honor","advice_code":"do_not_try_again"}', "fr");
    const out = {
      len: DECLINE_CODES.length, reviewed: REVIEWED, codes: codes.codes.length, guides: Object.keys(guides).length, version: pkg.version,
      retry: x.retry, source: x.retrySource, customer: customerMessage("expired_card"), fr: x.categoryLabel,
      nothing: explain(undefined), advice: findAdvice("advice_code: confirm_card_data"), tmpl: typeof templateFor(DECLINE_CODES[0]),
    };
    console.log(JSON.stringify(out));
  `);
  const esm = run(process.execPath, ["esm.mjs"], { cwd: dir });
  const esmOut = esm.code === 0 ? JSON.parse(esm.out.trim().split("\n").pop()) : null;
  check("ESM import + JSON exports", !!esmOut && esmOut.len === 51 && esmOut.codes === 51 && esmOut.guides === 22 && esmOut.version === version && esmOut.retry === "no" && esmOut.source === "advice_code" && esmOut.customer === "This card has expired. Please add a new card." && esmOut.fr === "Refus temporaire" && esmOut.nothing === null && esmOut.advice === "confirm_card_data" && esmOut.tmpl === "string", esm.code === 0 ? "" : esm.out.trim());

  // CommonJS consumer.
  writeFileSync(join(dir, "cjs.cjs"), `
    const m = require("stripe-declines");
    const codes = require("stripe-declines/codes.json");
    const out = { len: m.DECLINE_CODES.length, codes: codes.codes.length, retry: m.explain("lost_card").retry, de: m.explain("lost_card", "de").label, none: m.customerMessage(null), lookup: m.lookup("Do Not Honor").code };
    console.log(JSON.stringify(out));
  `);
  const cjs = run(process.execPath, ["cjs.cjs"], { cwd: dir });
  const cjsOut = cjs.code === 0 ? JSON.parse(cjs.out.trim().split("\n").pop()) : null;
  check("CommonJS require + JSON exports", !!cjsOut && cjsOut.len === 51 && cjsOut.codes === 51 && cjsOut.retry === "no" && cjsOut.de === "Lost card" && cjsOut.none === undefined && cjsOut.lookup === "do_not_honor", cjs.code === 0 ? "" : cjs.out.trim());

  // The CLI as installed: through the bin, with options, stdin, and exit codes.
  const bin = join(dir, "node_modules", "stripe-declines", "dist", "esm", "cli.js");
  const viaNpx = run(npx, [...npxArgs, "--no-install", "stripe-declines", "do_not_honor"], { cwd: dir });
  check("CLI via npx", viaNpx.code === 0 && /^do_not_honor — Do not honor/.test(viaNpx.out), viaNpx.out.trim().split("\n")[0]);
  const json = run(process.execPath, [bin, "--json", "--lang=fr", "expired_card"], { cwd: dir });
  const jsonOut = json.code === 0 ? JSON.parse(json.out) : null;
  check("CLI --json --lang=fr", !!jsonOut && jsonOut.code === "expired_card" && jsonOut.label === "Carte expirée" && typeof jsonOut.customer === "string" && jsonOut.retrySource === "code");
  const cust = run(process.execPath, [bin, "lost_card", "--customer"], { cwd: dir });
  check("CLI --customer", cust.code === 0 && cust.out === "Your card was declined. Please pay with another card, or contact your bank for details.\n", JSON.stringify(cust.out));
  const stdin = run(process.execPath, [bin, "--json"], { cwd: dir, input: 'decline_code: "insufficient_funds"\n' });
  check("CLI stdin", stdin.code === 0 && JSON.parse(stdin.out).code === "insufficient_funds");
  const miss = run(process.execPath, [bin, "hello", "world"], { cwd: dir });
  check("CLI unknown input exits 1", miss.code === 1 && /No decline code found/.test(miss.out));
  const badOpt = run(process.execPath, [bin, "--lang", "de", "x"], { cwd: dir });
  check("CLI bad option exits 2", badOpt.code === 2);
  const help = run(process.execPath, [bin, "--help"], { cwd: dir });
  check("CLI --help exits 0", help.code === 0 && /--customer/.test(help.out));

  // TypeScript consumers: the d.ts files must resolve and type-check under each mode.
  const ts = join(dir, "ts");
  mkdirSync(ts);
  const sample = (importLine) => `${importLine}
    const x = explain("do_not_honor", "fr");
    const retry: "likely" | "maybe" | "no" | undefined = x?.retry;
    const c: string | undefined = customerMessage(undefined as string | undefined, "fr-FR");
    const t: string = templateFor(DECLINE_CODES[0]!);
    const u: string | undefined = templateFor(undefined);
    const cat: Record<DeclineCategory, CategoryInfo> = CATEGORIES;
    const e: Explanation | null = x;
    export const ok = [retry, c, t, u, cat, e, DECLINE_BY_CODE.get("lost_card")?.en.customer, findAdvice("")] as const;
  `;
  const names = `{ explain, customerMessage, templateFor, findAdvice, DECLINE_CODES, DECLINE_BY_CODE, CATEGORIES, type DeclineCategory, type CategoryInfo, type Explanation }`;
  const modes = [
    ["bundler", "bundler.ts", { module: "ESNext", moduleResolution: "Bundler" }],
    ["node16-esm", "esm.mts", { module: "Node16", moduleResolution: "Node16" }],
    ["node16-cjs", "cjs.cts", { module: "Node16", moduleResolution: "Node16" }],
    ["nodenext-cjs", "nodenext.cts", { module: "NodeNext", moduleResolution: "NodeNext" }],
    ["node10", "node10.ts", { module: "CommonJS", moduleResolution: "Node10" }],
  ];
  for (const [name, file, options] of modes) {
    writeFileSync(join(ts, file), sample(`import ${names} from "stripe-declines";`));
    writeFileSync(join(ts, `tsconfig.${name}.json`), JSON.stringify({
      compilerOptions: { ...options, target: "ES2022", strict: true, noEmit: true, skipLibCheck: false, types: [], lib: ["ES2022"], esModuleInterop: true },
      files: [file],
    }));
    const r = run(process.execPath, [tsc, "-p", `tsconfig.${name}.json`], { cwd: ts });
    check(`TypeScript ${name}`, r.code === 0, r.code === 0 ? "" : r.out.trim().split("\n").slice(0, 3).join(" | "));
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`\n${failures.length} consumer check(s) failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("\nconsumer checks: all passed");
