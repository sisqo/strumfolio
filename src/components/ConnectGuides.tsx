'use client'

import { Fragment, useState } from 'react'

/**
 * How to connect each assistant, with the endpoint and — right after one is created — the
 * token already filled in. Drawn from `AI Access.dc.html` (2026-09-27): one grid of tiles saying
 * where each assistant runs and how it connects, and snippets whose one important part, the
 * token, is lifted out — amber while it is still the placeholder, green once it is real.
 *
 * **Every snippet was checked against that client's own documentation on 2026-09-27**, and the
 * page says what it could not confirm rather than guessing. Two facts that shape it and are easy
 * to «fix» the wrong way:
 *
 * - **ChatGPT cannot use a token.** Its developer-mode apps take OAuth or no authentication and
 *   nothing else ("cannot present custom API keys"), and a local bridge does not help a web app.
 *   So its tile says «Not yet» and its guide points at Codex, OpenAI's own client, which can.
 *   OAuth is phase two (`lib/mcp/CLAUDE.md`); do not paper over it with a token in the URL
 *   without deciding that.
 * - **Claude Desktop's config file is for local servers**, so it goes through `mcp-remote`, with
 *   the header split so no argument carries a space (its README: Windows does not escape them).
 */

type Client = 'claude-web' | 'chatgpt' | 'claude-desktop' | 'claude-code' | 'codex' | 'gemini' | 'cursor' | 'vscode' | 'windsurf'

/** In the mock's order: grouped by where the assistant runs, which decides which snippets
 *  somebody can use at all. */
const CLIENTS: { key: Client; label: string; where: string; how: string; note?: string }[] = [
  { key: 'claude-web', label: 'Claude.ai', where: 'Browser', how: 'Connector settings', note: 'Beta' },
  { key: 'chatgpt', label: 'ChatGPT', where: 'Browser', how: 'Needs a sign-in flow', note: 'Not yet' },
  { key: 'claude-desktop', label: 'Claude Desktop', where: 'Desktop', how: 'Config file, Node.js' },
  { key: 'claude-code', label: 'Claude Code', where: 'Terminal', how: 'One command' },
  { key: 'codex', label: 'Codex', where: 'Terminal', how: 'Config file' },
  { key: 'gemini', label: 'Gemini CLI', where: 'Terminal', how: 'One command' },
  { key: 'cursor', label: 'Cursor', where: 'Editor', how: 'Config file' },
  { key: 'vscode', label: 'VS Code', where: 'Editor', how: 'Config file' },
  { key: 'windsurf', label: 'Windsurf', where: 'Editor', how: 'Config file' },
]

type Part = { kind: 'step'; text: string } | { kind: 'snippet'; text: string }

const PLACEHOLDER = 'YOUR_TOKEN'
const COPY_ICON = 'M9 9h10v10H9zM5 15V5h10'
const DONE_ICON = 'm5 13 4.5 4.5L19 7'

function guides(endpoint: string, secret: string): Record<Client, Part[]> {
  const step = (text: string): Part => ({ kind: 'step', text })
  const snippet = (text: string): Part => ({ kind: 'snippet', text })
  const json = (value: unknown) => JSON.stringify(value, null, 2)

  return {
    'claude-code': [
      step('In a terminal:'),
      snippet(`claude mcp add --transport http strumfolio ${endpoint} --header "Authorization: Bearer ${secret}"`),
      step('Then start Claude Code and ask about your songbooks. Add --scope user to use it in every folder.'),
    ],
    'claude-desktop': [
      step(
        'Claude Desktop reaches a server like this one through a small bridge, mcp-remote, which needs Node.js. Open Settings → Developer → Edit Config, and add to claude_desktop_config.json:',
      ),
      snippet(
        json({
          mcpServers: {
            strumfolio: {
              command: 'npx',
              args: ['mcp-remote', endpoint, '--header', 'Authorization:${AUTH_HEADER}', '--transport', 'http-only'],
              env: { AUTH_HEADER: `Bearer ${secret}` },
            },
          },
        }),
      ),
      step('Restart Claude Desktop.'),
    ],
    'claude-web': [
      step(
        'On claude.ai, Customize → Connectors → Add custom connector (on Team and Enterprise: Organization settings → Connectors). Enter the server URL, choose No sign-in for authentication, and under Request headers add:',
      ),
      snippet(endpoint),
      snippet(`authorization: Bearer ${secret}`),
      step(
        'Request headers are a beta Anthropic is still rolling out: if the dialog has no Request headers section, your account does not have it yet — use Claude Code or Claude Desktop meanwhile.',
      ),
    ],
    chatgpt: [
      step(
        'Not yet. ChatGPT connects to a server like this one only through a sign-in flow (OAuth), and cannot send a personal token. Strumfolio does not offer that sign-in yet; it is planned.',
      ),
      step('Meanwhile, Codex — OpenAI’s own app for the terminal and code editors — works with a token: see its tile.'),
    ],
    codex: [
      step('Add to ~/.codex/config.toml (shared by the Codex CLI and its editor extension):'),
      snippet(`[mcp_servers.strumfolio]\nurl = "${endpoint}"\nhttp_headers = { "Authorization" = "Bearer ${secret}" }`),
    ],
    cursor: [
      step('Add to ~/.cursor/mcp.json (or .cursor/mcp.json in a project):'),
      snippet(json({ mcpServers: { strumfolio: { url: endpoint, headers: { Authorization: `Bearer ${secret}` } } } })),
    ],
    vscode: [
      step(
        'For GitHub Copilot in agent mode: run «MCP: Open User Configuration» and add this. VS Code asks for the token the first time and keeps it out of the file:',
      ),
      snippet(
        json({
          inputs: [{ type: 'promptString', id: 'strumfolio-token', description: 'Strumfolio token', password: true }],
          servers: { strumfolio: { type: 'http', url: endpoint, headers: { Authorization: 'Bearer ${input:strumfolio-token}' } } },
        }),
      ),
    ],
    gemini: [
      step('In a terminal:'),
      snippet(`gemini mcp add --transport http --header "Authorization: Bearer ${secret}" strumfolio ${endpoint}`),
    ],
    windsurf: [
      step(
        'Add to mcp_config.json — for Windsurf, now Devin Desktop, that is ~/.config/devin/mcp_config.json (on Windows, %APPDATA%\\devin\\mcp_config.json):',
      ),
      snippet(json({ mcpServers: { strumfolio: { serverUrl: endpoint, headers: { Authorization: `Bearer ${secret}` } } } })),
    ],
  }
}

