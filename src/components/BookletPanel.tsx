'use client'

import { useEffect, useRef, useState } from 'react'

import { FeaturePaywallModal } from '@/components/FeaturePaywallModal'
import { usePrefs } from '@/components/PrefsProvider'
import { useRole } from '@/components/RoleProvider'
import { IconChevronDown, IconDownload, IconInfo, IconLock, IconPrint } from '@/components/icons'
import { loadBooklet, loadBookletFooter, saveBookletFooter } from '@/lib/booklet/actions'
import { bookletToBlob } from '@/lib/booklet/document'
import type { Songbook } from '@/lib/data/types'
import { downloadBlob } from '@/lib/download'
import { PAYWALL_FEATURES } from '@/lib/plans/paywall'
import { PLANS } from '@/lib/plans/types'
import { loadSongbooks } from '@/lib/songbooks/actions'

/**
 * One songbook as a typeset PDF, ready to print — the whole of `/booklet`.
 *
 * Lifted out of `ExportPanel`, where it was the third of three cards, and moved without being
 * redesigned: same `info-card`, same picker, same button, same two refusals. What changed is
 * only which page it is on, and therefore what it shares — it used to sit under a `notice`, a
 * `busy` flag and a plan-upgrade dialog that the two zip exports beside it also used, and each
 * of those is now this panel's own. That is the point of the move rather than a cost of it: a
 * plan refusal here was opening a dialog on a screen whose heading said "Export", about a
 * feature two cards further down.
 *
 * The PDF is rendered **in the browser**, from what `loadBooklet` hands back — see
 * `booklet/document.tsx`. So the server decides what may be printed and what the document says
 * about itself (`footerText`), and this side only draws it; a reader's own notation preference
 * (`usePrefs`) is applied here for the same reason it is applied on a song screen, being a
 * display choice rather than something stored in the songbook.
 *
 * `usePersonalSettings` and `includeComments` are a different kind of choice from the notation
 * above: they decide whether `loadBooklet` fetches this reader's own capo/transposition and
 * anchored notes per song at all, which is why both travel as arguments to a server action
 * rather than as props this side resolves on its own. Local `useState`, never a stored
 * preference, and reset to `false` on every mount — see their own comments above for why that
 * has to be the case.
 */
