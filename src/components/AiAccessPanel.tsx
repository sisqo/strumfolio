'use client'

import { useCallback, useEffect, useState } from 'react'

import {
  type AiAccessState,
  type AiTokenRow,
  type CreateTokenResult,
  createAiToken,
  loadAiAccess,
  revokeAiToken,
} from '@/lib/mcp/actions'
import { NAME_MAX } from '@/lib/names'
import { useOnline } from '@/lib/useOnline'

const CREATE_MESSAGE: Record<Exclude<CreateTokenResult, { ok: true }>['reason'], string> = {
  unavailable: 'AI access can only be set up by the account’s owner, in their own account.',
  'plan-required': 'Reaching your songbooks from an AI assistant is included from the Standard plan.',
  'invalid-name': 'Give the token a name, so you can tell it apart later.',
  'too-many': 'You already have ten tokens. Revoke one you no longer use first.',
  failed: 'The token could not be created. Please try again.',
}

function day(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * The owner's personal tokens for an AI assistant, and how to connect one (`lib/mcp/`).
 *
 * A new token's secret is shown here once, beside the command that uses it, and never again —
 * only its hash is stored. What each row says is what decides whether to keep it: when it was
 * last used, and when disuse will end it.
 */
export function AiAccessPanel() {
  const online = useOnline()
  const [access, setAccess] = useState<AiAccessState | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fresh, setFresh] = useState<{ secret: string; token: AiTokenRow } | null>(null)
  const [confirming, setConfirming] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setAccess(await loadAiAccess())
    } catch {
      setAccess({ state: 'unavailable' })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setCopied(false)
    try {
      const result = await createAiToken(name)
      if (result.ok) {
        setFresh({ secret: result.secret, token: result.token })
        setName('')
        /* Added from the answer rather than re-read: the new row is exactly what the action
           wrote, and a second round trip had the list miss it until the next load. */
        setAccess((current) =>
          current === null || current.state === 'unavailable'
            ? current
            : { ...current, tokens: [result.token, ...current.tokens] },
        )
      } else {
        setError(CREATE_MESSAGE[result.reason])
      }
    } catch {
      setError(CREATE_MESSAGE.failed)
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (id: number) => {
    setBusy(true)
    setError(null)
    try {
      const result = await revokeAiToken(id)
      if (!result.ok && result.reason !== 'not-found') setError('The token could not be revoked. Please try again.')
      if (fresh?.token.id === id) setFresh(null)
      setConfirming(null)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  if (access === null) return <p className="text-sm text-muted">One moment…</p>
  if (access.state === 'unavailable') {
    return (
      <p className="text-[0.8125rem] leading-[1.45] text-muted">
        AI access can only be set up by the account’s owner, from their own account.
      </p>
    )
  }

  const command =
    fresh === null
      ? null
      : `claude mcp add --transport http strumfolio ${access.endpoint} --header "Authorization: Bearer ${fresh.secret}"`

  const copy = async () => {
    if (command === null) return
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="grid gap-4">
      {access.state === 'plan-required' && (
        <p className="notice notice-accent">
          <span>
            Included from the Standard plan.{' '}
            {access.tokens.length > 0 ? 'Your tokens are kept, and work again as soon as the plan is back. ' : ''}
            <a href="/pricing" className="underline">
              See the plans
            </a>
          </span>
        </p>
      )}

      {error !== null && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}

      {fresh !== null && command !== null && (
        <div className="notice notice-success grid gap-2" role="status">
          <span>
            Token «{fresh.token.name}» created. Copy it now: it will not be shown again. In Claude Code, run:
          </span>
          <code className="block overflow-x-auto whitespace-pre rounded-row bg-nested p-2 font-mono text-xs">
            {command}
          </code>
          <div>
            <button type="button" className="btn btn-sm" onClick={() => void copy()}>
              {copied ? 'Copied' : 'Copy command'}
            </button>
          </div>
        </div>
      )}

      {access.tokens.length > 0 && (
        <ul className="grid gap-2">
          {access.tokens.map((token) => (
            <li key={token.id} className="flex flex-wrap items-center justify-between gap-2 rounded-row border border-line-soft p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{token.name}</p>
                <p className="text-xs text-muted">
                  <span className="font-mono">{token.prefix}…</span> · created {day(token.createdAt)} ·{' '}
                  {token.lastUsedAt === null ? 'never used' : `last used ${day(token.lastUsedAt)}`} · stops working{' '}
                  {day(token.idleUntil)} if unused
                </p>
              </div>
              {confirming === token.id ? (
                <div className="flex gap-2">
                  <button type="button" className="btn btn-sm btn-danger" disabled={busy || !online} onClick={() => void revoke(token.id)}>
                    Revoke
                  </button>
                  <button type="button" className="btn btn-sm btn-quiet" onClick={() => setConfirming(null)}>
                    Keep
                  </button>
                </div>
              ) : (
                <button type="button" className="btn btn-sm" disabled={busy || !online} onClick={() => setConfirming(token.id)}>
                  Revoke…
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {access.state === 'ready' && (
        <form className="flex max-w-md flex-wrap items-end gap-2" onSubmit={(event) => void create(event)}>
          <label className="block min-w-0 flex-1">
            <span className="field-label">Name</span>
            <input
              type="text"
              value={name}
              maxLength={NAME_MAX}
              placeholder="Claude Code on my laptop"
              onChange={(event) => setName(event.target.value)}
              className="form-field"
              required
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy || !online}>
            Create token
          </button>
        </form>
      )}
    </div>
  )
}
