import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isMcpRequestAuthorized } from "@/modules/mcp/lib/mcp-auth";
import { createPrFlowMcpServer } from "@/modules/mcp/lib/mcp-server";

export const dynamic = "force-dynamic";

function unauthorized(): Response {
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null },
    { status: 401, headers: { "WWW-Authenticate": "Bearer" } }
  );
}

/** Stateless Streamable HTTP: one server + transport per request, JSON responses (no SSE). */
async function handleMcpRequest(request: Request): Promise<Response> {
  if (!isMcpRequestAuthorized(request)) {
    return unauthorized();
  }

  const server = createPrFlowMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });

  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } finally {
    void server.close();
  }
}

export const POST = handleMcpRequest;
export const GET = handleMcpRequest;
export const DELETE = handleMcpRequest;
