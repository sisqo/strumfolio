# Customer journey — every email a reader receives

Every message Strumfolio puts in a reader's inbox, in the order a reader meets them, with the
copy as it goes out. Written against commit `d7fc86d` (2026-09-12) by reading the templates
and every call site; the copy below is quoted from `src/lib/email/templates.ts`, which is the
only place it is decided. **When this file and that file disagree, the template is right** —
the live, rendered version of each email is at `/emails` (global owners only), which can also
send a real copy, prefixed `[Preview]`, to the owner's own inbox.

Six emails reach a reader. One more travels the other way (feedback, to the support inbox), and
a newsletter is announced in the Privacy Policy but has never been sent. Nothing is sent on a
schedule: every message below is the direct consequence of something a person did a moment
earlier — the reader, or an operator on `/accounts/[email]`.

| # | Moment | Email | Template | Sent by |
|---|---|---|---|---|
| 1 | Signing up with email + password | Verify your email | `verificationEmail` | `register/actions.ts` (`register`, `resendVerification`) |
| 2 | The account exists | Welcome | `welcomeEmail` | `verify/actions.ts`, `auth.ts` (first Google sign-in), `accounts/actions.ts` (`confirmPendingRegistration`, `createAccount`) |
| 3 | Forgotten password | Reset your password | `passwordResetEmail` | `forgotPassword/actions.ts` (self-service), `auth/actions.ts` (`sendPasswordResetFor`, operator) |
| 4 | Buying or upgrading a plan | Purchase confirmation | `purchaseEmail` | `plans/checkout.ts` (`mockPurchase`, immediate branch) |
| 5 | Downgrading or cancelling | Plan change notice | `planChangeEmail` | `plans/checkout.ts` (`mockPurchase` scheduled branch, `mockCancel`) |
| 6 | Being given a plan | Gift notice | `giftEmail` | `accounts/actions.ts` (`sendGiftNotice`, operator) |

## What every email shares

- **Sender**: `RESEND_FROM`, defaulting to `Strumfolio <no-reply@strumfolio.com>`. In
  Production the variable exists with an **empty** value (checked 2026-09-12), and the two gift
  notices recorded as delivered on 2026-09-11 show the default is what actually goes out; the
  Preview and Development values still read `Songbook <no-reply@sisqo.dev>` from before the
  domain move, so a locally-sent email does not prove what the production header says. The code
  reads it with `??`, which would *not* fall back on an empty string if the platform ever
  passed one through. Delivery is Resend (`lib/email/send.ts`).
- **Reply-To**: unset on every message that carries a link and nothing else — `no-reply@` is the
  honest sender for a verification or a reset, and inviting a reply to one invites an answer
  to a robot. The gift notice is the one exception (`info@strumfolio.com`), because it is
  written to be answered. The Privacy Policy's own test: a reply-to belongs where somebody
  would read the reply.
- **Chrome**: a white card on the app's off-white wash, the Strumfolio lockup as a hosted PNG
  (`/brand/email/logo.png`, never the inline SVG — mail clients cannot be trusted with it), a
  20px heading, 14px muted paragraphs, one round accent-coloured button, and a footer line
  `Strumfolio — Your favourite songs, ready to play`. Colours are the light palette as literal
  hex; there is no dark mode in an inbox. Every message ships as HTML **and** plain text.
- **Language**: English, like every sentence in the app.
- **Links** are built from the origin of the request that triggered the send, so a preview
  deployment sends links to itself. Tokens travel as `?email=…&token=…`; the pages they open
  only *read* on GET and write on an explicit tap, because corporate scanners follow every
  link in a message before a person sees it.
- **Dates** are written out in British English — `22 September 2027` — by one function
  (`formatPlanDate`), so an email and `/billing` can never spell the same day two ways.
- **A failed send never undoes anything.** `sendEmail` swallows every error: the account, the
  token, the plan change are already written by the time the email goes, and the action that
  caused it reports success regardless. Only the gift notice asks what happened
  (`deliverEmail`), because it has a row to settle as `done` or `failed`.
