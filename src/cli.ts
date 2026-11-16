#!/usr/bin/env node
/**
 * stripe-declines <code | label | message | pasted payload> [--lang fr] [--json] [--email]
 *
 *   npx stripe-declines do_not_honor
 *   npx stripe-declines "Your card has insufficient funds." --lang fr
 *   stripe logs tail | grep decline_code | npx stripe-declines --json
 */
import { explain, findNote, suggest, type Locale } from "./index.js";

export type CliResult = { out: string; code: number };

export function run(argv: string[], stdin = ""): CliResult {
  const args = [...argv];
  let locale: Locale = "en";
  let json = false;
  let email = false;
  const words: string[] = [];
  while (args.length) {
    const a = args.shift() as string;
    if (a === "--lang" || a === "-l") {
      const v = args.shift();
      if (v !== "en" && v !== "fr") return { out: "stripe-declines: --lang takes en or fr\n", code: 2 };
      locale = v;
    } else if (a.startsWith("--lang=")) {
      const v = a.slice(7);
      if (v !== "en" && v !== "fr") return { out: "stripe-declines: --lang takes en or fr\n", code: 2 };
      locale = v;
    } else if (a === "--json") json = true;
    else if (a === "--email") email = true;
    else if (a === "-h" || a === "--help") return { out: HELP, code: 0 };
    else words.push(a);
  }
  const input = (words.join(" ") || stdin).trim();
  if (!input) return { out: HELP, code: 2 };

  const x = explain(input, locale);
  if (!x) {
    const note = findNote(input);
    if (note) return { out: json ? JSON.stringify({ note: note.term, categories: note.categories, text: note[locale] }, null, 2) + "\n" : `${note.term}: ${note[locale]}\n`, code: 0 };
    const near = suggest(input, 5).map((d) => d.code);
    const hint = near.length ? `Did you mean: ${near.join(", ")}?\n` : "";
    return { out: json ? JSON.stringify({ error: "no decline code found", suggestions: near }, null, 2) + "\n" : `No decline code found in the input.\n${hint}`, code: 1 };
  }
  if (json) return { out: JSON.stringify(x, null, 2) + "\n", code: 0 };
  const lines = [
    `${x.code} — ${x.label}`,
    `${locale === "fr" ? "Catégorie" : "Category"}: ${x.categoryLabel} (${x.category}) · ${locale === "fr" ? "retente" : "retry"}: ${x.retry} · ${locale === "fr" ? "qui corrige" : "who fixes it"}: ${x.fixer}`,
    "",
    x.meaning,
    "",
    x.action,
  ];
  if (x.guide) lines.push("", `${locale === "fr" ? "Guide" : "Guide"}: ${x.guide}`);
  if (email) lines.push("", "---", x.email);
  return { out: lines.join("\n") + "\n", code: 0 };
}

const HELP = `stripe-declines <code | label | message | pasted payload> [options]

Explains a Stripe card decline: what it means, whether a retry can succeed,
who can fix it, what to do, and what to tell the customer.

Options
  --lang en|fr   language of the explanation (default en)
  --json         machine-readable output
  --email        append the customer email template
  -h, --help     this help

The input can also come from stdin. Examples
  stripe-declines do_not_honor
  stripe-declines "Your card has insufficient funds." --lang fr --email
  stripe-declines '{"code":"card_declined","decline_code":"lost_card"}' --json
`;

const isMain = typeof process !== "undefined" && process.argv[1] !== undefined && /cli\.(js|ts)$/.test(process.argv[1]);
if (isMain) {
  const argv = process.argv.slice(2);
  const read = () => {
    if (process.stdin.isTTY || argv.some((a) => !a.startsWith("-"))) return Promise.resolve("");
    return new Promise<string>((resolve) => {
      let buf = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (c) => (buf += c));
      process.stdin.on("end", () => resolve(buf));
    });
  };
  read().then((stdin) => {
    const { out, code } = run(argv, stdin);
    (code === 0 ? process.stdout : process.stderr).write(out);
    process.exitCode = code;
  });
}
