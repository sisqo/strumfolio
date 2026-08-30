'use client'

import Link from 'next/link'
import { useId, useRef, useState } from 'react'

import { PlanUpgradeModal, type PlanNotice } from '@/components/PlanUpgradeModal'
import { useRole } from '@/components/RoleProvider'
import {
  IconArrowRight,
  IconBug,
  IconCheck,
  IconClose,
  IconComment,
  IconIdea,
  IconImage,
  IconLock,
  IconSparkle,
} from '@/components/icons'
import { submitFeedback } from '@/lib/feedback/actions'
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABEL,
  FEEDBACK_MESSAGE,
  MESSAGE_MAX,
  SCREENSHOT_MAX_BYTES,
  feedbackProblem,
  screenshotTooLarge,
  type FeedbackCategory,
} from '@/lib/feedback/types'
import { PLANS } from '@/lib/plans/types'
import { useDialogA11y } from '@/lib/useDialogA11y'

const CATEGORY_ICON: Record<FeedbackCategory, typeof IconSparkle> = {
  feature: IconSparkle,
  bug: IconBug,
  improvement: IconIdea,
  // The mock draws "Something else" with the exact same bubble `IconComment` already is.
  other: IconComment,
}

interface PickedScreenshot {
  filename: string
  mimeType: string
  size: number
  base64: string
}

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Strips the `data:mime;base64,` prefix `FileReader` puts on, which Resend's own field never wants. */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/**
 * "Share your feedback" — replaces `FeatureRequestScreen`'s dedicated page with one sheet
 * covering all four categories, reachable from the floating launcher and from the hamburger
 * menu (`FeedbackProvider` owns which triggers exist where). Below 640px this renders as a
 * sheet anchored to the bottom edge (`.feedback-sheet`, `globals.css`); at or above, the same
 * markup becomes a centered dialog, reusing `PlanUpgradeModal`'s `.upgrade-overlay` shape.
 *
 * Only the Feature request card is plan-gated — Bug report, Improvement and Something else
 * are open to every plan, exactly as the mock draws them. `plan !== null &&` guards the lock
 * the same way `FeatureRequestScreen` did: with `SONGBOOK_PLANS` off, `plan` is null and the
 * card must read as unlocked, not locked — the "unenforced means nothing refuses" rule
 * `submitFeedback`'s server side already follows.
 */
