# Changelog

## 0.2.3

- On a blocked or withdrawn card (`fraud` category: lost, stolen, picked-up or fraudulent card, stop payment, revoked authorisation, security violation) only `do_not_try_again` applies. The `advice_code` can never loosen the verdict, and it can never have the customer retry the same card: `stolen_card` with `try_again_later` or `confirm_card_data` keeps "no", the customer fixer and the code's own generic-decline message and email (`retrySource: "code"`, `advice` still reported), since card networks penalise retries on those codes and the card has to be replaced. The command line says "not applied: blocked card" in that case. A test covers every blocked-card code × every advice.
- `findAdvice()`, `adviceText()`, `explain()` and `customerMessage()` no longer treat object prototype keys (`constructor`, `__proto__`) as advice codes; `explain()` used to throw on such a payload.
- `customerMessage()` respects the `advice_code`: it accepts what `explain()` accepts (a code, a label, Stripe's message, a pasted payload) and, for a bare code, the attempt's advice as a third argument, `customerMessage(error.decline_code ?? error.code, locale, error.advice_code)`. It returns `null` when nothing matches, like `explain()`, where it returned `undefined`. A test checks every code × advice pair never promises a retry under a "no" verdict.

## 0.2.2

- When Stripe's `advice_code` decides the verdict, `explain()` now takes `action`, `fixer`, `customer` and `email` from the advice as well, not from the code: a `do_not_honor` with `do_not_try_again` used to say "retry on Stripe's schedule", name the bank as the fixer and tell the customer "please try again later" under a "do not retry" verdict, and a `confirm_card_data` used to do the same instead of asking for the card details. `codes.json` gains an `advice` block with the fixer, action, customer message and email for each of the three values (`en` and `fr`); `adviceText(advice, locale)` returns them. Tests check every code × advice pair against the verdict.

## 0.2.1

- Every entry point accepts a missing, null or non-string input and finds nothing instead of throwing, so `customerMessage(error.decline_code ?? error.code) ?? fallback` is safe when neither field is set; `templateFor(undefined)` is `undefined`. An unknown locale falls back to English, and `fr-FR` or `FR` count as French.
- Packaging: CommonJS consumers get CommonJS-typed declarations (`dist/cjs/index.d.ts` under the `require` condition); earlier versions handed them the ESM declarations, which TypeScript rejects under `moduleResolution: node16` from a CommonJS file. The CI now runs publint and a consumer check that installs the tarball and compiles against it under bundler, node16 (ESM and CommonJS), nodenext and node10 resolution.

## 0.2.0

- A short customer-facing message per code (`customer`, en and fr): one or two sentences to show at checkout, on a billing page or in a support reply, with no placeholders. It never promises a retry, never says "nothing to do" when the card has to change, and never tells a customer their card was reported lost, stolen or fraudulent (tests enforce this).
- `customerMessage(code, locale)`; `explain()` now returns `customer` as well; `--customer` on the command line.
- Stripe's `advice_code` is honoured: `findAdvice()`, and `explain()` takes its `retry` from the advice when the pasted payload carries one (`retrySource`, `advice`).
- Data aligned with Stripe's reference after an external review: codes Stripe documents as "declined for an unknown reason" (`do_not_honor`, `stop_payment_order`, `revocation_*`, `security_violation`, `call_issuer`…) say so before the usual network reading; `generic_decline` names Radar and Adaptive Acceptance blocks; `card_declined` is marked as the error code it is; `mobile_device_authentication_required` moved to `auth`; lost, stolen, picked-up, fraudulent and blacklisted cards are presented to the customer like a generic decline, as Stripe asks; the stop/revocation emails no longer assert the customer stopped the payments. New note `low_probability_of_authorization` (Adaptive Acceptance).

## 0.1.0

First release.

- 51 Stripe card decline codes with category, retry verdict, fixer, meaning, action and a customer email, in English and French (`codes.json`, reviewed 2026-11-12).
- `explain()`, `lookup()`, `findCode()`, `findNote()`, `suggest()`, `templateFor()`, `guideUrl()`.
- Parsing of pasted text: codes in any spelling, labels, Stripe's customer-facing messages, error objects, Charges and webhook payloads as JSON or as dumped by Node, Python, PHP and Ruby; `advice_code`, dispute reasons and Radar blocks are not mistaken for declines.
- `stripe-declines` command line (`--lang`, `--json`, `--email`, stdin).
- ESM and CommonJS builds, TypeScript types, no dependencies.
