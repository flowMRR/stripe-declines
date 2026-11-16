import assert from "node:assert/strict";
import test from "node:test";
import { run } from "../src/cli.js";

test("a code prints its explanation and exits 0", () => {
  const { out, code } = run(["do_not_honor"]);
  assert.equal(code, 0);
  assert.match(out, /^do_not_honor — /);
  assert.match(out, /retry: likely · who fixes it: bank/);
  assert.match(out, /Guide: https:\/\/flow-mrr\.com\/en\/tools\/card-decline\/do-not-honor/);
  assert.doesNotMatch(out, /\{name\}/, "the email is only printed with --email");
  assert.doesNotMatch(out, /For the customer/, "the customer message is only printed with --customer");
});

test("--customer prints only the customer message; with --email, both are appended", () => {
  const only = run(["expired_card", "--customer"]);
  assert.equal(only.code, 0);
  assert.equal(only.out, "This card has expired. Please add a new card.\n");
  const fr = run(["expired_card", "--customer", "--lang", "fr"]);
  assert.equal(fr.out, "Cette carte a expiré. Ajoutez une nouvelle carte.\n");
  const both = run(["expired_card", "--customer", "--email"]);
  assert.match(both.out, /^expired_card — /);
  assert.match(both.out, /For the customer: This card has expired/);
  assert.match(both.out, /\{name\}/);
  assert.equal(JSON.parse(run(["expired_card", "--json"]).out).customer, "This card has expired. Please add a new card.");
});

test("--lang fr, --email and --json", () => {
  const fr = run(["Carte", "expirée", "--lang", "fr", "--email"]);
  assert.equal(fr.code, 0);
  assert.match(fr.out, /^expired_card — /);
  assert.match(fr.out, /Catégorie/);
  assert.match(fr.out, /\{name\}[\s\S]*\{company\}/);
  const json = run(['{"code":"card_declined","decline_code":"lost_card"}', "--json", "--lang=fr"]);
  assert.equal(json.code, 0);
  const parsed = JSON.parse(json.out);
  assert.equal(parsed.code, "lost_card");
  assert.equal(parsed.guide, "https://flow-mrr.com/fr/tools/card-decline/lost-card");
  assert.equal(parsed.retrySource, "code");
  const advised = run(['{"decline_code":"do_not_honor","advice_code":"do_not_try_again"}']);
  assert.match(advised.out, /retry: no \(advice_code do_not_try_again\)/);
});

test("--json output is complete for every code in both languages and options come in any order", () => {
  for (const code of ["do_not_honor", "expired_card", "lost_card", "merchant_blacklist", "card_declined"]) {
    for (const lang of ["en", "fr"]) {
      const { out, code: exit } = run(["--json", "--lang", lang, code]);
      assert.equal(exit, 0);
      const parsed = JSON.parse(out);
      for (const k of ["code", "category", "categoryLabel", "categorySummary", "fixer", "retry", "retrySource", "label", "meaning", "action", "customer", "email"]) assert.ok(parsed[k], `${code} ${lang} ${k}`);
      assert.ok(!("advice" in parsed), "no advice without an advice_code in the input");
    }
  }
  assert.equal(run(["expired_card", "--lang", "fr", "--customer"]).out, run(["--customer", "--lang=fr", "expired_card"]).out);
  assert.match(run(["Carte", "expirée"]).out, /^expired_card — /, "several words are joined into one input");
});

test("stdin is used when no input is given on the command line", () => {
  const { out, code } = run(["--json"], 'decline_code: "insufficient_funds"\n');
  assert.equal(code, 0);
  assert.equal(JSON.parse(out).code, "insufficient_funds");
});

test("a Radar note is explained, unknown text exits 1 with suggestions, bad options exit 2", () => {
  const note = run(['{"failure_code":"card_declined","outcome":{"reason":"highest_risk_level","type":"blocked"}}']);
  assert.equal(note.code, 0);
  assert.match(note.out, /^highest_risk_level: /);
  const miss = run(["expired"]);
  assert.equal(miss.code, 1);
  assert.match(miss.out, /Did you mean: expired_card/);
  assert.equal(run(["hello world"]).code, 1);
  assert.equal(run(["--lang", "de", "x"]).code, 2);
  assert.equal(run([]).code, 2);
  assert.equal(run(["--help"]).code, 0);
});
