# stripe-declines

Stripe card decline codes, explained for people who recover failed subscription payments.

For each of the 51 decline codes: what it means, **whether a retry can succeed**, **who can fix it** (the bank, the customer or you), what to do next, a **message to show the customer** at checkout or on a billing page, and a **customer email** you can send as is. In English and French. The same rules power the free [Card Decline Decoder](https://flow-mrr.com/en/tools/card-decline) and the failed-payment recovery in [FlowMRR](https://flow-mrr.com).

It also **reads whatever you paste**: a code, Stripe's customer-facing message ("Your card has insufficient funds."), an error object, a Charge, a webhook payload, in JSON or as dumped by Node, Python, PHP or Ruby. It knows that `advice_code` is not the reason, that a dispute's `reason` is not a decline, and that a Radar-blocked charge is not something to retry.

```sh
npm install stripe-declines
```

Node 18+, ESM and CommonJS, TypeScript types included, no dependencies.

## Usage

```ts
import { explain } from "stripe-declines";

explain("do_not_honor");
// {
//   code: "do_not_honor",
//   category: "soft",          categoryLabel: "Temporary refusal",
//   retry: "likely",           fixer: "bank",
//   label: "Do not honor",
//   meaning: "An opaque 'no' from the bank, often a temporary lock, a spending rule or a risk score on their side. Despite the name, a later retry often succeeds.",
//   action: "Retry on Stripe's schedule. Suggest the customer calls their bank if it fails twice.",
//   customer: "Your bank declined this payment. This is often temporary: please try again later, or use another card. If it fails again, your bank can tell you why.",
//   email: "Hi {name},\n\nYour bank declined our latest payment for {product}. …",
//   guide: "https://flow-mrr.com/en/tools/card-decline/do-not-honor",
// }

explain("Votre carte a des fonds insuffisants.", "fr")?.code;   // "insufficient_funds"
explain('{"code":"card_declined","decline_code":"lost_card","advice_code":"try_again_later"}')?.code;  // "lost_card"
explain("hello");                                                // null
```

`meaning` and `action` are written for you. `customer` is written for the customer: one or two sentences with no placeholders, ready to show at checkout, on a billing page or in a support reply. `email` is a full email with `{name}`, `{product}`, `{link}` and `{company}` to fill in.

```ts
import { customerMessage } from "stripe-declines";

// On a failed payment at checkout, after Stripe's error comes back:
const message = customerMessage(error.decline_code ?? error.code, "fr") ?? genericMessage;
```

Every function accepts a missing or non-string input and finds nothing (`null`, `undefined` or `[]`) rather than throwing, so the line above is safe when the error carries neither field. The locale is `"en"` or `"fr"`; `fr-FR` counts as French and anything else as English.

The lower-level pieces:

```ts
import { findCode, findNote, lookup, suggest, templateFor, DECLINE_CODES, CATEGORIES } from "stripe-declines";

lookup("Do Not Honor");          // the entry for do_not_honor (spaces and hyphens accepted), else undefined
customerMessage("lost_card");    // "Your bank declined this card. If you have received a replacement card, please use it, …"
findCode(pastedText);            // the entry for whatever decline the text names, else null
findNote(pastedText);            // a Radar block or another known non-decline value, else null
suggest("expir");                // entries whose code or label contains the input
templateFor(entry, "fr");        // the customer email for that code
DECLINE_CODES;                   // all entries;  CATEGORIES: label, summary and email per category
```

A charge Radar or Adaptive Acceptance blocked carries `failure_code: "card_declined"`, and "retry likely" would be the wrong advice; `findCode` returns `null` for it and `findNote` explains the block:

```ts
const charge = '{"failure_code":"card_declined","outcome":{"reason":"highest_risk_level","type":"blocked"}}';
findCode(charge);        // null
findNote(charge)?.term;  // "highest_risk_level"
```

### Command line

```sh
npx stripe-declines do_not_honor
npx stripe-declines insufficient_funds --customer
npx stripe-declines "Your card has insufficient funds." --lang fr --email
npx stripe-declines '{"code":"card_declined","decline_code":"lost_card"}' --json
stripe logs tail | grep decline_code | npx stripe-declines --json
```

## How a decline is classified

Every code has a `category`, a `retry` verdict and a `fixer`. The category sets the advice and the customer email; `retry` is decided per code and wins over the category's general reading.

| category | what happened | retry the same card? | who can fix it |
|---|---|---|---|
| `soft` | the bank refused without a lasting reason | often succeeds later (Smart Retries) | bank |
| `funds` | balance or available credit did not cover the charge | often succeeds a few days later | customer |
| `card` | the card on file is dead or wrong | no | customer |
| `limit` | a card limit was hit | no, until the limit changes | customer |
| `restricted` | the card cannot be used for this kind of payment | no | customer |
| `auth` | the bank wants the cardholder to authenticate (3DS / SCA) | once the customer authenticates | customer |
| `fraud` | the issuer blocked the card | never | customer |
| `merchant` | something on your side (account, amount, currency, config) | once you fix it | you |

`retry` is `likely`, `maybe` or `no`; `fixer` is `bank`, `customer` or `you`. The verdicts follow the recovery rules FlowMRR applies to real failed invoices: a code the backend treats as hard or needing a card update is never "retry likely", and a code left to Smart Retries is never "no".

`no` covers two situations, and the `category` tells them apart: the bank will refuse the same card until the customer changes something (`card`, `limit`, `restricted`, `auth`), or the retry is not advised because Stripe or the network asked you not to (`fraud`, and `merchant` until you fix your side). Stripe does not publish a hard/soft list of codes. What it does give, per attempt, is `advice_code` (`do_not_try_again`, `try_again_later`, `confirm_card_data`): when the text you pass to `explain` carries one, `retry` follows it and `retrySource` says so.

```ts
explain('{"decline_code":"do_not_honor","advice_code":"do_not_try_again"}');
// { code: "do_not_honor", retry: "no", retrySource: "advice_code", advice: "do_not_try_again", … }
```

Where Stripe's reference says only "declined for an unknown reason" (`do_not_honor`, `stop_payment_order`, the `revocation_*` codes, `security_violation`…), `meaning` says so first and gives the usual card-network reading second, and the customer message does not assert what Stripe does not confirm.

## The data

`codes.json` is shipped in the package (`import codes from "stripe-declines/codes.json"`) so other languages can read it. It holds the eight categories (label, summary and customer email, `en` and `fr`), the 51 codes (50 decline codes plus `card_declined`, Stripe's error code for any card decline, kept because people paste it) and four "notes" for values people paste that are not decline codes (`highest_risk_level`, `elevated_risk_level`, `rule` and `low_probability_of_authorization`, the Radar and Adaptive Acceptance blocks). `reviewed` is the date it was last checked against [Stripe's decline-code reference](https://stripe.com/docs/declines/codes).

Each code has a long-form guide on FlowMRR for the 22 most common ones (`guideUrl(code)`), for example [do_not_honor](https://flow-mrr.com/en/tools/card-decline/do-not-honor), [insufficient_funds](https://flow-mrr.com/en/tools/card-decline/insufficient-funds) and [card_velocity_exceeded](https://flow-mrr.com/en/tools/card-decline/card-velocity-exceeded).

Customer emails carry `{name}`, `{product}`, `{link}` and `{company}` placeholders; customer messages carry none. Neither promises a retry outright (that depends on your retry settings), tells a customer "no action is needed" when the card has to change, or tells a customer their card was reported lost, stolen or fraudulent: Stripe asks that those be presented like a generic decline, so the customer sees "Your card was declined" and is asked for another one. The tests enforce all of this.

## Contributing

Source and issues: [github.com/flowmrr/stripe-declines](https://github.com/flowmrr/stripe-declines). Corrections welcome, with the Stripe documentation that backs them. Change `codes.json`, run `npm test`: the tests check the shape of the data, the parsing of pasted payloads, and that no email, advice or customer message contradicts the retry verdict of a code in its category. The [Card Decline Decoder](https://flow-mrr.com/en/tools/card-decline) installs this package, so a fix here reaches it with the next release.

```sh
npm install
npm test
npm run build
```

## License

MIT. Built and maintained by [FlowMRR](https://flow-mrr.com), subscription analytics and failed-payment recovery for Stripe.
