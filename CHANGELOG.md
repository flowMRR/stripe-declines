# Changelog

## 0.1.0

First release.

- 51 Stripe card decline codes with category, retry verdict, fixer, meaning, action and a customer email, in English and French (`codes.json`, reviewed 2026-11-12).
- `explain()`, `lookup()`, `findCode()`, `findNote()`, `suggest()`, `templateFor()`, `guideUrl()`.
- Parsing of pasted text: codes in any spelling, labels, Stripe's customer-facing messages, error objects, Charges and webhook payloads as JSON or as dumped by Node, Python, PHP and Ruby; `advice_code`, dispute reasons and Radar blocks are not mistaken for declines.
- `stripe-declines` command line (`--lang`, `--json`, `--email`, stdin).
- ESM and CommonJS builds, TypeScript types, no dependencies.