- **Locally, with no `RESEND_API_KEY`, nothing is sent**: the full message, link included, is
  logged to the dev server's console instead. That is how registration and reset are tested
  end to end without a mailbox.

## 1. Signing up — «Verify your email for Strumfolio»

**When.** The reader submits `/register` with email, first and last name, password, and the
Turnstile challenge. Nothing but a *pending registration* row exists at this point — no
account, no songbook, no session. The account is born only when the link is followed and the
button on `/verify` is pressed.

**Copy (plain text; the HTML has the same words under a heading, with a `Verify email` button
and an «Or copy and paste this link into your browser» fallback):**

```
Verify your email

Click the link below to verify your email address and finish setting up your account. This link expires in 24 hours.

https://strumfolio.com/verify?email=<address>&token=<token>

Strumfolio — Your favourite songs, ready to play
```

**Landing.** `/verify` checks the token on GET and shows a `Verify my email` button; that tap
is the one write. On success the reader is signed in immediately and sent to `/`, not back to
`/login` to retype the password they just chose.

**Expiry and resend.** 24 hours. Two ways to get another one, and neither is a "resend" link in
the email itself:

- Registering again on the same still-pending address renews the token and the expiry (an
  upsert), which is the documented answer to «the email never arrived» while the form is
  still open.
- An expired or invalid link on `/verify` shows «This link is invalid or has expired» with a
  `Resend email` button (`ResendVerificationButton`), behind the same captcha; on success the
  page says «Check your inbox at <address> for a new link.» This rotates the token but keeps
  the password hash — the reader is not asked to choose one again.

**Limits.** Five attempts per ten minutes, per address *and* per IP, shared between registering
and resending. An address that already has an account is told to sign in or recover the
password rather than sent a second verification.

**Google sign-up skips this email entirely**: Google has already verified the address, so the
first sign-in creates the account directly and goes straight to the welcome below.

## 2. The account exists — «Welcome to Strumfolio»

**When.** The moment an `accounts` row is created for the first time, and never on a later
sign-in — every path gates it on `provisionAccount` answering *created*, not on the sign-in
succeeding. Four paths reach it:

- The reader taps `Verify my email` on `/verify` (the ordinary case).
- The reader signs in with Google for the first time.
- An operator confirms a pending registration by hand from `/accounts` — for an address whose
  verification never landed. Note what this costs: a usable account for an inbox that never
  proved itself, an exposure the code states and accepts.
- An operator opens an account by hand from `/accounts` (`CreateAccountForm`) — address, name,
  and a password only if one is typed. No verification email is ever sent on this path, and
  the welcome is the reader's first and only message; if no password was set, the way in is
  the reset email (§3), which the operator sends from the account's page.

**Copy:**

```
Welcome to Strumfolio

Your account is ready. Import the songs you already have, build your songbooks, and take them with you — on stage, in rehearsal, even with no signal.

Strumfolio — Your favourite songs, ready to play
```

**One conditional sentence.** While `SONGBOOK_PLANS=on` (the variable is set in Production;
its value cannot be read from this CLI, only its presence), the first paragraph ends with: «Before you get to them, we'll ask you to pick a plan — Free, with no card
and no end date, is one of the choices.» It is read per send, not at build time, because the
plan-choice gate only redirects anyone while that flag is on, and the email must not promise a
screen that never comes.

**What the reader finds.** The account comes with one songbook of nine public-domain
traditionals already in it (`insertSampleSongbook`), so «import the songs you already have» is
an invitation and not the only way to see anything. No button in this email: it announces, it
does not ask.

The same moment fires the operator's Telegram notice («New registration», carrying the
address and the name); that is not an email and the reader never sees it — but it is personal
data leaving the EEA, and the Privacy Policy says so in three places.

## 3. Forgotten password — «Reset your Strumfolio password»

**When.** Two triggers, one template:

- **Self-service**: the reader submits `/forgot-password` with an address and the Turnstile
  challenge. The form always answers «If that address has an account, you'll receive an email
  with a link to reset your password», whether or not it does — the email is sent only when
  one exists, and the screen deliberately cannot tell the two cases apart (anti-enumeration,
  the same principle the login form applies).