/** What kind of text a snippet is, named the way its step names it. */
function languageOf(text: string): string {
  if (text.startsWith('{')) return 'JSON'
  if (text.startsWith('[')) return 'TOML'
  if (/^(claude|gemini) /.test(text)) return 'Terminal'
  return 'Value'
}

function Snippet({ text, secret, real }: { text: string; secret: string; real: boolean }) {
  const [copied, setCopied] = useState(false)
  const pieces = text.split(secret)

  return (
    <div className="ai-snippet">
      <div className="ai-snippet-head">
        <span className="ai-snippet-lang">{languageOf(text)}</span>
        {pieces.length > 1 && (
          <span className={real ? 'ai-snippet-secret is-real' : 'ai-snippet-secret'}>
            {real ? 'Your token is filled in' : `Replace the highlighted ${PLACEHOLDER}`}
          </span>
        )}
        <button
          type="button"
          aria-label="Copy to clipboard"
          className={copied ? 'ai-snippet-copy is-copied' : 'ai-snippet-copy'}
          onClick={() => {
            navigator.clipboard.writeText(text).then(
              () => setCopied(true),
              () => setCopied(false),
            )
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={copied ? DONE_ICON : COPY_ICON} />
          </svg>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <code className="ai-snippet-code">
        {pieces.map((piece, index) => (
          <Fragment key={index}>
            {piece}
            {index < pieces.length - 1 && <span className={real ? 'ai-token-mark is-real' : 'ai-token-mark'}>{secret}</span>}
          </Fragment>
        ))}
      </code>
    </div>
  )
}

export function ConnectGuides({ endpoint, token }: { endpoint: string; token: string | null }) {
  const [client, setClient] = useState<Client>('claude-code')
  const secret = token ?? PLACEHOLDER
  const parts = guides(endpoint, secret)[client]

  return (
    <div className="grid gap-3">
      <div className="min-w-0">
        <span className="field-label">Assistant</span>
        <div className="ai-clients" role="tablist" aria-label="Assistant">
          {CLIENTS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={client === entry.key}
              className={client === entry.key ? 'ai-client is-on' : 'ai-client'}
              onClick={() => setClient(entry.key)}
            >
              <span className="ai-client-top">
                <span className="ai-client-name">{entry.label}</span>
                {entry.note !== undefined && <span className="ai-client-note">{entry.note}</span>}
              </span>
              <span className="ai-client-meta">
                {entry.where} · {entry.how}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-w-0 gap-2" role="tabpanel">
        {parts.map((part, index) =>
          part.kind === 'step' ? (
            <p key={`${client}-${index}`} className="text-[0.8125rem] leading-[1.45] text-muted">
              {part.text}
            </p>
          ) : (
            <Snippet key={`${client}-${index}`} text={part.text} secret={secret} real={token !== null} />
          ),
        )}
      </div>

      {token === null && (
        <p className="text-[0.8125rem] leading-[1.45] text-muted">
          Replace YOUR_TOKEN with a token you created above — or create one now, and it will be filled in here.
        </p>
      )}
    </div>
  )
}
