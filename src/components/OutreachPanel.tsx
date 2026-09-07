'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { INELIGIBLE_LABEL } from '@/lib/outreach/eligibility'
import { cadenceLabel, occurrenceLabel } from '@/lib/outreach/occurrence'
import type { OutreachLine, OutreachRow } from '@/lib/outreach/read'
import { runEverythingDue, runOutreachNow, skipOutreach } from '@/lib/outreach/actions'
import {
  AUDIENCE_LABEL,
  CHANNEL_LABEL,
  MAX_OUTREACH_REASON,
  OUTREACH,
  OUTREACH_MESSAGE,
  STATUS_LABEL,
  readOutreachKind,
} from '@/lib/outreach/types'
import type { OutreachKind, OutreachResult, OutreachStatus } from '@/lib/outreach/types'
import { useOnline } from '@/lib/useOnline'

/**
 * The Outreach tab on `/accounts/[email]`: what the platform has done to this account, what it
 * would do next, and the two controls an operator has over either.
 *
 * **The screen is per account and the engine is not.** Everything here calls
 * `lib/outreach/`'s own functions, which take an address and a `triggeredBy` and know nothing
 * about a session — so the same actions a person presses here are what a schedule would call
 * once there is one. This surface exists because there is no schedule yet, not instead of one.
 *
 * A client component for its three controls; every fact it prints was computed on the server
 * (`outreachViewFor`), including eligibility, which is a date-and-consent rule this component
 * must never re-derive.
 */

const STATUS_CLASS: Record<OutreachStatus, string> = {
  /* Plain `.badge`, which is the accent: the one outcome that is finished with. */
  done: 'badge',
  /* `--danger`, the same borrowed colour `plan-badge-unchosen` uses for the other thing on
     these screens that needs looking at. */
  failed: 'badge plan-badge-unchosen',
  suppressed: 'badge plan-badge-none',
  pending: 'badge plan-badge-free',
}

/** «by f.limberti@…», or nothing at all for a row a schedule wrote. */
function byWhom(row: OutreachRow): string {
  return row.triggeredBy === null || row.triggeredBy === 'system' ? '' : ` · by ${row.triggeredBy}`
}

/** The date a row is filed under: when it settled if it ever did, otherwise when it was claimed. */
function rowDate(row: OutreachRow): string {
  return (row.lastAttemptAt ?? row.createdAt).slice(0, 10)
}

/**
 * One line's own sentence — the thing an operator reads before deciding anything.
 *
 * Four states and none of them collapses into another: done says when, skipped says why,
 * failed says why and how many times, and a `pending` row that never settled says exactly that
 * rather than pretending to be either an outcome or a fresh start (`run.ts`' header on why that
 * state exists).
 */
function stateOf(line: OutreachLine): string {
  const row = line.current
  if (row === null) {
    return line.eligibility.eligible
      ? `Nothing claimed for ${occurrenceLabel(line.occurrenceKey)} yet.`
      : `Not eligible — ${INELIGIBLE_LABEL[line.eligibility.reason].toLowerCase()}.`
  }

  const when = rowDate(row)
  if (row.status === 'done') return `Done ${when}${byWhom(row)}${row.detail === null ? '' : ` — ${row.detail}`}`
  if (row.status === 'suppressed') {
    return `Skipped ${when}${byWhom(row)}${row.reason === null ? '' : ` — ${row.reason}`}`
  }
  if (row.status === 'failed') {
    const tries = `${row.attempts} attempt${row.attempts === 1 ? '' : 's'}`
    return `Failed ${when} after ${tries}${row.reason === null ? '' : ` — ${row.reason}`}`
  }
  return `Started ${when}${byWhom(row)} and never settled — retry only if you know it did not arrive.`
}

/** What the run button says, which depends entirely on what is already on file. */
function runLabel(line: OutreachLine): string {
  if (line.current === null) return 'Run now'
  return line.current.status === 'suppressed' ? 'Run anyway' : 'Retry'
}

interface Props {
  ownerEmail: string
  lines: OutreachLine[]
  history: OutreachRow[]
}