- **Operator**: `Send reset email` on `/accounts/[email]` (`SendResetEmailRow`), for when the
  operator would rather let the account holder pick a password than type one for them. No
  captcha, no rate limit, no masking — the page already knows the account exists.

**Copy (HTML: heading, the same paragraph, a `Reset password` button, the fallback link):**

```
Reset your password

Click the link below to choose a new password. If you didn't request this, you can safely ignore this email — your password won't change.

https://strumfolio.com/reset-password?email=<address>&token=<token>

Strumfolio — Your favourite songs, ready to play
```

**Expiry.** One hour — a quarter of the verification link's, because the person is at a
keyboard waiting for it. Asking again replaces the token rather than adding one.

**Landing.** `/reset-password` shows the new-password form; submitting it is the write, and the
token is deleted with it. **The reader is not signed in afterwards**: they are sent to
`/login` to use the new password once, the normal way. Completing a reset also counts as
proof of the inbox for an account that never verified one.

**Limits.** Five requests per ten minutes, per address and per IP, on the self-service path
only.

## 4. Buying or upgrading a plan — «Your Premium plan is active — thanks»

**When.** The reader completes `/checkout/[plan]` and the change takes effect *now*: a first
purchase, or an upgrade. A **scheduled** change (a downgrade that waits for the paid period to
end) is not a purchase and gets the plan-change notice in §5 instead. The screen moves to
`/thanks`; this email is the written copy of what that page says.

**Who receives it.** The account's owner address, not the signed-in one — the two differ when a
global owner has switched into a customer's account to test a purchase, and in that case the
*customer* gets this email.

**Subject**: `Your <Plan> plan is active — thanks` (plan labels: Standard, Plus, Premium,
Lifetime; Free is never bought).

**Copy, assembled from three clauses.** With the sample values `/emails` shows (Premium, €99 a
year, ending 22 September 2027):

```
Thanks — you're on Premium

We've received your payment of €99 for the first year. Premium is active on your account right now. It runs until 22 September 2027, and you can change or cancel it any time from Billing.

Next: make a songbook, put your first songs in it, and take it with you — on stage, in rehearsal, even with no signal.

https://strumfolio.com/

Your payment history and this plan's settings are in Billing: https://strumfolio.com/billing

Strumfolio — Your favourite songs, ready to play
```

The HTML has a `Start your songbook` button on `/` and links «Billing» to `/billing`.

- **Payment clause**: «We've received your payment of €9.49 for the first month.» /
  «…for the first year.» / for Lifetime, which has no cycle: «We've received your payment of
  €139.99.» / with no figure to name at all: «Your payment went through.» The amount is the
  ledger row's own string, never recomputed here, so receipt and history cannot disagree.
- **Coupon clause**, present only when a code was redeemed: « You used FOUNDER30, off the full
  price of €34.99.» followed by the exact sentence the checkout screen showed under the price
  — «€2.44 for the first 3 months, then €3.49.» or «€X a year, for as long as you stay
  subscribed.» This is the disclosure that lets a discount revert without a dispute: the
  customer was told in writing, at the moment they paid. Lifetime names the code and the full
  price but no duration, since there is no cycle to revert on.
- **End clause**: «It runs until <day>, and you can change or cancel it any time from Billing.»
  / for Lifetime: «There is nothing to renew — it stays yours, for good.» The word is *runs
  until*, never *renews*: nothing in this repository renews anything, and when the day comes
  the entitlement simply stops.

**Two facts to hold onto.** The copy is worded as a real payment confirmation while the
processor behind it is still the mock (`SONGBOOK_MOCK_CHECKOUT`) — a decision, so that the day
a real processor lands nothing in this template needs rewriting. And the operator's Telegram
line for the same event («💰 Acquisto: premium/year · €99») carries no address, on purpose.

## 5. Downgrading or cancelling — «Your Premium plan ends on 22 September 2027»

**When.** Three actions, one template, no separate «kind» parameter — «Free» as the destination
is what makes it read as a cancellation:

