/**
 * Stripe card decline codes, explained for people recovering failed
 * subscription payments.
 *
 * `category` drives the remediation advice and the customer message template:
 *   soft       — transient issuer refusal; a later retry often succeeds
 *   funds      — balance or card limits; a retry a few days later often succeeds
 *   card       — the card on file is dead or wrong; only the customer can fix it
 *   limit      — a card limit was hit; the issuer refuses until it changes (no retry)
 *   restricted — the card cannot be used for this kind of payment; another card or a bank change
 *   auth       — the bank wants the cardholder to authenticate (3DS/SCA)
 *   fraud      — the issuer blocked the card; never retry, ask for another card
 *   merchant   — something on YOUR side (account, amount, currency, config)
 *
 * `retry` is per code and wins over the category summary.
 *
 * The data lives in codes.json (also shipped in the package, for other
 * languages); this module adds the lookup and the parsing of pasted text.
 */
import { data, guides } from "./data.generated.js";

export type DeclineCategory = "soft" | "funds" | "card" | "limit" | "restricted" | "auth" | "fraud" | "merchant";
/** Who can make the next attempt succeed. */
export type Fixer = "bank" | "customer" | "you";
/** Whether retrying the same card can succeed. */
export type Retry = "likely" | "maybe" | "no";
export type Locale = "en" | "fr";

export type DeclineText = { label: string; meaning: string; action: string };

export type DeclineCode = {
  code: string;
  category: DeclineCategory;
  fixer: Fixer;
  retry: Retry;
  en: DeclineText;
  fr: DeclineText;
  /** Customer email for a code its category's email does not fit (see `templateFor`). */
  template?: Record<Locale, string>;
};

export type CategoryText = { label: string; summary: string; template: string };
export type CategoryInfo = Record<Locale, CategoryText>;

/**
 * Values people paste that are not decline codes but have a known meaning.
 * `highest_risk_level` is the charge's `outcome.reason` when Stripe Radar itself
 * blocked the payment (`outcome.risk_level: "highest"`), not an issuer decline.
 */
export type DeclineNote = { term: string; field?: string; categories: DeclineCategory[]; en: string; fr: string };

/** Date the data was last checked against Stripe's decline-code reference (YYYY-MM-DD). */
export const REVIEWED: string = data.reviewed;
export const CATEGORIES = data.categories as Record<DeclineCategory, CategoryInfo>;
export const DECLINE_CODES = data.codes as DeclineCode[];
export const DECLINE_NOTES = data.notes as DeclineNote[];
export const DECLINE_BY_CODE: ReadonlyMap<string, DeclineCode> = new Map(DECLINE_CODES.map((d) => [d.code, d]));

/** Codes that have a long-form guide on flow-mrr.com, by code → guide slug. */
export const GUIDE_SLUGS: Readonly<Record<string, string>> = guides;
const GUIDES_BASE = "https://flow-mrr.com";

/** The long-form guide for a code, when there is one. */
export const guideUrl = (code: string, locale: Locale = "en"): string | undefined => {
  const slug = GUIDE_SLUGS[normalise(code)];
  return slug ? `${GUIDES_BASE}/${locale}/tools/card-decline/${slug}` : undefined;
};

/** The customer email for a code: its own when the category's does not fit, else the category's. */
export const templateFor = (d: DeclineCode, locale: Locale = "en"): string => d.template?.[locale] ?? CATEGORIES[d.category][locale].template;

/** `do not honor`, `Do-Not-Honor` and `do_not_honor` name the same code. */
const normalise = (value: string) => value.trim().toLowerCase().replace(/[\s-]+/g, "_");

/** A decline code by its identifier (spaces and hyphens accepted); `undefined` when unknown. */
export const lookup = (code: string): DeclineCode | undefined => DECLINE_BY_CODE.get(normalise(code));

/**
 * Stripe's own customer-facing messages (English, and the French ones Checkout
 * shows), most specific first. Founders usually have the message the customer
 * saw, not the code behind it.
 */
