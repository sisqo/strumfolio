# Telegram notices to the operator

Loaded when working under `src/lib/telegram/`.

`registrationNotice()` (`src/lib/telegram/registrationNotice.ts`) sends the registrant's **email
address, plus their name when one is known**, to a private Telegram chat, and carries no link.
Between 2026-09-03 and 2026-09-11 it took no parameters and named nobody, precisely so no caller
could hand it an address; that was reversed on request, because the notice is read on a phone away
from a signed-in browser and «something happened, go and look» is not worth a notification.

**The payment alerts are the second kind of message, since 2026-09-22.** `webhookApply.ts` and
`paddleApply.ts` tell the operator whenever a payment needs a person — a second subscription on
one account, a coupon used twice, a ceiling overshot, a coupon stamp with no discount applied, an
`account_id` or downgrade stamp this server never signed, an implausible stamp, a Lifetime bought
with no subscription id to cancel or one whose cancel failed, a won chargeback, a plan change
left half done — naming the account by its number and Paddle's ids: pseudonymous, and therefore
personal data, so the same places say so rather than «no personal data». And every charge gets
one «💰 Acquisto» or «Rinnovo o cambio» line carrying plan and amount only.

**It is personal data leaving the EEA, so the Privacy Policy carries it in four places and all
four move together**: §2 says what the message contains, §3's legal-basis table has a row for
these notifications (legitimate interest, with the right to object in §7), the processors list
(§4) names Telegram FZ-LLC and what it receives, and §5 states that it is established in the
UAE, covered by no adequacy decision and not certified under the Data Privacy Framework, with
deletion from the chat on request by email. Change the notice text and those four are wrong — the rule the booklet override and the install
row already live under. Telegram offers no Chapter V safeguard to sign, which is why §5 states the
position rather than claiming one; if that exposure is ever judged too high, the fix is to stop
sending the field, not to soften the sentence.

The three callers (`auth.ts`, `verify/actions.ts`, `accounts/actions.ts`) each pass the very
`{firstName, lastName} | undefined` they already build for `provisionAccount`, from the one local each
builds for it, so the notification cannot describe a different person than the row it announces.
