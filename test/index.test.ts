import assert from "node:assert/strict";
import test from "node:test";
import {
  CATEGORIES,
  DECLINE_BY_CODE,
  DECLINE_CODES,
  DECLINE_NOTES,
  GUIDE_SLUGS,
  REVIEWED,
  ADVICE_TEXT,
  adviceText,
  customerMessage,
  explain,
  findAdvice,
  findCode,
  findNote,
  guideUrl,
  lookup,
  suggest,
  templateFor,
} from "../src/index.js";

// codes.json is cast to its types, not checked by tsc, so its shape is checked here.
test("codes.json holds only known categories, fixers and retry values", () => {
  const categories = Object.keys(CATEGORIES);
  assert.equal(DECLINE_BY_CODE.size, DECLINE_CODES.length, "duplicate code");
  for (const d of DECLINE_CODES) {
    assert.match(d.code, /^[a-z_]+$/, d.code);
    assert.ok(categories.includes(d.category), d.code);
    assert.ok(["bank", "customer", "you"].includes(d.fixer), d.code);
    assert.ok(["likely", "maybe", "no"].includes(d.retry), d.code);
    for (const l of ["en", "fr"] as const) for (const k of ["label", "meaning", "action", "customer"] as const) assert.ok(d[l][k]?.trim(), `${d.code} ${l}.${k}`);
  }
  for (const cat of categories) assert.ok(DECLINE_CODES.some((d) => d.category === cat), `empty category ${cat}`);
  for (const n of DECLINE_NOTES) for (const cat of n.categories) assert.ok(categories.includes(cat), n.term);
  assert.match(REVIEWED, /^\d{4}-\d{2}-\d{2}$/);
});

test("every guide slug belongs to a known code", () => {
  for (const [code, slug] of Object.entries(GUIDE_SLUGS)) {
    assert.ok(DECLINE_BY_CODE.has(code), code);
    assert.match(slug, /^[a-z-]+$/, slug);
  }
  assert.equal(guideUrl("do_not_honor"), "https://flow-mrr.com/en/tools/card-decline/do-not-honor");
  assert.equal(guideUrl("Do Not Honor", "fr"), "https://flow-mrr.com/fr/tools/card-decline/do-not-honor");
  assert.equal(guideUrl("invalid_cvc"), undefined);
});

test("lookup resolves an identifier in any spelling and nothing else", () => {
  for (const input of ["do not honor", "do-not-honor", "Do Not Honor", "do_not_honor", "  do_not_honor "]) {
    assert.equal(lookup(input)?.code, "do_not_honor", input);
  }
  assert.equal(lookup("Your card was declined."), undefined);
  assert.equal(lookup(""), undefined);
});

test("explain returns the flat shape, in both languages", () => {
  const en = explain("insufficient_funds");
  assert.ok(en);
  assert.equal(en.code, "insufficient_funds");
  assert.equal(en.category, "funds");
  assert.equal(en.categoryLabel, CATEGORIES.funds.en.label);
  assert.equal(en.email, templateFor(DECLINE_BY_CODE.get("insufficient_funds")!, "en"));
  assert.equal(en.customer, customerMessage("insufficient_funds"));
  assert.equal(en.guide, "https://flow-mrr.com/en/tools/card-decline/insufficient-funds");
  const fr = explain("Votre carte a des fonds insuffisants.", "fr");
  assert.ok(fr);
  assert.equal(fr.code, "insufficient_funds");
  assert.equal(fr.label, DECLINE_BY_CODE.get("insufficient_funds")!.fr.label);
  assert.equal(fr.guide, "https://flow-mrr.com/fr/tools/card-decline/insufficient-funds");
  assert.equal(explain("hello world"), null);
});

test("a missing, null or non-string input finds nothing instead of throwing; an unknown locale is English", () => {
  // Plain JavaScript callers pass whatever the error object holds; these must never crash a checkout.
  for (const bad of [undefined, null, "", "   ", 42, {}, []] as unknown[]) {
    assert.equal(explain(bad as string), null, String(bad));
    assert.equal(findCode(bad as string), null, String(bad));
    assert.equal(findNote(bad as string), null, String(bad));
    assert.equal(findAdvice(bad as string), null, String(bad));
    assert.equal(lookup(bad as string), undefined, String(bad));
    assert.equal(customerMessage(bad as string), null, String(bad));
    assert.equal(guideUrl(bad as string), undefined, String(bad));
    assert.deepEqual(suggest(bad as string), [], String(bad));
  }
  assert.equal(templateFor(undefined), undefined);
  assert.equal(templateFor(null), undefined);
  // The README's checkout line, with neither field set.
  const error = {} as { decline_code?: string; code?: string };
  assert.equal(customerMessage(error.decline_code ?? error.code, "fr") ?? "fallback", "fallback");
  // Locales: anything that is not French is English; French in any casing or with a region.
  const en = DECLINE_BY_CODE.get("lost_card")!.en.customer;
  const fr = DECLINE_BY_CODE.get("lost_card")!.fr.customer;
  assert.equal(explain("lost_card", "de" as "en")!.customer, en);
  assert.equal(customerMessage("lost_card", "de"), en);
  assert.equal(customerMessage("lost_card", undefined as unknown as string), en);
  assert.equal(customerMessage("lost_card", "fr-FR"), fr);
  assert.equal(customerMessage("lost_card", "FR"), fr);
  assert.equal(explain("lost_card", "fr-CA")!.guide, "https://flow-mrr.com/fr/tools/card-decline/lost-card");
  assert.equal(templateFor(DECLINE_BY_CODE.get("expired_card")!, "xx"), templateFor(DECLINE_BY_CODE.get("expired_card")!, "en"));
});