export function FeedbackSheet({ onClose }: { onClose: () => void }) {
  const { email, plan } = useRole()
  const titleId = useId()
  const cardRef = useRef<HTMLDivElement>(null)
  useDialogA11y(cardRef, onClose)

  const [category, setCategory] = useState<FeedbackCategory | null>(null)
  const [message, setMessage] = useState('')
  const [screenshot, setScreenshot] = useState<PickedScreenshot | null>(null)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [planNotice, setPlanNotice] = useState<PlanNotice | null>(null)

  if (email === null) return null

  const featureLocked = plan !== null && PLANS[plan].featureRequests === 'no'
  const priority = category === 'feature' && plan !== null && PLANS[plan].featureRequests === 'priority'
  const problem = feedbackProblem(message)

  const pickFile = async (file: File) => {
    setAttachmentError(null)
    if (file.size > SCREENSHOT_MAX_BYTES) {
      setAttachmentError(`That image is larger than ${formatBytes(SCREENSHOT_MAX_BYTES)} — try a smaller screenshot.`)
      return
    }
    const base64 = await readFileAsBase64(file)
    if (screenshotTooLarge(base64)) {
      setAttachmentError(`That image is larger than ${formatBytes(SCREENSHOT_MAX_BYTES)} — try a smaller screenshot.`)
      return
    }
    setScreenshot({ filename: file.name, mimeType: file.type, size: file.size, base64 })
  }

  const send = async () => {
    if (category === null) return

    setBusy(true)
    setError(null)
    try {
      const result = await submitFeedback(
        category,
        message,
        screenshot === null ? undefined : { filename: screenshot.filename, mimeType: screenshot.mimeType, base64: screenshot.base64 },
      )
      if (result.ok) {
        setSent(true)
        setCategory(null)
        setMessage('')
        setScreenshot(null)
        return
      }
      /* Reachable only if the plan changed while the sheet was open — the locked card
         cannot be selected, so `submitFeedback` never sees this refusal in the normal path. */
      if (result.reason === 'plan-required') {
        setPlanNotice({ reason: 'plan-required', feature: 'Feature requests' })
        return
      }
      setError(FEEDBACK_MESSAGE[result.reason])
    } catch {
      setError(FEEDBACK_MESSAGE.failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="feedback-overlay">
        <div className="feedback-backdrop" onClick={onClose} aria-hidden />

        <div ref={cardRef} className="feedback-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
          <span className="feedback-sheet-handle" aria-hidden />

          <div className="feedback-sheet-header">
            <div>
              <h2 id={titleId} className="feedback-sheet-title">
                Share your feedback
              </h2>
              <p className="feedback-sheet-subtitle">Help us make Strumfolio better for everyone.</p>
            </div>
            <button type="button" className="feedback-sheet-close" onClick={onClose} aria-label="Close">
              <IconClose size={19} />
            </button>
          </div>

          {sent ? (
            <>
              <p className="notice notice-success mt-4" role="status">
                <IconCheck />
                Thank you — it&apos;s with us.
              </p>
              <p className="mt-3 text-sm leading-[1.45] text-muted">
                We read every message. If we need to ask you something, we&apos;ll write to{' '}
                <strong>{email}</strong>.
              </p>
              <div className="feedback-sheet-actions">
                <button type="button" className="btn" onClick={() => setSent(false)}>
                  Write another
                </button>
                <button type="button" className="btn btn-primary" onClick={onClose}>
                  Done
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="field-label mt-4">What is it about?</span>
              <div className="feedback-grid">
                {FEEDBACK_CATEGORIES.map((value) => {
                  const locked = value === 'feature' && featureLocked
                  const Icon = CATEGORY_ICON[value]
                  return (
                    <button
                      key={value}
                      type="button"
                      className={
                        locked
                          ? 'feedback-category is-locked'
                          : value === category
                            ? 'feedback-category is-selected'
                            : 'feedback-category'
                      }
                      title={locked ? 'Feature requests are part of Plus and Premium' : undefined}
                      onClick={() =>
                        locked ? setPlanNotice({ reason: 'plan-required', feature: 'Feature requests' }) : setCategory(value)
                      }
                    >
                      <Icon size={20} />
                      <span>{FEEDBACK_CATEGORY_LABEL[value]}</span>
                      {locked && (
                        <span className="feedback-category-lock" aria-hidden>
                          <IconLock size={13} />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              {featureLocked && (
                <p className="feedback-lock-note">
                  <IconLock size={14} />
                  <span>
                    Feature requests come with{' '}
                    <Link href="/pricing" onClick={onClose}>
                      Plus and Premium
                    </Link>{' '}
                    — on Premium, yours is read first.
                  </span>
                </p>
              )}

              {priority && (
                <p className="notice mt-3" role="note">
                  Your plan puts this at the front of the queue.
                </p>
              )}

              <span className="field-label mt-4">Your message</span>
              <textarea
                className="form-field feedback-message"
                rows={4}
                value={message}
                maxLength={MESSAGE_MAX}
                placeholder="Tell us what's on your mind…"
                onChange={(event) => setMessage(event.target.value)}
                onPaste={(event) => {
                  const item = Array.from(event.clipboardData.items).find((entry) => entry.type.startsWith('image/'))
                  const file = item?.getAsFile()
                  if (file) void pickFile(file)
                }}
              />

              {screenshot === null ? (
                <div className="feedback-attach-row">
                  <label className="feedback-attach-button">
                    <IconImage size={18} />
                    Add a screenshot
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (file) void pickFile(file)
                        event.target.value = ''
                      }}
                    />
                  </label>
                  <span className="feedback-attach-hint">or paste from the clipboard</span>
                </div>
              ) : (
                <div className="feedback-attachment">
                  <span className="feedback-attachment-icon">
                    <IconImage size={20} />
                  </span>
                  <span className="feedback-attachment-info">
                    <span className="feedback-attachment-name">{screenshot.filename}</span>
                    <span className="feedback-attachment-size">{formatBytes(screenshot.size)}</span>
                  </span>
                  <button
                    type="button"
                    className="feedback-attachment-remove"
                    onClick={() => setScreenshot(null)}
                    aria-label="Remove"
                  >
                    <IconClose size={17} />
                  </button>
                </div>
              )}

              {attachmentError !== null && (
                <p className="notice notice-error mt-3" role="alert">
                  {attachmentError}
                </p>
              )}

              {problem !== null && message.trim().length > 0 && (
                <p className="mt-3 text-xs text-muted">{FEEDBACK_MESSAGE[problem]}</p>
              )}

              {error !== null && (
                <p className="notice notice-error mt-3" role="alert">
                  {error}
                </p>
              )}

              <div className="feedback-sheet-actions">
                <button type="button" className="btn" onClick={onClose}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary feedback-send"
                  disabled={busy || category === null || problem !== null}
                  onClick={() => void send()}
                >
                  {busy ? 'Sending…' : 'Send'}
                  {!busy && <IconArrowRight size={18} />}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {planNotice !== null && <PlanUpgradeModal notice={planNotice} onClose={() => setPlanNotice(null)} />}
    </>
  )
}
