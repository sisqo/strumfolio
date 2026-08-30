'use client'

import { useEffect, useState } from 'react'

import { PlanUpgradeModal, type PlanNotice } from '@/components/PlanUpgradeModal'
import { usePrefs } from '@/components/PrefsProvider'
import { IconChevronDown, IconDownload, IconInfo, IconPrint } from '@/components/icons'
import { loadBooklet } from '@/lib/booklet/actions'
import { bookletToBlob } from '@/lib/booklet/document'
import type { Songbook } from '@/lib/data/types'
import { downloadBlob } from '@/lib/download'
import { loadSongbooks } from '@/lib/songbooks/actions'

/**
 * One songbook as a typeset PDF, ready to print — the whole of `/booklet`.
 *
 * Lifted out of `ExportPanel`, where it was the third of three cards, and moved without being
 * redesigned: same `info-card`, same picker, same button, same two refusals. What changed is
 * only which page it is on, and therefore what it shares — it used to sit under a `notice`, a
 * `busy` flag and a `PlanUpgradeModal` that the two zip exports beside it also used, and each
 * of those is now this panel's own. That is the point of the move rather than a cost of it: a
 * plan refusal here was opening a dialog on a screen whose heading said "Export", about a
 * feature two cards further down.
 *
 * The PDF is rendered **in the browser**, from what `loadBooklet` hands back — see
 * `booklet/document.tsx`. So the server decides what may be printed and what the document says
 * about itself (`brandLine`), and this side only draws it; a reader's own notation preference
 * (`usePrefs`) is applied here for the same reason it is applied on a song screen, being a
 * display choice rather than something stored in the songbook.
 *
 * `usePersonalSettings` is a different kind of choice from the notation above: it decides
 * whether `loadBooklet` fetches this reader's own capo/transposition per song at all, which is
 * why it travels as an argument to a server action rather than as a prop this side resolves on
 * its own. Local `useState`, never a stored preference, and reset to `false` on every mount —
 * see its own comment above for why that has to be the case.
 */
export function BookletPanel() {
  const { global } = usePrefs()
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /** A refusal by the plan gets the same dialog `HomeScreen` opens for its own — see
      `PlanUpgradeModal`'s own comment on why — instead of the inline `notice` above. */
  const [planNotice, setPlanNotice] = useState<PlanNotice | null>(null)

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
      const result = await loadBooklet(bookletSlug, usePersonalSettings)
      if (!result.ok) {
        /*
         * Two different refusals, because they have two different remedies: a plan without
         * the booklet will answer the same way however many times the button is pressed, so
         * «the server did not respond» would be an invitation to keep trying — that one gets
         * `PlanUpgradeModal` and a way to `/pricing` instead of the inline notice below.
         */
        if (result.reason === 'plan-required') {
          setPlanNotice({ reason: 'plan-required', feature: 'The printable booklet' })
        } else {
          setNotice('Could not build the booklet: the server did not respond, or your role does not allow it.')
        }
        return
      }
      const { booklet, brandLine } = result
      if (booklet.sections.every((section) => section.songs.length === 0)) {
        setNotice('Nothing to print: this songbook has no songs yet.')
        return
      }

      const blob = await bookletToBlob(booklet, global.notation, brandLine)
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
              checked={usePersonalSettings}
              onChange={(event) => setUsePersonalSettings(event.target.checked)}
            />
            <span className="text-[0.875rem] text-ink">Use my own key and capo for this printout</span>
          </label>
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy || bookletSlug === ''}
            onClick={() => void downloadBooklet()}
          >
            <IconDownload size={16} />
            Download PDF
          </button>
        </div>
      </div>

      {planNotice !== null && (
        <PlanUpgradeModal notice={planNotice} onClose={() => setPlanNotice(null)} />
      )}
    </section>
  )
}