test("every code resolves from its own identifier, its labels and a decline_code field, and labels are unique", () => {
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  for (const l of ["en", "fr"] as const) {
    const labels = DECLINE_CODES.map((d) => fold(d[l].label));
    assert.equal(new Set(labels).size, labels.length, `${l} labels must be unique, or a label lookup is ambiguous`);
  }
  for (const d of DECLINE_CODES) {
    assert.equal(findCode(d.code)?.code, d.code);
    assert.equal(findCode(d.code.toUpperCase())?.code, d.code, `${d.code} upper-case`);
    assert.equal(findCode(d.en.label)?.code, d.code, d.en.label);
    assert.equal(findCode(d.fr.label)?.code, d.code, d.fr.label);
    assert.equal(findCode(`{"code":"card_declined","decline_code":"${d.code}"}`)?.code, d.code, `${d.code} in a payload`);
    assert.equal(lookup(d.code.replace(/_/g, " "))?.code, d.code);
    for (const l of ["en", "fr"] as const) {
      const x = explain(d.code, l)!;
      assert.equal(x.categoryLabel, CATEGORIES[d.category][l].label, `${d.code} ${l}`);
      assert.equal(x.customer, d[l].customer);
      assert.equal(x.email, templateFor(d, l));
      assert.equal(x.retrySource, "code");
      for (const k of ["label", "meaning", "action", "customer", "email", "categorySummary"] as const) assert.ok(x[k].trim(), `${d.code} ${l} ${k}`);
    }
  }
});

test("payload shapes from the API, webhooks and the Stripe CLI resolve to the decline reason", () => {
  for (const [input, code] of [
    // PaymentIntent with last_payment_error.
    ['{"id":"pi_3Q","object":"payment_intent","last_payment_error":{"code":"card_declined","decline_code":"insufficient_funds","message":"Your card has insufficient funds.","type":"card_error"},"status":"requires_payment_method"}', "insufficient_funds"],
    // A webhook event wrapping a failed Charge.
    ['{"type":"charge.failed","data":{"object":{"object":"charge","failure_code":"card_declined","failure_message":"Your card was declined.","outcome":{"network_status":"declined_by_network","reason":"generic_decline","type":"issuer_declined"}}}}', "generic_decline"],
    // An invoice.payment_failed event where only the message survived.
    ['{"type":"invoice.payment_failed","data":{"object":{"last_finalization_error":null,"attempt_count":2,"status":"open"}}} Your card has expired.', "expired_card"],
    // A Stripe CLI log line and a query-string style line.
    ["2026-11-16 10:12:03   --> charge.failed [evt_1QabcDEF] decline_code=do_not_honor advice_code=try_again_later", "do_not_honor"],
    // CRLF, tabs and odd spacing from a pasted dashboard or email.
    ['"decline_code":\r\n\t"lost_card",\r\n"advice_code": "do_not_try_again"', "lost_card"],
    // Python repr with None and single quotes.
    ["{'code': 'card_declined', 'decline_code': 'authentication_required', 'doc_url': None}", "authentication_required"],
    // Only a network-style explanation and the message.
    ["Payment failed - Your card's security code is incorrect.", "incorrect_cvc"],
  ] as const) {
    assert.equal(findCode(input)?.code, code, input);
  }
  // A blocked charge keeps its note even when a message is around.
  const blocked = '{"type":"charge.failed","data":{"object":{"failure_code":"card_declined","failure_message":"Your card was declined.","outcome":{"reason":"highest_risk_level","risk_level":"highest","type":"blocked"}}}}';
  assert.equal(findCode(blocked), null);
  assert.equal(findNote(blocked)?.term, "highest_risk_level");
});

