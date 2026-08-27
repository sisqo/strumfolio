'use client'

import { useState } from 'react'
import Link from 'next/link'

import { PlanUpgradeModal, type PlanNotice } from '@/components/PlanUpgradeModal'
import { useRole } from '@/components/RoleProvider'
import { IconComment, IconInfo } from '@/components/icons'
import { requestFeature } from '@/lib/featureRequest/actions'
import {
  DETAIL_MAX,
  FEATURE_REQUEST_MESSAGE,
  SUMMARY_MAX,
  featureRequestProblem,
} from '@/lib/featureRequest/types'
import { PLANS } from '@/lib/plans/types'

/**
 * Asking the dev team for something the app does not do yet.
 *
 * **The one screen in this app that checks the plan before showing its own controls**, and
 * the departure from `BookletScreen`'s rule is deliberate rather than an oversight. That
 * screen argues — rightly — that hiding a paid feature leaves a reader with a menu entry
 * leading nowhere and no idea the feature exists, so `loadBooklet` refuses on the button
 * press and `PlanUpgradeModal` explains. The same arrangement here would let somebody write
 * out a paragraph about what Strumfolio is missing and *then* be told it cannot be sent.
 * Pressing a button and losing nothing is not the same as typing and losing it.
 *
 * So the entry stays in the menu for every reader and this page always opens — what changes
 * is that a plan without feature requests is told so in place of the form, with the same way
 * to `/pricing` the dialog would have offered. Nobody is hidden from anything; nobody types
 * into a form that was never going to send.
 *
 * `requestFeature` is still the real gate and re-asks the server for the plan (see its own
 * comment): this reads `plan` from `RoleProvider`, which is the browser's copy and fails
 * open while it is unknown.
 */
export function FeatureRequestScreen() {
  const { known, email, plan } = useRole()

  const [summary, setSummary] = useState('')
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [planNotice, setPlanNotice] = useState<PlanNotice | null>(null)

  /* Nothing at all until we know who is asking — the same rule every `useRole` gate follows,
     for the same reason: a form that appears and then turns into a paywall a moment later
     was never a form. */
  if (!known || email === null) return null

  const refused = plan !== null && PLANS[plan].featureRequests === 'no'
  const priority = plan !== null && PLANS[plan].featureRequests === 'priority'
  const problem = featureRequestProblem(summary, detail)

  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await requestFeature(summary, detail)
      if (result.ok) {
        setSent(true)
        setSummary('')
        setDetail('')
        return
      }
      /* The one refusal with a purchase behind it goes to the dialog, exactly as
         `BookletPanel` routes its own — reachable here only if the plan changed while this
         page was open, since the form is not drawn for a plan that cannot send. */
      if (result.reason === 'plan-required') {
        setPlanNotice({ reason: 'plan-required', feature: 'Feature requests' })
        return
      }
      setError(FEATURE_REQUEST_MESSAGE[result.reason])
    } catch {
      setError(FEATURE_REQUEST_MESSAGE.failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <header className="mb-[1.125rem]">
        <h1 className="screen-title">Request a feature</h1>
        <p className="mt-2 text-sm leading-[1.45] text-muted">
          Tell us what Strumfolio should do that it does not do yet. It goes straight to the
          people who build it, and we read every one.
        </p>
      </header>

      {refused ? (
        <section className="card">
          <h2 className="section-title">Not in your plan</h2>
          <p className="mt-2 text-sm leading-[1.45] text-muted">
            Feature requests come with Plus and Premium — on Premium, yours is read first.
          </p>
          <Link href="/pricing" className="btn btn-primary btn-sm mt-4">
            See plans
          </Link>
        </section>
      ) : (
        <section className="card">
          {sent ? (
            <>
              <p className="notice notice-success" role="status">
                <IconComment />
                Sent — it is on its way to the dev team.
              </p>
              <p className="mt-3 text-sm leading-[1.45] text-muted">
                We will answer at <strong>{email}</strong>. Send another whenever something
                else comes to mind.
              </p>
              <button type="button" className="btn btn-sm mt-4" onClick={() => setSent(false)}>
                Write another
              </button>
            </>
          ) : (
            <>
              <label className="field-label" htmlFor="feature-summary">
                In one line
              </label>
              <input
                id="feature-summary"
                className="form-field"
                value={summary}
                maxLength={SUMMARY_MAX}
                placeholder="Setlists I can reorder before a gig"
                onChange={(event) => setSummary(event.target.value)}
              />

              <label className="field-label mt-4" htmlFor="feature-detail">
                Anything else (optional)
              </label>
              <textarea
                id="feature-detail"
                className="form-field"
                rows={6}
                value={detail}
                maxLength={DETAIL_MAX}
                placeholder="How you would use it, and what you do instead today."
                onChange={(event) => setDetail(event.target.value)}
              />

              {priority && (
                <p className="notice mt-3" role="note">
                  <IconInfo />
                  Your plan puts this at the front of the queue.
                </p>
              )}

              {/*
                * Why the button is not pressable yet, said only once the reader has started
                * writing: on an untouched form it would be a complaint about nothing. Without
                * it the button is simply dead and the screen knows why and will not say —
                * `FEATURE_REQUEST_MESSAGE` has had the sentence all along.
                */}
              {problem !== null && summary.trim().length > 0 && (
                <p className="mt-3 text-xs text-muted">{FEATURE_REQUEST_MESSAGE[problem]}</p>
              )}

              {error !== null && (
                <p className="notice notice-error mt-3" role="alert">
                  {error}
                </p>
              )}

              {/* Disabled on the same check the server runs, so the button is only pressable
                  when the request would actually be accepted — `featureRequestProblem` is a
                  plain module precisely so both sides can ask it. */}
              <button
                type="button"
                className="btn btn-primary btn-sm mt-4"
                disabled={busy || problem !== null}
                onClick={() => void send()}
              >
                <IconComment size={16} />
                {busy ? 'Sending…' : 'Send request'}
              </button>
            </>
          )}
        </section>
      )}

      {planNotice !== null && (
        <PlanUpgradeModal notice={planNotice} onClose={() => setPlanNotice(null)} />
      )}
    </>
  )
}
