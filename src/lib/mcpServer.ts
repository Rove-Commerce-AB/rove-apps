import "server-only";

import { McpServer, WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import { authenticateMcpRequest, type McpUser } from "@/lib/mcpAuth";

function hasAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");

  if (origin === null) {
    return true;
  }

  const appUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL;

  if (!appUrl) {
    return false;
  }

  try {
    return origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
}

function errorResponse(status: number, message: string, headers: Record<string, string> = {}): Response {
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32000, message }, id: null },
    { status, headers: { "Cache-Control": "no-store", ...headers } }
  );
}

export async function handleMcpRequest(request: Request): Promise<Response> {
  if (!hasAllowedOrigin(request)) {
    return errorResponse(403, "Origin is not allowed.");
  }

  let user: McpUser | null;

  try {
    user = await authenticateMcpRequest(request);
  } catch {
    console.error("[mcp] Failed to verify token and app permissions.");
    return errorResponse(503, "MCP authentication is temporarily unavailable.");
  }

  if (!user) {
    return errorResponse(401, "A valid MCP access token is required.", { "WWW-Authenticate": 'Bearer realm="rove-mcp"' });
  }

  if (user.appKeys.length === 0) {
    return errorResponse(403, "Enable MCP access for at least one app in Settings / People.");
  }

  if (request.method !== "POST") {
    return errorResponse(405, "Use POST for MCP requests. This endpoint does not maintain sessions or SSE streams.", { Allow: "POST" });
  }

  // The SDK handles initialize and ping. An empty tool list allows client discovery before Work tools are added.
  const server = new McpServer({ name: "rove-apps", version: "0.1.0" }, { capabilities: { tools: { listChanged: false } } });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });

  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    response.headers.set("Cache-Control", "no-store");

    return response;
  } catch {
    console.error("[mcp] Failed to handle request.");
    return errorResponse(500, "Unable to process the MCP request.");
  } finally {
    // JSON responses are complete before handleRequest resolves, so the transport can be closed here.
    await server.close();
  }
}
