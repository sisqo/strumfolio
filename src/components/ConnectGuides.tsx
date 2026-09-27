'use client'

import { useState } from 'react'

/**
 * How to connect each assistant, with the endpoint and — right after one is created — the
 * token already filled in.
 *
 * **Every snippet was checked against that client's own documentation on 2026-09-27**, and the
 * page says what it could not confirm rather than guessing. Two facts that shape it and are easy
 * to «fix» the wrong way:
 *
 * - **ChatGPT cannot use a token.** Its developer-mode apps take OAuth or no authentication and
 *   nothing else ("cannot present custom API keys"), and a local bridge does not help a web app.
 *   So its tab says so and points at Codex, OpenAI's own client, which can. OAuth is phase two
 *   (`lib/mcp/CLAUDE.md`); do not paper over it with a token in the URL without deciding that.
 * - **Claude Desktop's config file is for local servers**, so it goes through `mcp-remote`, with
 *   the header split so no argument carries a space (its README: Windows does not escape them).
 */

type Client = 'claude-code' | 'claude-desktop' | 'claude-web' | 'chatgpt' | 'codex' | 'cursor' | 'vscode' | 'gemini' | 'windsurf'

const LABELS: Record<Client, string> = {
  'claude-code': 'Claude Code',
  'claude-desktop': 'Claude Desktop',
  'claude-web': 'Claude.ai',
  chatgpt: 'ChatGPT',
  codex: 'Codex',
  cursor: 'Cursor',
  vscode: 'VS Code',
  gemini: 'Gemini CLI',
  windsurf: 'Windsurf',
}

const ORDER = Object.keys(LABELS) as Client[]

function Snippet({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="grid gap-1.5">
      <code className="block overflow-x-auto whitespace-pre rounded-row bg-nested p-2 font-mono text-xs">{text}</code>
      <div>
        <button
          type="button"
          className="btn btn-sm btn-quiet"
          onClick={() => {
            navigator.clipboard.writeText(text).then(
              () => setCopied(true),
              () => setCopied(false),
            )
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

function Step({ children }: { children: React.ReactNode }) {
  return <p className="text-[0.8125rem] leading-[1.45] text-muted">{children}</p>
}

export function ConnectGuides({ endpoint, token }: { endpoint: string; token: string | null }) {
  const [client, setClient] = useState<Client>('claude-code')
  const secret = token ?? 'YOUR_TOKEN'

  const guides: Record<Client, React.ReactNode> = {
    'claude-code': (
      <>
        <Step>In a terminal:</Step>
        <Snippet text={`claude mcp add --transport http strumfolio ${endpoint} --header "Authorization: Bearer ${secret}"`} />
        <Step>Then start Claude Code and ask about your songbooks. Add --scope user to use it in every folder.</Step>
      </>
    ),
    'claude-desktop': (
      <>
        <Step>
          Claude Desktop reaches a server like this one through a small bridge, mcp-remote, which needs Node.js. Open
          Settings → Developer → Edit Config, and add to claude_desktop_config.json:
        </Step>
        <Snippet
          text={JSON.stringify(
            {
              mcpServers: {
                strumfolio: {
                  command: 'npx',
                  args: ['mcp-remote', endpoint, '--header', 'Authorization:${AUTH_HEADER}', '--transport', 'http-only'],
                  env: { AUTH_HEADER: `Bearer ${secret}` },
                },
              },
            },
            null,
            2,
          )}
        />
        <Step>Restart Claude Desktop.</Step>
      </>
    ),
    'claude-web': (
      <>
        <Step>
          On claude.ai, Customize → Connectors → Add custom connector (on Team and Enterprise: Organization settings →
          Connectors). Enter the server URL, choose No sign-in for authentication, and under Request headers add:
        </Step>
        <Snippet text={endpoint} />
        <Snippet text={`authorization: Bearer ${secret}`} />
        <Step>
          Request headers are a beta Anthropic is still rolling out: if the dialog has no Request headers section, your
          account does not have it yet — use Claude Code or Claude Desktop meanwhile.
        </Step>
      </>
    ),
    chatgpt: (
      <>
        <Step>
          Not yet. ChatGPT connects to a server like this one only through a sign-in flow (OAuth), and cannot send a
          personal token. Strumfolio does not offer that sign-in yet; it is planned.
        </Step>
        <Step>Meanwhile, Codex — OpenAI&apos;s own app for the terminal and code editors — works with a token: see its tab.</Step>
      </>
    ),
    codex: (
      <>
        <Step>Add to ~/.codex/config.toml (shared by the Codex CLI and its editor extension):</Step>
        <Snippet text={`[mcp_servers.strumfolio]\nurl = "${endpoint}"\nhttp_headers = { "Authorization" = "Bearer ${secret}" }`} />
      </>
    ),
    cursor: (
      <>
        <Step>Add to ~/.cursor/mcp.json (or .cursor/mcp.json in a project):</Step>
        <Snippet
          text={JSON.stringify({ mcpServers: { strumfolio: { url: endpoint, headers: { Authorization: `Bearer ${secret}` } } } }, null, 2)}
        />
      </>
    ),
    vscode: (
      <>
        <Step>
          For GitHub Copilot in agent mode: run «MCP: Open User Configuration» and add this. VS Code asks for the token the
          first time and keeps it out of the file:
        </Step>
        <Snippet
          text={JSON.stringify(
            {
              inputs: [{ type: 'promptString', id: 'strumfolio-token', description: 'Strumfolio token', password: true }],
              servers: {
                strumfolio: { type: 'http', url: endpoint, headers: { Authorization: 'Bearer ${input:strumfolio-token}' } },
              },
            },
            null,
            2,
          )}
        />
      </>
    ),
    gemini: (
      <>
        <Step>In a terminal:</Step>
        <Snippet text={`gemini mcp add --transport http --header "Authorization: Bearer ${secret}" strumfolio ${endpoint}`} />
      </>
    ),
    windsurf: (
      <>
        <Step>
          Add to mcp_config.json — for Windsurf, now Devin Desktop, that is ~/.config/devin/mcp_config.json (on Windows,
          %APPDATA%\devin\mcp_config.json):
        </Step>
        <Snippet
          text={JSON.stringify({ mcpServers: { strumfolio: { serverUrl: endpoint, headers: { Authorization: `Bearer ${secret}` } } } }, null, 2)}
        />
      </>
    ),
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Assistant">
        {ORDER.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={client === key}
            className={client === key ? 'btn btn-sm btn-primary' : 'btn btn-sm'}
            onClick={() => setClient(key)}
          >
            {LABELS[key]}
          </button>
        ))}
      </div>
      <div className="grid gap-2" role="tabpanel">
        {guides[client]}
      </div>
      {token === null && (
        <Step>Replace YOUR_TOKEN with a token you created above — or create one now, and it will be filled in here.</Step>
      )}
    </div>
  )
}
