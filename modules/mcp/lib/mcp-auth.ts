import { timingSafeEqual } from "node:crypto";

/**
 * Optional bearer auth for the MCP endpoint.
 * When `PR_FLOW_MCP_TOKEN` is unset the endpoint is open (local-only use).
 */
export function getMcpToken(): string | null {
  return process.env.PR_FLOW_MCP_TOKEN?.trim() || null;
}

export function isMcpRequestAuthorized(request: Request, expectedToken = getMcpToken()): boolean {
  if (!expectedToken) {
    return true;
  }

  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) {
    return false;
  }

  const provided = Buffer.from(match[1]!.trim());
  const expected = Buffer.from(expectedToken);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