const MESSAGE_PATTERNS: [RegExp, string][] = [
  [/requires authentication|authentication is required|authentification (forte )?(est )?(requise|obligatoire)|n[ée]cessite une authentification/, "authentication_required"],
  [/test mode, but (you )?used a non.?test|live mode, but used a known test card|test card in live mode|carte de test/, "testmode_decline"],
  [/insufficient funds|fonds insuffisants/, "insufficient_funds"],
  [/velocity limit|repeated attempts too frequently|trop de tentatives/, "card_velocity_exceeded"],
  [/has expired|carte a expir[ée]e?/, "expired_card"],
  [/security code is incorrect|code de s[ée]curit[ée] .*incorrect/, "incorrect_cvc"],
  [/security code is invalid|code de s[ée]curit[ée] .*invalide/, "invalid_cvc"],
  [/expiration month is invalid|mois d.expiration .*invalide/, "invalid_expiry_month"],
  [/expiration year is invalid|ann[ée]e d.expiration .*invalide/, "invalid_expiry_year"],
  [/(zip|postal) code is incorrect|code postal .*incorrect/, "incorrect_zip"],
  [/card number is incorrect|num[ée]ro de (votre )?carte .*incorrect/, "incorrect_number"],
  [/card number is invalid|num[ée]ro de (votre )?carte .*invalide/, "invalid_number"],
  [/does not support the currency|ne prend pas en charge la devise/, "currency_not_supported"],
  [/does not support this type of purchase|ne prend pas en charge ce type d.achat/, "card_not_supported"],
  [/error occurred while processing your card|erreur .*lors du traitement de votre carte/, "processing_error"],
  [/call your bank for details|appeler votre banque/, "call_issuer"],
  [/card was declined|carte a [ée]t[ée] refus[ée]e/, "card_declined"],
];

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** Exact label → code, so "Do not honor" or "Carte expirée" resolve like the code itself. */
const BY_LABEL = new Map(DECLINE_CODES.flatMap((d) => [[fold(d.en.label), d], [fold(d.fr.label), d]] as [string, DeclineCode][]));

/**
 * Fields of a Stripe error, Charge or webhook payload that can hold the decline
 * reason, most specific first: the error's `decline_code`, the Charge's
 * `outcome.reason`, then the generic `failure_code` / `code` (usually just
 * `card_declined`). `reason` only counts inside a Charge `outcome`: a dispute's
 * `reason: "fraudulent"` is not a decline.
 */
const REASON_FIELDS = ["decline_code", "reason", "failure_code", "code"];
/**
 * `key: value` in the shapes people paste: JSON (`"key": "v"`), JS/Node logs and Python
 * dicts (`key: 'v'`, `'key': 'v'`), query strings (`key=v`), Ruby (`:key => "v"`) and PHP
 * var_dump (`["key"]=> string(12) "v"`).
 */
const field = (name: string, value: string) =>
  `(?:^|[^a-z_])['"]?${name}['"]?\\]?\\s*(?:=>|[:=])\\s*(?:string\\(\\d+\\)\\s*)?['"]?${value}`;
const fieldValue = (text: string, name: string) => {
  if (name === "reason" && !text.includes("outcome")) return undefined;
  return new RegExp(field(name, "([a-z_]+)")).exec(text)?.[1];
};

/**
 * Extract a decline code from pasted text: a code, a label, Stripe's customer-facing
 * message, an error object, a Charge or a webhook payload in any common dump format.
 * Returns null when the text names a known non-decline value (see `findNote`) and the
 * only code in it is the generic `card_declined`: a Radar-blocked charge carries
 * `failure_code: card_declined`, and "retry likely" would be the wrong advice.
 */
export function findCode(input: string): DeclineCode | null {
  const hit = findCodeIn(input);
  return hit?.code === "card_declined" && findNote(input) ? null : hit;
}