- **Scheduled downgrade**: the reader picks a lower paid plan on `/checkout/[plan]`. Nothing is
  charged and the screen stays put with an inline sentence; this email is the only copy that
  outlives the tab.
- **Cancellation, scheduled**: `Cancel my plan` on `/billing` for a plan with a paid-until day.
  The plan stays in force until then.
- **Cancellation, immediate**: the same button for a live plan carrying no end date — it has no
  period to wait out, so the account is back on Free at once.

**Subject and first paragraph take one of five shapes.** `<From>` is the plan in force, `<To>`
the destination, `<day>` the paid-until day when it can be named:

| Shape | Subject | First paragraph |
|---|---|---|
| Immediate cancellation | `Your <From> plan has been cancelled` | `<From> has been cancelled, and this account is back on Free from now.` |
| Cancellation on a day | `Your <From> plan ends on <day>` | `<From> stays in force until <day>. On that day this account goes back to Free.` |
| Downgrade on a day | `Your plan moves to <To> on <day>` | `<From> stays in force until <day>. On that day this account moves to <To>.` |
| Cancellation, no day nameable | `Your <From> plan is set to end` | `<From> stays in force until the period it has already been billed for ends. This account goes back to Free then.` |
| Downgrade, no day nameable | `Your plan is set to move to <To>` | `<From> stays in force until the period it has already been billed for ends. This account moves to <To> then.` |

The dateless shapes exist for a subscription in `grace` — a card that is retrying — whose
stored end date is almost always already in the past; naming it would tell a paying customer
their plan ended last week. The rule that decides whether a day is nameable is
`scheduledChangeDay`, shared with `/billing`.

**The rest of the message is the same in every shape.** For the sample `/emails` shows (Premium
cancelled for 22 September 2027):

```
Your Premium plan ends on 22 September 2027

Premium stays in force until 22 September 2027. On that day this account goes back to Free.

Nothing you have put in is deleted: your songs stay readable and exportable.

Changed your mind? «Keep Premium» in Billing calls this off, any time before then.

https://strumfolio.com/billing

Strumfolio — Your favourite songs, ready to play
```

The immediate shape swaps the last sentence for «You can start a plan again whenever you
want.» The HTML has an `Open Billing` button.

**Two words deliberately absent.** «Printable» is not in the reassurance line, here or on
`/pricing`: going back to Free closes the booklet PDF, which is the only way to print in this
app, and this message arrives on the very day that stops being true. And nothing promises a
charge — see §4 on *renews*.

**Not sent** when the reader presses `Keep <Plan>` and calls a scheduled change off
(`clearPendingChange`): that press takes nothing away, and an inbox does not need a message
per press. Not sent by the operator's test-only `forceExpireNow` either.

## 6. Being given a plan — «Your Premium plan is on us»

**When.** An operator has put a plan on the account by hand (`setGrant`, the *Plan & gift* tab
of `/accounts/[email]`) and, in the confirmation dialog that follows (`GiftNoticeModal`),
chose to tell the reader. The gift is already written by then; closing the dialog, a refusal
or a Resend outage all leave the account exactly as the operator meant it.

**The dialog is offered only when there is news** (`worthAnnouncing`): a gift where there was
none, a higher plan than the one already given, an end date moved further out or removed. A
removal, a shortened date, a lower plan, or a change to the internal note alone offer nothing
— there is no good version of «your gift is now smaller», and an operator who has to explain
one has a phone. Nor is it offered for a gift that is *inert*, outranked by a live subscription.

**The only email whose subject an operator writes.** It opens as `Your <Plan> plan is on us`
(`defaultGiftSubject`) and may be rewritten, up to 120 characters; an emptied field falls back
to the default rather than sending with no subject. One optional personal line, up to 300
characters, is the only person-typed sentence in the body — escaped into the HTML, raw in the
plain text. Nothing else arrives from the browser: which plan and until when are read from the
row at send time, so no call can announce a plan the account does not hold.

**Copy**, for the sample `/emails` shows (Premium until 22 September 2027, with a line):