test("large or hostile input is handled quickly and finds nothing or the right code", () => {
  const junk = "x".repeat(200_000) + " ".repeat(1000) + "y".repeat(200_000);
  let t = Date.now();
  assert.equal(findCode(junk), null);
  assert.equal(findNote(junk), null);
  assert.equal(explain(junk), null);
  assert.ok(Date.now() - t < 1000, `garbage took ${Date.now() - t}ms`);
  t = Date.now();
  assert.equal(findCode(`${junk} decline_code: expired_card`)?.code, "expired_card");
  assert.ok(Date.now() - t < 1000, `needle took ${Date.now() - t}ms`);
  // Regex-sensitive characters and quotes in the text do not break the field scanner.
  assert.equal(findCode('message: "Card (****4242) declined [decline_code=do_not_honor] $0.00 ^$"')?.code, "do_not_honor");
  assert.equal(findCode("(((("), null);
});

test("codes.json is clean text: no stray whitespace, every sentence ends, notes complete", () => {
  const texts: [string, string][] = [];
  for (const d of DECLINE_CODES) for (const l of ["en", "fr"] as const) {
    for (const k of ["label", "meaning", "action", "customer"] as const) texts.push([`${d.code}.${l}.${k}`, d[l][k]]);
    if (d.template) texts.push([`${d.code}.template.${l}`, d.template[l]]);
  }
  for (const [cat, info] of Object.entries(CATEGORIES)) for (const l of ["en", "fr"] as const) for (const k of ["label", "summary", "template"] as const) texts.push([`${cat}.${l}.${k}`, info[l][k]]);
  for (const [advice, info] of Object.entries(ADVICE_TEXT)) for (const l of ["en", "fr"] as const) for (const k of ["action", "customer", "template"] as const) texts.push([`advice.${advice}.${l}.${k}`, info[l][k]]);
  for (const [where, s] of texts) {
    assert.equal(s, s.trim(), `${where}: leading or trailing whitespace`);
    assert.doesNotMatch(s, /  |\t/, `${where}: double space or tab`);
    assert.doesNotMatch(s, /[`<>]/, `${where}: markup`);
    if (where.endsWith(".meaning") || where.endsWith(".action") || where.endsWith(".customer") || where.endsWith(".summary")) assert.match(s, /[.!?)]$/, `${where}: does not end a sentence`);
  }
  for (const n of DECLINE_NOTES) {
    assert.match(n.term, /^[a-z_]+$/);
    assert.ok(n.en.trim() && n.fr.trim(), n.term);
    if (n.field) assert.equal(n.field, "reason", n.term);
  }
  assert.equal(new Set(DECLINE_NOTES.map((n) => n.term)).size, DECLINE_NOTES.length);
});

test("Stripe's advice_code, when pasted, decides the retry verdict", () => {
  assert.equal(findAdvice('{"decline_code":"do_not_honor","advice_code":"try_again_later"}'), "try_again_later");
  assert.equal(findAdvice("decline_code: insufficient_funds"), null);
  assert.equal(findAdvice('{"advice_code":"something_new"}'), null);
  const table = explain("do_not_honor")!;
  assert.equal(table.retrySource, "code");
  assert.equal(table.advice, undefined);
  const stop = explain('{"code":"card_declined","decline_code":"do_not_honor","advice_code":"do_not_try_again"}')!;
  assert.equal(stop.code, "do_not_honor");
  assert.equal(stop.retry, "no");
  assert.equal(stop.retrySource, "advice_code");
  assert.equal(stop.advice, "do_not_try_again");
  const fix = explain('{"outcome":{"reason":"expired_card","advice_code":"confirm_card_data","type":"issuer_declined"}}')!;
  assert.equal(fix.code, "expired_card");
  assert.equal(fix.retry, "no");
  assert.equal(fix.advice, "confirm_card_data");
  // A Charge Adaptive Acceptance blocked: not a decline, explained by a note.
  const blocked = '{"failure_code":"card_declined","outcome":{"reason":"low_probability_of_authorization","advice_code":"do_not_try_again","type":"blocked"}}';
  assert.equal(findCode(blocked), null);
  assert.equal(findNote(blocked)?.term, "low_probability_of_authorization");
});

test("codes Stripe documents as 'unknown reason' are not explained as certainties", () => {
  // Stripe's reference gives no reason for these; the meaning must say so before any network reading.
  for (const code of ["do_not_honor", "stop_payment_order", "revocation_of_authorization", "revocation_of_all_authorizations", "security_violation", "call_issuer", "do_not_try_again"]) {
    const d = DECLINE_BY_CODE.get(code)!;
    assert.match(d.en.meaning, /unknown reason|gives no reason|says only/, code);
    assert.match(d.fr.meaning, /raison inconnue|ne donne pas de raison|indique seulement/, code);
  }
  // And the customer is never told what we do not know (that they stopped the payments).
  for (const code of ["stop_payment_order", "revocation_of_authorization", "revocation_of_all_authorizations"]) {
    const d = DECLINE_BY_CODE.get(code)!;
    assert.doesNotMatch(d.en.customer, /your request|you withdrew|you asked/i, code);
    assert.doesNotMatch(d.fr.customer, /votre demande|vous avez/i, code);
    assert.doesNotMatch(templateFor(d, "en"), /from your side|at your request/i, code);
  }
  // Stripe: present these like a generic decline. Same wording as the fraud-lane cards, nothing more.
  for (const code of ["fraudulent", "lost_card", "stolen_card", "pickup_card", "merchant_blacklist"]) {
    const d = DECLINE_BY_CODE.get(code)!;
    for (const l of ["en", "fr"] as const) assert.match(d[l].customer, /^(Your card was declined|This payment was declined|Votre carte a été refusée|Ce paiement a été refusé)\./, `${code} ${l}`);
  }
  assert.match(DECLINE_BY_CODE.get("card_declined")!.en.meaning, /^Not a decline code/);
  assert.match(DECLINE_BY_CODE.get("generic_decline")!.en.meaning, /Radar/);
  assert.equal(DECLINE_BY_CODE.get("mobile_device_authentication_required")!.category, "auth");
});

test("the customer message of every code is short, self-contained and consistent with its verdict", () => {
  assert.equal(customerMessage("Expired card"), DECLINE_BY_CODE.get("expired_card")!.en.customer);
  assert.equal(customerMessage("expired_card", "fr"), DECLINE_BY_CODE.get("expired_card")!.fr.customer);
  assert.equal(customerMessage("nope"), null);
  for (const d of DECLINE_CODES) {
    for (const l of ["en", "fr"] as const) {
      const text = d[l].customer;
      const where = `${d.code} ${l}`;
      assert.ok(text.length <= 220, `${where}: ${text.length} chars`);
      assert.doesNotMatch(text, /\{[a-z]+\}/, `${where}: placeholder`);
      assert.doesNotMatch(text, /stripe|radar|decline_code|smart retries/i, `${where}: names our side`);
      // A customer is never told that the card was reported, flagged or fraudulent.
      assert.doesNotMatch(text, /lost|stolen|fraud|flagged|perdu|vol[ée]e?\b|fraud|signal[ée]e/i, `${where}: fraud wording`);
      // Nor promised a retry on our side, or told to retry a card that cannot work.
      assert.doesNotMatch(text, /we will try again|we'll try again|nous réessaierons|nous allons réessayer/i, `${where}: promises a retry`);
      if (d.retry === "no") assert.doesNotMatch(text, /try again later|try again in|réessayez plus tard|réessayez dans/i, `${where}: retry no`);
      if (d.fixer === "customer") {
        assert.doesNotMatch(text, /nothing (to do|to change|is needed)|rien à (faire|modifier)|aucune action/i, `${where}: customer must act`);
        assert.match(text, /card|carte|bank|banque|verification|vérification|device|appareil|cvc|expiry|expiration|address|adresse/i, `${where}: says what to do`);
      }
    }
  }
});

test("the classification follows FlowMRR's recovery rules", () => {
  for (const code of ["card_velocity_exceeded", "restricted_card", "transaction_not_allowed"]) {
    assert.equal(DECLINE_BY_CODE.get(code)!.retry, "no", code);
  }
  assert.equal(DECLINE_BY_CODE.get("restricted_card")!.category, "restricted");
  // Hard, so not in "funds", whose summary and email promise a retry.
  assert.equal(DECLINE_BY_CODE.get("card_velocity_exceeded")!.category, "limit");
  for (const l of ["en", "fr"] as const) assert.doesNotMatch(CATEGORIES.limit[l].template, /retry|réessa/i);
  assert.equal(DECLINE_BY_CODE.get("authentication_required")!.category, "auth");
});

test("a code typed with spaces or hyphens resolves directly, like one with underscores", () => {
  for (const input of ["do not honor", "do-not-honor", "Do Not Honor", "do_not_honor"]) {
    assert.equal(findCode(input)?.code, "do_not_honor", input);
  }
  assert.equal(findCode("insufficient funds")?.code, "insufficient_funds");
  assert.equal(findCode("card velocity exceeded")?.code, "card_velocity_exceeded");
  assert.equal(findCode("Carte expirée")?.code, "expired_card");
});

test("card_velocity_exceeded follows Stripe's definition: balance, credit or amount limit", () => {
  const meaning = DECLINE_BY_CODE.get("card_velocity_exceeded")!.en.meaning;
  assert.match(meaning, /balance, credit limit or transaction amount limit/);
  assert.doesNotMatch(meaning, /short window/);
});

test("highest_risk_level is explained as a Radar rating, not a decline code", () => {
  assert.equal(findCode("highest_risk_level"), null);
  assert.deepEqual(suggest("highest_risk_level"), []);
  const note = findNote("outcome.reason: highest_risk_level");
  assert.ok(note);
  assert.deepEqual(note.categories, ["fraud", "merchant"]);
  assert.equal(findNote("hello world"), null);
});

test("Stripe's customer-facing messages resolve to their decline code", () => {
  for (const [message, code] of [
    ["Your card was declined.", "card_declined"],
    ["Your card has insufficient funds.", "insufficient_funds"],
    ["Your card has expired.", "expired_card"],
    ["Your card’s security code is incorrect.", "incorrect_cvc"],
    ["Your card number is incorrect.", "incorrect_number"],
    ["Your card was declined. This transaction requires authentication.", "authentication_required"],
    ["An error occurred while processing your card. Try again in a little bit.", "processing_error"],
    ["Your card does not support this type of purchase.", "card_not_supported"],
    ["Votre carte a été refusée.", "card_declined"],
    ["Votre carte a des fonds insuffisants.", "insufficient_funds"],
  ] as const) {
    assert.equal(findCode(message)?.code, code, message);
  }
});

test("an explicit code in the pasted text still wins over the message wording", () => {
  assert.equal(findCode("Your card was declined. decline_code: do_not_honor")?.code, "do_not_honor");
  assert.equal(findCode("generic_decline")?.code, "generic_decline");
});

test("a pasted Stripe payload resolves to its decline_code, never to its advice_code", () => {
  assert.equal(findCode('{"code":"card_declined","decline_code":"lost_card","advice_code":"try_again_later"}')?.code, "lost_card");
  assert.equal(findCode('{"code":"card_declined","decline_code":"generic_decline","advice_code":"do_not_try_again"}')?.code, "generic_decline");
  assert.equal(findCode("decline_code: insufficient_funds, advice_code: try_again_later")?.code, "insufficient_funds");
  // A Charge: the reason sits in outcome.reason, failure_code is the generic card_declined.
  assert.equal(findCode('{"failure_code":"card_declined","outcome":{"reason":"expired_card","type":"issuer_declined"}}')?.code, "expired_card");
  assert.equal(findCode('{"error":{"code":"card_declined","advice_code":"try_again_later"}}')?.code, "card_declined");
});

test("a Radar-blocked charge shows the note, not a 'retry likely' card_declined", () => {
  const charge = '{"failure_code":"card_declined","outcome":{"reason":"highest_risk_level","type":"blocked"}}';
  assert.equal(findCode(charge), null);
  assert.equal(findNote(charge)?.term, "highest_risk_level");
});

test("Stripe's test-card messages resolve to testmode_decline", () => {
  for (const message of [
    "Your card was declined. Your request was in test mode, but used a non test (live) card.",
    "Your card was declined. Your request was in live mode, but used a known test card.",
  ]) assert.equal(findCode(message)?.code, "testmode_decline", message);
});

test("limit declines follow Stripe: another payment method, no retry", () => {
  for (const code of ["withdrawal_count_limit_exceeded", "card_velocity_exceeded"]) {
    assert.equal(DECLINE_BY_CODE.get(code)!.category, "limit", code);
    assert.equal(DECLINE_BY_CODE.get(code)!.retry, "no", code);
  }
  assert.equal(DECLINE_BY_CODE.get("merchant_blacklist")!.category, "merchant");
});

test("when advice_code decides the verdict, the customer message and the email follow it, for every code", () => {
  const advices = ["do_not_try_again", "try_again_later", "confirm_card_data"] as const;
  // What a customer must never read under a "no" verdict: a retry, by them or by us.
  const RETRY = { en: /try again|retry|automatically|we may try/i, fr: /réessa|nouvelle tentative|relance|tentative ultérieure/i };
  // What a customer must never read under a "likely" verdict: that the card is dead or wrong.
  // ("or use another card" as a fallback is fine; "add a new card" is not.)
  const DEAD_CARD = { en: /new card|different card|cannot be used|expired|incorrect|not valid/i, fr: /nouvelle carte|ne peut pas être utilisée|expir|incorrect|pas valide/i };
  for (const a of advices) for (const l of ["en", "fr"] as const) {
    const t = adviceText(a, l);
    assert.equal(t.customer, ADVICE_TEXT[a][l].customer);
    assert.equal(t.email, ADVICE_TEXT[a][l].template);
    assert.equal(t.action, ADVICE_TEXT[a][l].action);
    assert.equal(t.fixer, ADVICE_TEXT[a].fixer);
    assert.ok(["bank", "customer", "you"].includes(t.fixer), `${a}: fixer`);
    // A "no" advice's action never tells you to retry (same rule as the codes' actions).
    if (a !== "try_again_later") {
      const action = t.action.toLowerCase().replace(/(do not|don't|never|not|ne) (count on a )?(retr\w*|réessayez)/g, "");
      assert.doesNotMatch(action, /\bretr(y|ies|ying)\b|réessa|nouvelle tentative/, `${a} ${l}: ${t.action}`);
    }
    assert.ok(t.customer.length <= 220, `${a} ${l}: ${t.customer.length} chars`);
    assert.doesNotMatch(t.customer, /\{[a-z]+\}/, `${a} ${l}: placeholder in the customer message`);
    assert.match(t.email, /\{name\}[\s\S]*\{product\}[\s\S]*\{link\}[\s\S]*\{company\}/, `${a} ${l}: email placeholders`);
    for (const s of [t.customer, t.email]) {
      assert.doesNotMatch(s, /stripe|radar|decline_code|smart retries|advice_code/i, `${a} ${l}: names our side`);
      assert.doesNotMatch(s, /lost|stolen|fraud|flagged|perdu|vol[ée]e?\b|signal[ée]e/i, `${a} ${l}: fraud wording`);
      assert.doesNotMatch(s, /we will try again|we'll try again|we will retry|nous réessaierons|nous allons réessayer/i, `${a} ${l}: promises a retry`);
    }
  }
  assert.equal(adviceText("nope"), undefined);
  assert.equal(adviceText(null), undefined);
  assert.equal(adviceText(undefined), undefined);
  assert.equal(adviceText("Do Not Try Again", "fr-FR")!.customer, ADVICE_TEXT.do_not_try_again.fr.customer);
  assert.equal(adviceText("confirm_card_data", "xx" as "en").customer, ADVICE_TEXT.confirm_card_data.en.customer);
  // Every code × advice × locale: the entries come from the advice when it applies and
  // agree with the verdict. On a blocked card (fraud) the advice can only make the
  // verdict stricter: try_again_later on a stolen_card keeps "no" and the code's own entries.
  const STRICTNESS = { no: 0, maybe: 1, likely: 2 } as const;
  const VERDICT = { do_not_try_again: "no", try_again_later: "likely", confirm_card_data: "no" } as const;
  for (const d of DECLINE_CODES) for (const a of advices) for (const l of ["en", "fr"] as const) {
    const x = explain(JSON.stringify({ decline_code: d.code, advice_code: a }), l)!;
    const where = `${d.code} + ${a} ${l}`;
    assert.ok(x, where);
    assert.equal(x.code, d.code, where);
    assert.equal(x.advice, a, `${where}: the advice in the input is always reported`);
    const applies = d.category !== "fraud" || STRICTNESS[VERDICT[a]] <= STRICTNESS[d.retry];
    if (applies) {
      assert.equal(x.retrySource, "advice_code", where);
      assert.equal(x.retry, VERDICT[a], where);
      assert.equal(x.customer, ADVICE_TEXT[a][l].customer, where);
      assert.equal(x.email, ADVICE_TEXT[a][l].template, where);
      assert.equal(x.action, ADVICE_TEXT[a][l].action, where);
      assert.equal(x.fixer, ADVICE_TEXT[a].fixer, where);
    } else {
      assert.equal(x.retrySource, "code", `${where}: a looser advice does not apply to a blocked card`);
      assert.equal(x.retry, d.retry, where);
      assert.equal(x.customer, d[l].customer, where);
      assert.equal(x.email, templateFor(d, l), where);
      assert.equal(x.action, d[l].action, where);
      assert.equal(x.fixer, d.fixer, where);
    }
    // Whatever decided it, the verdict is never looser than a blocked card's own.
    if (d.category === "fraud") assert.equal(x.retry, "no", `${where}: a blocked card is never retried`);
    // customerMessage agrees with explain, from a payload or from a bare code plus the advice.
    assert.equal(customerMessage(JSON.stringify({ decline_code: d.code, advice_code: a }), l), x.customer, `${where}: customerMessage(payload)`);
    assert.equal(customerMessage(d.code, l, a), x.customer, `${where}: customerMessage(code, locale, advice)`);
    if (x.retry === "no") assert.doesNotMatch(customerMessage(d.code, l, a)!, /try again later|try again in|réessayez plus tard|réessayez dans/i, `${where}: customerMessage promises a retry under "no"`);
    // The code's own texts are checked by their own test above; here, the advice texts.
    if (!applies) continue;
    if (x.retry === "no") {
      assert.doesNotMatch(x.customer, RETRY[l], `${where}: the customer message promises a retry under "no"`);
      assert.doesNotMatch(x.email, RETRY[l], `${where}: the email promises a retry under "no"`);
    } else {
      assert.doesNotMatch(x.customer, DEAD_CARD[l], `${where}: the customer message asks for a new card under "likely"`);
    }
  }
  // The pair from the bug report: a soft code under do_not_try_again.
  const never = explain('{"decline_code":"do_not_honor","advice_code":"do_not_try_again"}')!;
  assert.equal(never.retry, "no");
  assert.equal(never.fixer, "customer", "the advice puts the customer in charge, not the bank");
  assert.doesNotMatch(never.action, /Stripe's schedule/);
  assert.match(never.action, /^Don't retry this card\./);
  assert.doesNotMatch(never.customer, /try again/i);
  assert.doesNotMatch(never.email, /try again|automatically/i);
  assert.match(never.customer, /another card/);
  // confirm_card_data: check the details, no "later".
  const confirm = explain('{"decline_code":"do_not_honor","advice_code":"confirm_card_data"}', "en")!;
  assert.match(confirm.customer, /check the card number, expiry date and security code/i);
  assert.doesNotMatch(confirm.customer, /later/i);
  assert.match(explain('{"decline_code":"generic_decline","advice_code":"confirm_card_data"}', "fr")!.customer, /date d'expiration/);
  // try_again_later on a dead card: the advice wins, the customer is told to try later.
  const later = explain('{"decline_code":"expired_card","advice_code":"try_again_later"}')!;
  assert.equal(later.retry, "likely");
  assert.match(later.customer, /try again later/i);
  // try_again_later on a stolen card: networks penalise retries on these codes, so the
  // advice does not loosen the verdict; the customer still sees a generic decline.
  const stolen = explain('{"decline_code":"stolen_card","advice_code":"try_again_later"}')!;
  assert.equal(stolen.retry, "no");
  assert.equal(stolen.retrySource, "code");
  assert.equal(stolen.advice, "try_again_later");
  assert.equal(stolen.fixer, "customer");
  assert.doesNotMatch(stolen.customer + stolen.email + stolen.action, /try again|automatically|smart retries/i);
  assert.doesNotMatch(stolen.customer, /stolen/i);
  // A stricter advice still applies to a blocked card.
  assert.equal(explain('{"decline_code":"lost_card","advice_code":"confirm_card_data"}')!.retrySource, "advice_code");
  assert.equal(explain('{"decline_code":"fraudulent","advice_code":"do_not_try_again"}')!.customer, ADVICE_TEXT.do_not_try_again.en.customer);
  // customerMessage: the README's checkout line, an unknown advice, a message, a label.
  assert.equal(customerMessage("do_not_honor", "en", "do_not_try_again"), ADVICE_TEXT.do_not_try_again.en.customer);
  assert.equal(customerMessage("do_not_honor", "fr", "Do Not Try Again"), ADVICE_TEXT.do_not_try_again.fr.customer);
  assert.equal(customerMessage("do_not_honor", "en", "nonsense"), DECLINE_BY_CODE.get("do_not_honor")!.en.customer);
  assert.equal(customerMessage("do_not_honor", "en", null), DECLINE_BY_CODE.get("do_not_honor")!.en.customer);
  assert.equal(customerMessage("stolen_card", "en", "try_again_later"), DECLINE_BY_CODE.get("stolen_card")!.en.customer, "a blocked card keeps its neutral message");
  assert.equal(customerMessage("nope", "en", "do_not_try_again"), null);
  assert.equal(customerMessage("Your card has insufficient funds."), DECLINE_BY_CODE.get("insufficient_funds")!.en.customer);
  assert.equal(customerMessage("Carte expirée", "fr"), DECLINE_BY_CODE.get("expired_card")!.fr.customer);
  // Without an advice_code, the code's own entries, unchanged.
  assert.equal(explain("do_not_honor")!.customer, DECLINE_BY_CODE.get("do_not_honor")!.en.customer);
  assert.equal(explain("do_not_honor")!.action, DECLINE_BY_CODE.get("do_not_honor")!.en.action);
  assert.equal(explain("do_not_honor")!.fixer, "bank");
  assert.equal(explain("do_not_honor")!.email, templateFor(DECLINE_BY_CODE.get("do_not_honor")!, "en"));
});

test("customer emails never promise what some code in their category contradicts", () => {
  for (const [cat, info] of Object.entries(CATEGORIES)) {
    const codes = DECLINE_CODES.filter((d) => d.category === cat);
    for (const l of ["en", "fr"] as const) {
      // A retry is never promised outright: it depends on the account's retry settings.
      assert.doesNotMatch(info[l].template, /we will retry|we'll retry|nous réessaierons/i, `${cat} ${l}`);
      if (codes.some((d) => d.retry === "no")) assert.doesNotMatch(info[l].template, /retry|try again|réessa|nouvelle tentative|relance/i, `${cat} ${l}`);
      if (codes.some((d) => d.fixer === "customer")) assert.doesNotMatch(info[l].template, /no action is needed|aucune action/i, `${cat} ${l}`);
    }
  }
});

test("decline texts are plain text", () => {
  for (const d of DECLINE_CODES) for (const l of ["en", "fr"] as const) assert.doesNotMatch(`${d[l].meaning} ${d[l].action}`, /`/, d.code);
});

test("unrelated text still finds nothing", () => {
  assert.equal(findCode("hello world"), null);
  assert.equal(findCode(""), null);
  assert.equal(findCode("   "), null);
});

test("a charge blocked by a Radar rule at elevated risk gets the Radar note too", () => {
  const charge = '{"failure_code":"card_declined","outcome":{"reason":"elevated_risk_level","risk_level":"elevated","type":"blocked"}}';
  assert.equal(findCode(charge), null);
  assert.equal(findNote(charge)?.term, "elevated_risk_level");
});

test("payloads pasted from Node, Python, PHP or Ruby resolve to the decline reason, not advice_code", () => {
  for (const [input, code] of [
    ["{'code': 'card_declined', 'decline_code': 'do_not_honor', 'advice_code': 'try_again_later'}", "do_not_honor"],
    ["StripeCardError { code: 'card_declined', decline_code: 'generic_decline', advice_code: 'do_not_try_again' }", "generic_decline"],
    ['["decline_code"]=>\n  string(17) "insufficient_funds"\n  ["advice_code"]=>\n  string(15) "try_again_later"', "insufficient_funds"],
    [':decline_code => "lost_card", :advice_code => "do_not_try_again"', "lost_card"],
    ["{'advice_code': 'try_again_later', 'code': 'card_declined'}", "card_declined"],
  ] as const) assert.equal(findCode(input)?.code, code, input);
});

test("a dispute or refund reason is not read as a decline", () => {
  assert.equal(findCode('{"object":"dispute","reason":"fraudulent","status":"needs_response"}'), null);
  // ...but a Charge outcome's reason is.
  assert.equal(findCode('{"outcome":{"reason":"expired_card"}}')?.code, "expired_card");
});

test("a charge blocked by one of your own Radar rules gets the rule note", () => {
  for (const charge of [
    '{"failure_code":"card_declined","outcome":{"reason":"rule","type":"blocked"}}',
    "{'failure_code': 'card_declined', 'outcome': {'type': 'blocked', 'reason': None}}",
  ]) {
    assert.equal(findCode(charge), null, charge);
    assert.equal(findNote(charge)?.term, "rule", charge);
  }
  // "rule" in ordinary text is not a note.
  assert.equal(findNote("my retry rule failed"), null);
});

test("Stripe's newer codes are covered and resolve to themselves", () => {
  for (const code of ["incorrect_address", "authentication_not_handled", "mobile_device_authentication_required"]) {
    assert.equal(findCode(code)?.code, code);
  }
  assert.match(DECLINE_BY_CODE.get("try_again_later")!.en.meaning, /deprecated/);
  assert.match(DECLINE_BY_CODE.get("do_not_try_again")!.fr.meaning, /obsolète/);
});

test("a 'do not retry' code's advice never tells you to retry", () => {
  for (const d of DECLINE_CODES.filter((x) => x.retry === "no")) {
    const en = d.en.action.toLowerCase().replace(/(do not|don't|never|not) (count on a )?retr\w*/g, "").replace(/retrying (will fail|the same card will not help)/g, "");
    assert.doesNotMatch(en, /\bretr(y|ies|ying)\b/, `${d.code}: ${d.en.action}`);
    const fr = d.fr.action.toLowerCase().replace(/ne (réessayez|comptez) pas[^.;]*/g, "");
    assert.doesNotMatch(fr, /réessa|nouvelle tentative/, `${d.code}: ${d.fr.action}`);
  }
});

test("every customer email fits its code: per-code emails where the category's does not", () => {
  const card = DECLINE_BY_CODE.get("card_not_supported")!;
  assert.doesNotMatch(templateFor(card, "en"), /will let you know if anything is needed/);
  for (const code of ["revocation_of_authorization", "stop_payment_order"]) {
    assert.match(templateFor(DECLINE_BY_CODE.get(code)!, "en"), /cancel/, code);
    assert.match(templateFor(DECLINE_BY_CODE.get(code)!, "fr"), /résilier/, code);
  }
  assert.match(templateFor(DECLINE_BY_CODE.get("incorrect_pin")!, "en"), /in person/);
  for (const d of DECLINE_CODES) for (const l of ["en", "fr"] as const) {
    assert.match(templateFor(d, l), /\{name\}[\s\S]*\{product\}[\s\S]*\{company\}/, `${d.code} ${l}`);
    if (d.template) assert.doesNotMatch(d.template[l], /we will retry|we'll retry|nous réessaierons/i, d.code);
  }
});
