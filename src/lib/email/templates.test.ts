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

import { giftEmail, planChangeEmail } from './templates'

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