export function BookletPanel() {
  const { global } = usePrefs()
  const { plan } = useRole()
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /** A refusal by the plan gets `FeaturePaywallModal` instead of the inline `notice` above —
      see that component's own comment on why. */
  const [paywallOpen, setPaywallOpen] = useState(false)

  /* The button's own preview of the same gate `loadBooklet` enforces server-side — see
     `ControlBar`'s identical `ukuleleRefused` for the reasoning this mirrors. */
  const bookletRefused = plan !== null && PLANS[plan].booklet === 'no'

  /*
   * Fetched once, on mount, rather than threaded in as a prop: this screen needs a plain list
   * of songbook names and nothing else about them, and the page around it has no reason to
   * carry a songbook provider for one picker.
   */
  const [songbooks, setSongbooks] = useState<Songbook[] | null>(null)
  const [bookletSlug, setBookletSlug] = useState('')
  /**
   * Never persisted — not to the account, not to `localStorage` — and reset to off on
   * every mount, on purpose: a booklet defaults to the written key, for the room, and
   * this is the opt-in exception for a personal copy, asked again every time rather
   * than remembered, so a reader can never hand someone else a copy in their own key
   * or capo by forgetting a choice from a previous download.
   */
  const [usePersonalSettings, setUsePersonalSettings] = useState(false)
  /**
   * Same reasoning as `usePersonalSettings` above, and the same reset-on-mount rule:
   * a booklet is for the room by default, and printing this one reader's own private
   * notes into a copy meant to be handed out is the opt-in exception, asked again
   * every time rather than remembered.
   */
  const [includeComments, setIncludeComments] = useState(false)

  /**
   * Unlike the two toggles above, this one **is** persisted — it is the account's own
   * footer line, not a per-download choice, so it is fetched once on mount rather than
   * reset every time. `footerRefused` is this field's own preview of the gate
   * `saveBookletFooter` and `loadBooklet`'s own `resolveFooterText` both enforce
   * server-side (see `bookletRefused` above for the identical reasoning): a plan below
   * `custom` sees the field locked and answered with the same paywall, in case they try.
   */
  const [footerDraft, setFooterDraft] = useState('')
  const [footerStatus, setFooterStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [footerPaywallOpen, setFooterPaywallOpen] = useState(false)
  const footerRefused = plan !== null && PLANS[plan].booklet !== 'custom'
  const footerSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    loadBookletFooter()
      .then((saved) => {
        if (!cancelled) setFooterDraft(saved ?? '')
      })
      .catch(() => {
        // Offline, or nobody signed in: the field stays blank, same as a never-set line.
      })
    return () => {
      cancelled = true
    }
  }, [])

  /*
   * Debounced from the change handler itself, not from a `useEffect` on `footerDraft` —
   * that would also fire the moment the load above sets the initial value, saving straight
   * back what was just read for nothing. Cleared and restarted on every keystroke, so only
   * the value 600ms after the last one is ever written.
   */
  const onFooterChange = (value: string) => {
    setFooterDraft(value)
    setFooterStatus('idle')
    if (footerSaveTimer.current !== null) clearTimeout(footerSaveTimer.current)
    footerSaveTimer.current = setTimeout(() => {
      setFooterStatus('saving')
      saveBookletFooter(value)
        .then((result) => setFooterStatus(result === 'saved' ? 'saved' : 'error'))
        .catch(() => setFooterStatus('error'))
    }, 600)
  }

  useEffect(() => {
    let cancelled = false
    loadSongbooks()
      .then((state) => {
        if (cancelled || state === null) return
        setSongbooks(state.songbooks)
        setBookletSlug((current) => current || (state.songbooks[0]?.slug ?? ''))
      })
      .catch(() => {
        // Offline: the picker stays empty, and the button below refuses on its own.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const downloadBooklet = async () => {
    if (bookletSlug === '') return

    setBusy(true)
    setNotice(null)
    try {
      const result = await loadBooklet(bookletSlug, usePersonalSettings, includeComments)
      if (!result.ok) {
        /*
         * Two different refusals, because they have two different remedies: a plan without
         * the booklet will answer the same way however many times the button is pressed, so
         * «the server did not respond» would be an invitation to keep trying — that one gets
         * `FeaturePaywallModal` and a way to `/pricing` instead of the inline notice below.
         */
        if (result.reason === 'plan-required') {
          setPaywallOpen(true)
        } else {
          setNotice('Could not build the booklet: the server did not respond, or your role does not allow it.')
        }
        return
      }
      const { booklet, footerText } = result
      if (booklet.sections.every((section) => section.songs.length === 0)) {
        setNotice('Nothing to print: this songbook has no songs yet.')
        return
      }

      const blob = await bookletToBlob(booklet, global.notation, footerText)
      downloadBlob(blob, `${booklet.songbookName}.pdf`)
      setNotice(`Downloaded "${booklet.songbookName}" as a printable booklet.`)
    } catch {
      setNotice('Could not build the booklet.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-8 flex flex-col gap-3">
      {notice !== null && (
        <p className="notice" role="status">
          <IconInfo />
          {notice}
        </p>
      )}

      <div className="card info-card">
        <div className="info-card-main">
          <span className="row-icon" aria-hidden>
            <IconPrint size={19} />
          </span>
          <div className="info-card-body">
            <h2 className="section-title">Printable booklet</h2>
            <p className="mt-1.5 text-[0.90625rem] leading-[1.45] text-muted">
              One songbook as a typeset PDF — chords above the words, one song per page, in the
              key it was written in by default — meant to be printed and handed out.
            </p>
          </div>
        </div>
        <div className="flex flex-none flex-col items-start gap-2">
          <label className="picker picker-raised">
            <span className="sr-only">Songbook to print</span>
            <select
              value={bookletSlug}
              onChange={(event) => setBookletSlug(event.target.value)}
              disabled={songbooks === null || songbooks.length === 0}
              className="picker-select"
            >
              {songbooks === null || songbooks.length === 0 ? (
                <option value="">No songbook yet</option>
              ) : (
                songbooks.map((songbook) => (
                  <option key={songbook.slug} value={songbook.slug}>
                    {songbook.name}
                  </option>
                ))
              )}
            </select>
            <IconChevronDown size={14} />
          </label>
          <label className="row cursor-pointer">
            <input
              type="checkbox"
              role="switch"
              className="toggle-switch"
              checked={usePersonalSettings}
              onChange={(event) => setUsePersonalSettings(event.target.checked)}
            />
            <span className="text-[0.875rem] text-ink">Use my own key and capo for this printout</span>
          </label>
          <label className="row cursor-pointer">
            <input
              type="checkbox"
              role="switch"
              className="toggle-switch"
              checked={includeComments}
              onChange={(event) => setIncludeComments(event.target.checked)}
            />
            <span className="text-[0.875rem] text-ink">Include my notes in this printout</span>
          </label>
          <label className="flex w-64 flex-col gap-1">
            <span className="flex items-center gap-1 text-[0.8125rem] text-muted">
              Custom footer line
              {footerRefused && <IconLock size={11} />}
            </span>
            <input
              type="text"
              className="form-field text-sm"
              value={footerRefused ? '' : footerDraft}
              readOnly={footerRefused}
              // The same number `saveBookletFooter` trims to, and for the reason given
              // there: it is what the printed strip can actually show.
              maxLength={100}
              placeholder={footerRefused ? 'Upgrade to set your own line' : 'e.g. Property of The Wandering Chords'}
              onFocus={(event) => {
                if (!footerRefused) return
                // Refused, not disabled — same reasoning `ControlBar`'s `ukuleleRefused`
                // gives: a field a reader cannot tab into or hear announced would look
                // broken rather than gated.
                event.currentTarget.blur()
                setFooterPaywallOpen(true)
              }}
              onChange={(event) => onFooterChange(event.target.value)}
            />
            {footerStatus === 'saved' && <span className="text-[0.75rem] text-muted">Saved</span>}
            {footerStatus === 'error' && <span className="text-[0.75rem] text-danger">Could not save</span>}
          </label>
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy || bookletSlug === ''}
            onClick={() => void downloadBooklet()}
          >
            <IconDownload size={16} />
            Download PDF
            {bookletRefused && <IconLock size={13} />}
          </button>
        </div>
      </div>

      {paywallOpen && (
        <FeaturePaywallModal
          feature={PAYWALL_FEATURES.booklet.label}
          plan={PAYWALL_FEATURES.booklet.minPlan}
          onDismiss={() => setPaywallOpen(false)}
        />
      )}

      {footerPaywallOpen && (
        <FeaturePaywallModal
          feature={PAYWALL_FEATURES.bookletCustomFooter.label}
          plan={PAYWALL_FEATURES.bookletCustomFooter.minPlan}
          onDismiss={() => setFooterPaywallOpen(false)}
        />
      )}
    </section>
  )
}
