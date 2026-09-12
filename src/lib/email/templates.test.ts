/**
 * The one rule that lives inside an email template rather than in a screen's own copy:
 * `planChangeEmail`'s four shapes, and what each of them must and must not say.
 *
 * The first test of a template in this repository, and it is here for the same reason
 * `subscriptionCopy.test.ts` exists beside the sentences `/billing` renders — the wording is a
 * function of a state, so getting the state wrong is a *wrong sentence sent to a customer*,
 * which is the one place in this app a mistake cannot be corrected by a reload. `/emails`
 * previews exactly one of the four shapes on purpose (see `SAMPLE_PLAN_CHANGE`), so the other
 * three have no screen anywhere that would show a regression.
 *
 * Both halves of every message are checked, `html` and `text`: a mail client that refuses HTML
 * gets only the second, and a clause that lives in one and not the other is a message that says
 * two different things to two readers.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { courtesyCheckinEmail, courtesyThanksEmail, giftEmail, planChangeEmail } from './templates'

const SCHEDULED_CANCEL = { fromLabel: 'Premium', toLabel: 'Free', effect: { day: '22 September 2027' } } as const
const IMMEDIATE_CANCEL = { fromLabel: 'Premium', toLabel: 'Free', effect: 'now' } as const
const SCHEDULED_DOWNGRADE = {
  fromLabel: 'Premium',
  toLabel: 'Standard',
  effect: { day: '22 September 2027' },
} as const
/* A `grace` row: scheduled, but with no day anybody may name — see `scheduledChangeDay`. */
const DATELESS_CANCEL = { fromLabel: 'Premium', toLabel: 'Free', effect: { day: null } } as const

const EVERY_SHAPE = [SCHEDULED_CANCEL, IMMEDIATE_CANCEL, SCHEDULED_DOWNGRADE, DATELESS_CANCEL]

test('planChangeEmail', async (t) => {
  await t.test('a scheduled cancellation names the day and the way to call it off', () => {
    const mail = planChangeEmail(SCHEDULED_CANCEL)

    assert.equal(mail.subject, 'Your Premium plan ends on 22 September 2027')
    for (const body of [mail.html, mail.text]) {
      assert.match(body, /Premium stays in force until 22 September 2027/)
      assert.match(body, /goes back to Free/)
      assert.match(body, /Keep Premium/)
    }
  })

  /*
   * The rule this file exists for, and the same one `cancelQuestion` is tested for on the
   * screen side: **there was no period left to wait for, so no date may be named.** A sentence
   * pointing at a day, for a plan that is already gone, is the v3.12 bug in a new place — and
   * this branch is the one `mockCancel` takes for a row with no `planExpiresAt`.
   */
  await t.test('an immediate cancellation names no date at all', () => {
    const mail = planChangeEmail(IMMEDIATE_CANCEL)

    assert.equal(mail.subject, 'Your Premium plan has been cancelled')
    for (const body of [mail.html, mail.text]) {
      assert.match(body, /back on Free from now/)
      assert.doesNotMatch(body, /2027/)
      assert.doesNotMatch(body, /until/)
      /* No undo to offer either: there is no pending change left for «Keep Premium» to clear. */
      assert.doesNotMatch(body, /Keep Premium/)
    }
  })

  /*
   * The shape this file was extended for. A `grace` account's `planExpiresAt` is virtually
   * always already in the past, so the day exists in the column and must still not be named —
   * and the sentence must not fall the other way either, into the immediate «back on Free from
   * now» for a plan that is still in force while the card retries. Both failures were live for
   * exactly one commit.
   */
  await t.test('a dateless scheduled cancellation names no day and does not say it is done', () => {
    const mail = planChangeEmail(DATELESS_CANCEL)

    assert.equal(mail.subject, 'Your Premium plan is set to end')
    for (const body of [mail.html, mail.text]) {
      assert.match(body, /stays in force until the period it has already been billed for ends/)
      assert.match(body, /goes back to Free then/)
      assert.doesNotMatch(body, /2027/)
      assert.doesNotMatch(body, /from now/)
      /* Still callable off, so the undo stays — which is the whole difference from `'now'`. */
      assert.match(body, /Keep Premium/)
    }
  })

  await t.test('a scheduled downgrade names the plan it becomes, not Free', () => {
    const mail = planChangeEmail(SCHEDULED_DOWNGRADE)

    assert.equal(mail.subject, 'Your plan moves to Standard on 22 September 2027')
    for (const body of [mail.html, mail.text]) {
      assert.match(body, /moves to Standard/)
      assert.doesNotMatch(body, /back to Free/)
    }
  })

  /*
   * Nothing in this repository renews anything (`checkout.ts`'s own header), so no shape of
   * this email may suggest a further charge — the exact claim `purchaseEmail` had to have
   * removed from it in v3.13, checked here before it can be written in the first place.
   */
  await t.test('no shape promises a renewal or a charge', () => {
    for (const input of EVERY_SHAPE) {
      const mail = planChangeEmail(input)
      for (const body of [mail.subject, mail.html, mail.text]) {
        assert.doesNotMatch(body, /renew/i)
        assert.doesNotMatch(body, /charge/i)
      }
    }
  })

  /* The reassurance /pricing's trust note makes, in the one message that reports a plan going
     away — the moment a musician is most likely to wonder about it. "Touched" and not
     "deleted": nothing here is ever deleted by a plan ending, only ever locked behind one. */
  await t.test('every shape says nothing is touched', () => {
    for (const input of EVERY_SHAPE) {
      const mail = planChangeEmail(input)
      for (const body of [mail.html, mail.text]) {
        assert.match(body, /Nothing you have put in is touched/)
      }
    }
  })
})

