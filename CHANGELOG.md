# Changelog

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
