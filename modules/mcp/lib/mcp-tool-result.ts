import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/** Successful tool result: JSON payload as text so any MCP client can read it. */
export function jsonToolResult(payload: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }]
  };
}

/** Tool-level error (the call reached the tool but failed); the model sees the message. */
export function errorToolResult(message: string, details?: Record<string, unknown>): CallToolResult {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify(details ? { error: message, ...details } : { error: message }, null, 2)
      }
    ]
  };
}