/**
 * The gift notice, whose three shapes `/emails` cannot show: it previews the dated one
 * carrying a personal line (`SAMPLE_GIFT`), so a gift with no end date and a gift sent
 * without a line have no screen anywhere that would reveal a regression.
 *
 * Two of the tests below are not about wording at all but about the two values that reach
 * this template from a person's keyboard — the subject, which must arrive in the header
 * exactly as typed, and the line, which must be escaped in the HTML and raw in the plain
 * text. This is the only template with both, and getting either backwards is visible only in
 * somebody else's inbox.
 */
const DATED_GIFT = {
  planLabel: 'Premium',
  endsOn: '1 March 2027',
  personalLine: 'Thanks for the bug report.',
  subject: 'Your Premium plan is on us',
} as const
const ENDLESS_GIFT = { planLabel: 'Lifetime', endsOn: null, personalLine: null, subject: 'Lifetime, on us' } as const

test('giftEmail', async (t) => {
  await t.test('a dated gift names the plan and the day', () => {
    const mail = giftEmail(DATED_GIFT)

    assert.equal(mail.subject, 'Your Premium plan is on us')
    for (const body of [mail.html, mail.text]) {
      assert.match(body, /A gift for you/)
      assert.match(body, /free, and yours until 1 March 2027/)
      assert.match(body, /nothing to set up and nothing to pay/)
    }
  })

  /* «until null» was the shape to get wrong here, the way `planChangeEmail`'s dateless
     cancellation was: a gift that never ends has no day to name and must not imply one. */
  await t.test('a gift with no end names no day', () => {
    const mail = giftEmail(ENDLESS_GIFT)

    for (const body of [mail.html, mail.text]) {
      assert.match(body, /free, and it doesn't run out/)
      assert.doesNotMatch(body, /until/)
    }
  })

  await t.test('the personal line appears when there is one, and nothing stands in for it when there is not', () => {
    for (const body of [giftEmail(DATED_GIFT).html, giftEmail(DATED_GIFT).text]) {
      assert.match(body, /Thanks for the bug report\./)
    }
    for (const body of [giftEmail(ENDLESS_GIFT).html, giftEmail(ENDLESS_GIFT).text]) {
      assert.doesNotMatch(body, /Thanks for the bug report/)
    }
  })

  /*
   * The escaping split `feedbackEmail` established, checked in both directions: an
   * unescaped `<` in the HTML is a broken document, and an escaped `&` in the plain text is
   * an `&amp;` a reader can see.
   */
  await t.test('the personal line is escaped in the HTML and raw in the plain text', () => {
    const mail = giftEmail({ ...DATED_GIFT, personalLine: 'Rock & roll <forever>' })

    assert.match(mail.html, /Rock &amp; roll &lt;forever&gt;/)
    assert.doesNotMatch(mail.html, /<forever>/)
    assert.match(mail.text, /Rock & roll <forever>/)
  })

  /*
   * A header is not a document. Escaping the subject would put a literal `&amp;` in the one
   * line of this message a reader sees before opening it — the mistake the heading being a
   * fixed string, rather than the subject, exists to make impossible.
   */
  await t.test('the subject goes out exactly as it was typed', () => {
    const typed = 'A gift from Sara & the team'
    assert.equal(giftEmail({ ...DATED_GIFT, subject: typed }).subject, typed)
    assert.doesNotMatch(giftEmail({ ...DATED_GIFT, subject: typed }).html, /Sara/)
  })

  /* No figure, ever: a gift that says what it is worth reads as an invoice, and with the mock
     checkout live nobody has paid the sum it would name. */
  await t.test('no shape names a price', () => {
    for (const input of [DATED_GIFT, ENDLESS_GIFT]) {
      const mail = giftEmail(input)
      for (const body of [mail.subject, mail.html, mail.text]) {
        assert.doesNotMatch(body, /€|\bEUR\b|\bprice\b/i)
        assert.doesNotMatch(body, /renew/i)
      }
    }
  })

  /* `/billing` reports `liveSubscription`, which ignores the `granted_*` columns entirely, so
     it would tell somebody holding a gifted Premium that they have no subscription. */
  await t.test('no shape points at Billing', () => {
    for (const input of [DATED_GIFT, ENDLESS_GIFT]) {
      const mail = giftEmail(input)
      for (const body of [mail.html, mail.text]) {
        assert.doesNotMatch(body, /billing/i)
      }
    }
  })
})
/*
 * The two courtesy notes, checked for the one thing no comment can enforce: that they still
 * carry no design. They read as a personal email rather than as the product speaking, which
 * is the whole argument for sending them — and nothing about `layout()` makes it obviously
 * wrong to wrap them in it "for consistency" with the six templates around them. This is what
 * stops that, since a message is the one thing in this app a reload cannot correct.
 */
const COURTESY_UNSUBSCRIBE_URL = 'https://strumfolio.com/courtesy-unsubscribe?email=a%40b.com&token=deadbeef'

const COURTESY = [
  { label: 'courtesyThanksEmail', build: courtesyThanksEmail },
  { label: 'courtesyCheckinEmail', build: courtesyCheckinEmail },
] as const

/** Every paragraph handed to `plainMessage`, which is what both halves are built from. */
const COURTESY_PARAGRAPHS = {
  courtesyThanksEmail: ['Hi Marco,', "I'm Francesco", 'What do you play?', 'Just reply to this email', 'Francesco'],
  courtesyCheckinEmail: ['Hi Marco,', 'Still Francesco.', "It could be a feature", 'Just reply to this email', 'Francesco'],
} as const

test('the courtesy notes carry no chrome', async (t) => {
  for (const { label, build } of COURTESY) {
    await t.test(label, () => {
      const mail = build({ firstName: 'Marco', unsubscribeUrl: COURTESY_UNSUBSCRIBE_URL })

      /* The lockup, the card, the wash, the headline: each is one `layout()` away from
         coming back, and each would make this read as a document from a company. */
      assert.doesNotMatch(mail.html, /<img/)
      assert.doesNotMatch(mail.html, /background:/)
      assert.doesNotMatch(mail.html, /border-radius/)
      assert.doesNotMatch(mail.html, /<h1/)

      /* No declared font and no declared size either — the message inherits the client's own,
         which is what a hand-typed one does. The only attribute in the whole document is the
         `href` on the opt-out link, plus the wrapper's `dir`. */
      assert.doesNotMatch(mail.html, /style=/)
      assert.match(mail.html, /^<div dir="ltr">/)
    })
  }
})

test('the courtesy notes can always be unsubscribed from', async (t) => {
  for (const { label, build } of COURTESY) {
    await t.test(label, () => {
      const mail = build({ firstName: 'Marco', unsubscribeUrl: COURTESY_UNSUBSCRIBE_URL })

      /* Both halves: a client that refuses HTML gets only the second, and these two are sent
         under legitimate interest, so the way out is not optional in either. */
      assert.match(mail.html, /<a href="https:\/\/strumfolio\.com\/courtesy-unsubscribe\?/)
      assert.ok(mail.text.includes(COURTESY_UNSUBSCRIBE_URL))

      /* In the body's own voice, not in a footer's: no size and no colour were declared for
         it, which the chrome test above already proves for the document as a whole. What this
         adds is that the sentence is the last thing in both halves. */
      assert.match(mail.html, /unsubscribe<\/a>\.<\/div>$/)
      assert.match(mail.text, /unsubscribe: \S+$/)
    })
  }
})

test('the two halves of a courtesy note say the same words', async (t) => {
  for (const { label, build } of COURTESY) {
    await t.test(label, () => {
      const mail = build({ firstName: 'Marco', unsubscribeUrl: COURTESY_UNSUBSCRIBE_URL })

      /*
       * Asserted paragraph by paragraph rather than by stripping the tags and comparing the
       * documents, because two differences are there by construction and a whole-document
       * comparison would only ever be re-deriving them: `escapeHtml` writes `&#39;` where the
       * text half has an apostrophe, and the opt-out line ends in a link on one side and a
       * spelled-out address on the other (covered by the test above).
       */
      for (const paragraph of COURTESY_PARAGRAPHS[label]) {
        assert.ok(mail.text.includes(paragraph), `${label}: text is missing «${paragraph}»`)
        const escaped = paragraph.replace(/'/g, '&#39;')
        assert.ok(mail.html.includes(escaped), `${label}: html is missing «${escaped}»`)
      }
    })
  }
})

/* The one part of these messages this file did not write. `plainMessage` escapes every
   paragraph for the HTML half, so the greeting is covered without the template remembering to
   ask — which is the reason the escape moved in there. */
test('a courtesy note escapes the name it was given', () => {
  const mail = courtesyThanksEmail({ firstName: 'Ada <script>', unsubscribeUrl: COURTESY_UNSUBSCRIBE_URL })
  assert.match(mail.html, /Hi Ada &lt;script&gt;,/)
  assert.doesNotMatch(mail.html, /<script>/)
  assert.match(mail.text, /Hi Ada <script>,/)
})

/* No name on file is the common case on `/accounts`, whose list has the address and not the
   first name (`CourtesyConfirmModal`), so this is the shape most sends actually take. */
test('a courtesy note with no name opens on a bare greeting', async (t) => {
  for (const { label, build } of COURTESY) {
    await t.test(label, () => {
      const mail = build({ firstName: null, unsubscribeUrl: COURTESY_UNSUBSCRIBE_URL })
      assert.match(mail.html, /^<div dir="ltr">Hi,<br><br>/)
      assert.match(mail.text, /^Hi,\n\n/)
    })
  }
})
