/**
 * Whether the MCP endpoint exists at all — `STRUMFOLIO_MCP=on`, and off for anything else,
 * the repo's shape for a switch (`SONGBOOK_PLANS`). Read by the route, by `/profile`'s AI
 * section and by `/pricing`'s «AI MCP integration» row, which must not sell what is switched off.
 */
export function mcpEnabled(): boolean {
  return process.env.STRUMFOLIO_MCP === 'on'
}