export function OutreachPanel({ ownerEmail, lines, history }: Props) {
  const router = useRouter()
  const online = useOnline()
  /** Which kind is mid-flight, so only its own button goes quiet rather than the whole panel. */
  const [busy, setBusy] = useState<OutreachKind | 'all' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)
  const [skipping, setSkipping] = useState<OutreachKind | null>(null)
  const [reason, setReason] = useState('')

  const due = lines.filter((line) => line.built && line.eligibility.eligible && line.current === null)

  /**
   * Every control on this panel goes through here: one busy key, one error line, one
   * confirmation line, and a `router.refresh()` on success — the page is `force-dynamic`, so
   * the refresh is what re-reads the row that was just written rather than this component
   * guessing what it now says.
   */
  const run = async (key: OutreachKind | 'all', act: () => Promise<OutreachResult>, told: string) => {
    setBusy(key)
    setError(null)
    setSaid(null)
    try {
      const result = await act()
      if (result.ok) {
        setSaid(told)
        setSkipping(null)
        setReason('')
        router.refresh()
      } else {
        setError(OUTREACH_MESSAGE[result.reason])
      }
    } catch {
      setError(OUTREACH_MESSAGE.failed)
    } finally {
      setBusy(null)
    }
  }

  /**
   * The run-everything pass, which reports counts rather than an ok: «ran two, one refused» and
   * «nothing was due» are the two answers an operator pressing this needs told apart, and today
   * — with no handler built — it is always the second.
   */
  const runAll = async () => {
    setBusy('all')
    setError(null)
    setSaid(null)
    try {
      const result = await runEverythingDue(ownerEmail)
      if (!result.ok) {
        setError(OUTREACH_MESSAGE[result.reason])
        return
      }
      const refused = result.refused.length === 0 ? '' : `, ${result.refused.length} refused`
      setSaid(result.ran.length === 0 && refused === '' ? 'Nothing was due.' : `Ran ${result.ran.length}${refused}.`)
      router.refresh()
    } catch {
      setError(OUTREACH_MESSAGE.failed)
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div className="acct-row">
        <div className="acct-row-text">
          <span className="acct-row-title">
            {due.length === 0 ? 'Nothing due for this account' : `${due.length} due for this account`}
          </span>
          {/* The one sentence that keeps this screen from being read as a scheduler. Nothing
              here runs on its own: an action happens when somebody presses one of these. */}
          <span className="acct-row-note">
            Nothing runs on a schedule. An action is claimed before it is sent, so a second run can never repeat one
            that is already done.
          </span>
          {error && (
            <p className="notice notice-error mt-2 text-sm" role="alert">
              {error}
            </p>
          )}
          {said && (
            <p className="notice notice-accent mt-2 text-sm" role="status">
              {said}
            </p>
          )}
        </div>
        <button
          type="button"
          className="acct-pill"
          disabled={!online || busy !== null || due.length === 0}
          onClick={() => void runAll()}
        >
          Run everything due
        </button>
      </div>

      {lines.map((line) => {
        const definition = OUTREACH[line.kind]
        const row = line.current
        const open = skipping === line.kind
        /* Skipping is refused for exactly one state, and it is the state the row already
           settles: an occurrence that is done has nothing left to prevent. */
        const skippable = row === null || row.status !== 'done'

        return (
          <div className="acct-row" key={line.kind}>
            <div className="acct-row-text">
              <span className="acct-row-title">
                {definition.label}
                {row !== null && <span className={`${STATUS_CLASS[row.status]} ml-2`}>{STATUS_LABEL[row.status]}</span>}
              </span>
              <span className="acct-row-note">{definition.note}</span>

              <span className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[0.8125rem] text-muted">
                <span className="meta-chip">{cadenceLabel(definition.cadence)}</span>
                <span className="meta-chip">{CHANNEL_LABEL[definition.channel]}</span>
                <span className="meta-chip">{AUDIENCE_LABEL[definition.audience]}</span>
                <span className="meta-chip">{occurrenceLabel(line.occurrenceKey)}</span>
              </span>

              <span className="acct-row-note">{stateOf(line)}</span>

              {/* Never a dead button: a kind with no handler says what is missing before it can
                  have one, because the operator reading this is who would supply it. */}
              {!line.built && (
                <span className="acct-row-note">
                  <strong>Not built yet.</strong> {definition.missing}
                </span>
              )}

              {open && (
                <div className="acct-reveal mt-2">
                  <input
                    autoFocus
                    type="text"
                    value={reason}
                    maxLength={MAX_OUTREACH_REASON}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Why this one is being skipped"
                    aria-label={`Why ${definition.label} is being skipped`}
                    className="acct-field"
                  />
                  <button
                    type="button"
                    className="acct-pill"
                    onClick={() => {
                      setSkipping(null)
                      setReason('')
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="acct-save"
                    disabled={!online || busy !== null}
                    onClick={() =>
                      void run(line.kind, () => skipOutreach(line.kind, ownerEmail, reason), 'Recorded as skipped.')
                    }
                  >
                    Record the skip
                  </button>
                </div>
              )}
            </div>

            {!open && (
              <>
                {skippable && (
                  <button
                    type="button"
                    className="acct-pill"
                    disabled={!online || busy !== null}
                    onClick={() => {
                      setSkipping(line.kind)
                      setReason('')
                      setError(null)
                      setSaid(null)
                    }}
                  >
                    Skip
                  </button>
                )}
                {line.built && (
                  <button
                    type="button"
                    className="acct-pill"
                    disabled={!online || busy !== null}
                    onClick={() => void run(line.kind, () => runOutreachNow(line.kind, ownerEmail), 'Done.')}
                  >
                    {runLabel(line)}
                  </button>
                )}
              </>
            )}
          </div>
        )
      })}

      <div className="acct-card">
        <h2 className="acct-card-title">Earlier occurrences</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing has been aimed at this account before the occurrences above.
          </p>
        ) : (
          <ul className="acct-outreach-log">
            {history.map((row) => {
              const kind = readOutreachKind(row.kind)
              return (
                <li key={row.id}>
                  <span className="acct-outreach-when">{rowDate(row)}</span>
                  <span className="acct-outreach-what">
                    {/* A row naming a kind this deploy no longer declares prints the stored
                        string: rewriting it to something recognised would invent history. */}
                    {kind === null ? row.kind : OUTREACH[kind].label} · {occurrenceLabel(row.occurrenceKey)}
                    {row.detail !== null && ` — ${row.detail}`}
                    {row.detail === null && row.reason !== null && ` — ${row.reason}`}
                  </span>
                  <span className={STATUS_CLASS[row.status]}>{STATUS_LABEL[row.status]}</span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}