function findCodeIn(input: string): DeclineCode | null {
  let text = input.trim().toLowerCase();
  if (!text) return null;
  const direct = DECLINE_BY_CODE.get(text) ?? DECLINE_BY_CODE.get(normalise(text)) ?? BY_LABEL.get(fold(text));
  if (direct) return direct;
  // A structured payload: trust its fields over any code-looking word elsewhere in it.
  for (const name of REASON_FIELDS) {
    const value = fieldValue(text, name);
    const found = value ? DECLINE_BY_CODE.get(value) : undefined;
    if (found && found.code !== "card_declined") return found;
  }
  // `advice_code` holds Stripe's retry advice (try_again_later, do_not_try_again…), not the
  // decline reason; two of its values are also decline codes, so drop it before scanning.
  text = text.replace(new RegExp(field("advice_code", "[a-z_]+['\"]?"), "g"), " ");
  // A dispute's or refund's reason is not a decline either.
  if (!text.includes("outcome")) text = text.replace(new RegExp(field("reason", "[a-z_]+['\"]?"), "g"), " ");
  // Longest match first so "card_declined" does not shadow "decline_code: do_not_honor".
  const codes = [...DECLINE_BY_CODE.keys()].sort((a, b) => b.length - a.length);
  const hit = codes.filter((c) => c !== "card_declined").find((c) => text.includes(c)) ?? (text.includes("card_declined") ? "card_declined" : null);
  if (hit) return DECLINE_BY_CODE.get(hit) ?? null;
  const message = text.replace(/[‘’]/g, "'");
  const byMessage = MESSAGE_PATTERNS.find(([pattern]) => pattern.test(message));
  return byMessage ? DECLINE_BY_CODE.get(byMessage[1]) ?? null : null;
}

/** Codes whose identifier or label (English or French, accents ignored) contains the input. */
export function suggest(input: string, limit = 6): DeclineCode[] {
  const raw = fold(input);
  if (!raw) return [];
  const asCode = raw.replace(/[\s-]+/g, "_");
  return DECLINE_CODES.filter((entry) => entry.code.includes(asCode) || fold(entry.en.label).includes(raw) || fold(entry.fr.label).includes(raw)).slice(0, limit);
}

/**
 * A note for pasted text that names a known non-decline value (only when no decline code matched).
 * Distinctive terms (highest_risk_level) match anywhere; a note with `field` matches only as
 * that field's value (`outcome.reason: "rule"`), since a word like "rule" is everywhere.
 * A Charge Radar blocked (`outcome.type: "blocked"`) gets the rule note when nothing more
 * specific matched.
 */
export function findNote(input: string): DeclineNote | null {
  const raw = input.trim().toLowerCase();
  if (!raw) return null;
  const text = raw.replace(/[\s-]+/g, "_");
  const direct = DECLINE_NOTES.find((n) => (n.field ? fieldValue(raw, n.field) === n.term : text.includes(n.term)));
  if (direct) return direct;
  return raw.includes("outcome") && fieldValue(raw, "type") === "blocked" ? DECLINE_NOTES.find((n) => n.term === "rule") ?? null : null;
}

/** Everything about one decline, in one language, flat. */
export type Explanation = {
  code: string;
  category: DeclineCategory;
  categoryLabel: string;
  categorySummary: string;
  fixer: Fixer;
  retry: Retry;
  label: string;
  meaning: string;
  action: string;
  /** Customer email with `{name}`, `{product}`, `{link}` and `{company}` placeholders. */
  email: string;
  /** Long-form guide on flow-mrr.com, when there is one. */
  guide?: string;
};

/**
 * One call for the common case: a code, a label, a message or a pasted payload
 * in, a flat explanation out (`null` when nothing in the text is a decline).
 */
export function explain(input: string, locale: Locale = "en"): Explanation | null {
  const d = findCode(input);
  if (!d) return null;
  const cat = CATEGORIES[d.category][locale];
  return {
    code: d.code,
    category: d.category,
    categoryLabel: cat.label,
    categorySummary: cat.summary,
    fixer: d.fixer,
    retry: d.retry,
    label: d[locale].label,
    meaning: d[locale].meaning,
    action: d[locale].action,
    email: templateFor(d, locale),
    guide: guideUrl(d.code, locale),
  };
}
