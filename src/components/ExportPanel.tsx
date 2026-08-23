'use client'

import { zipSync, strToU8 } from 'fflate'
import { useState } from 'react'

import { IconDownload, IconInfo } from '@/components/icons'
import { downloadBlob } from '@/lib/download'
import { exportAll, exportOrganized, type ExportedFile } from '@/lib/import/actions'

/** Builds the zip in the browser and triggers its download. */
function downloadZip(files: ExportedFile[], filename: string) {
  const zipped = zipSync(Object.fromEntries(files.map((file) => [file.name, strToU8(file.content)])))
  downloadBlob(new Blob([zipped], { type: 'application/zip' }), filename)
}

/**
 * A backup of the current account's repertoire, one `.chopro` per song, plus a second,
 * separate export organized for a person to browse rather than to restore.
 *
 * **Two cards, where there were three.** The printable booklet is its own screen now
 * (`BookletPanel`, `/booklet`): it was the odd one out here in every way that mattered — a
 * PDF rather than a zip, one songbook rather than the account, a paid feature rather than a
 * plain download, and the only one of the three that could open a plan dialog. What is left
 * is what actually belongs under the word "export": zips of the words themselves.
 *
 * Everything about *publishing* that used to live alongside this (v3.0) is gone with the
 * static build it existed for: every page is dynamic now, so a save is already the live
 * page, and there is nothing left to wait for or trigger. The backup is what remains of
 * that — a plain export, useful on its own terms as the restore path `npm run seed` reads
 * back from. The organized export is not: it has folders per songbook and section, and
 * numbered names, which is exactly what the restore path cannot read back (see
 * `exportOrganized`'s own comment) — so it stays a one-way, look-don't-touch download.
 */
export function ExportPanel() {
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const download = async () => {
    setBusy(true)
    setNotice(null)
    try {
      const files = await exportAll()
      if (files === null) {
        setNotice('Export failed: the server did not respond, or your role does not allow it.')
        return
      }
      if (files.length === 0) {
        setNotice('Nothing to export.')
        return
      }

      downloadZip(files, 'songs-chopro.zip')
      setNotice(`Downloaded ${files.length} songs. To restore them: put them back in content/ and run npm run seed.`)
    } catch {
      setNotice('Export failed.')
    } finally {
      setBusy(false)
    }
  }

  const downloadOrganized = async (granularity: 'song' | 'section') => {
    setBusy(true)
    setNotice(null)
    try {
      const files = await exportOrganized(granularity)
      if (files === null) {
        setNotice('Export failed: the server did not respond, or your role does not allow it.')
        return
      }
      if (files.length === 0) {
        setNotice('Nothing to export.')
        return
      }

      downloadZip(files, granularity === 'song' ? 'songbooks-by-song.zip' : 'songbooks-by-section.zip')
      setNotice(`Downloaded ${files.length} file${files.length === 1 ? '' : 's'}, organized by songbook and section.`)
    } catch {
      setNotice('Export failed.')
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
            <IconDownload size={19} />
          </span>
          <div className="info-card-body">
            <h2 className="section-title">Backup</h2>
            <p className="mt-1.5 text-[0.90625rem] leading-[1.45] text-muted">
              Download every song in this account as a single zip — yours to keep, and ready to
              bring back in with <code>npm run seed</code> whenever you need it.
            </p>
          </div>
        </div>
        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void download()}>
          <IconDownload size={16} />
          Download all
        </button>
      </div>

      <div className="card info-card">
        <div className="info-card-main">
          <span className="row-icon" aria-hidden>
            <IconDownload size={19} />
          </span>
          <div className="info-card-body">
            <h2 className="section-title">Organized export</h2>
            <p className="mt-1.5 text-[0.90625rem] leading-[1.45] text-muted">
              The same songs, in folders — one per songbook, numbered sections inside — meant for
              reading outside the app, not for restoring. For something laid out to print, the
              printable booklet is its own screen.
            </p>
          </div>
        </div>
        <div className="flex flex-none flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy}
            onClick={() => void downloadOrganized('song')}
          >
            <IconDownload size={16} />
            By song
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy}
            onClick={() => void downloadOrganized('section')}
          >
            <IconDownload size={16} />
            By section
          </button>
        </div>
      </div>
    </section>
  )
}