```
A gift for you

We've put Premium on your account — free, and yours until 22 September 2027.

Thanks for the detailed bug report last month — this one is on us.

There is nothing to set up and nothing to pay: everything Premium opens up is on right now.

https://strumfolio.com/

Strumfolio — Your favourite songs, ready to play
```

A gift with no end date says «— free, and it doesn't run out.» instead. **No figure is ever
named**: a gift that says what it is worth reads as an invoice. And no sentence says what
happens after the end date — nothing runs on a schedule to say it later, so the message is kept
about the gift.

**Button and reply.** `Open your songbooks` goes to `/`, never to `/billing`: a hand-given plan
lives in the `granted_*` columns, which Billing ignores, so Billing would tell somebody holding
a gifted Premium that they have no subscription at all. **Reply-To is `info@strumfolio.com`**,
the one customer email that invites an answer; ImprovMX forwards that inbox and it is replied
to from Gmail.

**Once, and recorded.** Before sending, the action claims a row in `outreach_actions` keyed on
the gift itself (`<plan>:<until>`), so the same gift is never announced twice — a corrected
note cannot resend it, an *improved* gift is a new occurrence and can. The subject as it
actually went out is stored in that row's `detail`, the only record anywhere of what this
reader was told; the tab draws it as history. Not a marketing message: the newsletter
preference does not govern it, the same footing as §4 and §5.

## Moments with no email

Listed because a reviewer of the journey will look for them. The first group is decided and
the reasoning lives in the code; the second is simply not built, and each would be a decision,
not a follow-up.

**By decision**

- Calling off a scheduled downgrade or cancellation («Keep <Plan>») — §5.
- A gift removed, shortened, or lowered; a gift's note corrected — §6.
- The operator's test-only forced expiry of a plan (`forceExpireNow`).
- Registering with an address that already has an account: the form says so on screen, and no
  email goes to the inbox — the address is not confirmed to anybody but the person typing it.

**Not built**

- Signing in, on a new device or otherwise. Sessions last ninety days from sign-in and nothing
  writes to say so.
- A plan reaching its paid-until day. Nothing runs on a schedule, so the entitlement stops
  silently; the only written warning is the plan-change notice sent weeks earlier, if there
  was one.
- A reader changing their own password from the app (`setOwnPassword`), or an operator setting
  one for them (`setPasswordFor`).
- An operator changing the address on an account (`changeAccountEmail`) — neither the old nor
  the new inbox is told.
- An account suspended or unsuspended by an operator.
- An account deleted, by its owner (`deleteMyAccount`, which ends on `/`) or by an operator.
- A verification link that expired without ever being followed — the pending row simply sits.
- The newsletter. The preference exists (the Settings view in the hamburger menu,
  `NewsletterPrefs`; a checkbox at registration; off by default for Google sign-ups) and the
  Privacy Policy names it, but no issue has been sent and there is no sending mechanism. The outreach engine (`lib/outreach/`) declares two more kinds — a
  birthday greeting and an upgrade voucher — with no handler and no caller.

## Mail that is not for the reader

For completeness, since it uses the same sender and chrome:

- **Feedback** (`feedbackEmail`, from the «Share your feedback» sheet) goes **to**
  `info@strumfolio.com` with the reader's own address as Reply-To. Subject
  `[priority] <Category>: <first 60 characters>`, where the category is one of *Feature request*,
  *Bug report*, *Improvement*, *Something else*, and the `[priority]` tag appears for a feature
  request from a plan that has priority ones. Body: the category, «From <address> — <Plan>»,
  the message with its line breaks kept (up to 4,000 characters), and «Screenshot attached:
  <filename>» when one rides along. The reader is told «sent», not «delivered».
- **`[Preview]` copies** from `/emails` go to the signed-in global owner's own address only. The
  links inside carry a fake token and open the «invalid or expired» state by design.
- **Telegram notices** to the operator (registration, purchase, downgrade, cancellation,
  feedback) are not email at all, and since 2026-09-03 only the registration one carries any
  personal data.
