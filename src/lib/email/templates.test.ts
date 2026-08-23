/**
 * The one rule that lives inside an email template rather than in a screen's own copy:
 * `planChangeEmail`'s three shapes, and what each of them must and must not say.
 *
 * The first test of a template in this repository, and it is here for the same reason
 * `subscriptionCopy.test.ts` exists beside the sentences `/billing` renders — the wording is a
 * function of a state, so getting the state wrong is a *wrong sentence sent to a customer*,
 * which is the one place in this app a mistake cannot be corrected by a reload. `/emails`
 * previews exactly one of the three shapes on purpose (see `SAMPLE_PLAN_CHANGE`), so the other
 * two have no screen anywhere that would show a regression.
 *
 * Both halves of every message are checked, `html` and `text`: a mail client that refuses HTML
 * gets only the second, and a clause that lives in one and not the other is a message that says
 * two different things to two readers.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { planChangeEmail } from './templates'

const SCHEDULED_CANCEL = { fromLabel: 'Premium', toLabel: 'Free', endsOn: '22 September 2027' }
const IMMEDIATE_CANCEL = { fromLabel: 'Premium', toLabel: 'Free', endsOn: null }
const SCHEDULED_DOWNGRADE = { fromLabel: 'Premium', toLabel: 'Standard', endsOn: '22 September 2027' }

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
    for (const input of [SCHEDULED_CANCEL, IMMEDIATE_CANCEL, SCHEDULED_DOWNGRADE]) {
      const mail = planChangeEmail(input)
      for (const body of [mail.subject, mail.html, mail.text]) {
        assert.doesNotMatch(body, /renew/i)
        assert.doesNotMatch(body, /charge/i)
      }
    }
  })

  /* The reassurance /pricing's trust note makes, in the one message that reports a plan going
     away — the moment a musician is most likely to wonder about it. */
  await t.test('every shape says nothing is deleted', () => {
    for (const input of [SCHEDULED_CANCEL, IMMEDIATE_CANCEL, SCHEDULED_DOWNGRADE]) {
      const mail = planChangeEmail(input)
      for (const body of [mail.html, mail.text]) {
        assert.match(body, /Nothing you have put in is deleted/)
      }
    }
  })
})
