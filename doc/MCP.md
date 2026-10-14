# MCP server

Endpoint: `https://<rove-host>/api/mcp`. Transport: Streamable HTTP with JSON responses, using `@modelcontextprotocol/server` 2.3.1.

## Access

1. In Settings / People, open the person's MCP access tab and generate a token.
2. Enable MCP access for at least one app. Its ordinary App access must also be enabled.
3. Configure the MCP client with the endpoint URL and `Authorization: Bearer <token>`. Use HTTPS outside local development.

Each request checks the token hash and current app permissions in the database. Revoking the token, removing App access, or disabling the last MCP app denies subsequent requests. Customer users can only receive Work access. Browser login cookies do not authenticate MCP requests.

No OAuth login flow is provided. Clients must send the personal token explicitly.

## Project context

Project settings / agents.md contains a textarea for instructions to agents working in the project. Save persists the text exactly as entered, including Markdown and whitespace. An empty value clears the instructions. Everyone who can edit the existing project settings can edit this field.

`getProjectContext` is a read-only MCP tool available to tokens with Work MCP access. It also checks the same customer access and project membership as the website, including membership for admins. Missing, archived and inaccessible projects return the same tool error. It does not load issues.

Call it through `POST /api/mcp`, with the same headers as ping, after initialization:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "getProjectContext",
    "arguments": { "projectId": "<work-project-uuid>" }
  }
}
```

Use the Work project UUID from `/work/{customerId}/{projectId}`, not the linked Planner project ID. The result includes:

- `project`: `id`, `title`, `prefix`, `customerId` and `customerName`.
- `columns`: all board columns in display order, each with `id`, `name`, `sortOrder` and `isDone`. The column ID is the issue status ID.
- `agentsMd`: saved project instructions, or an empty string if none have been saved.

The result is returned as `structuredContent` and as JSON text in `content` for client compatibility. Tool failures set `isError: true`.

## Ping

The SDK provides the standard MCP `ping` method and initialization handshake. `tools/list` includes `getProjectContext` when Work MCP access is enabled, otherwise it returns an empty list. Ping is a protocol method and does not appear as an agent tool.

The client first sends `initialize` and `notifications/initialized`. It then uses the negotiated protocol version in subsequent requests. For example, after negotiating `2025-11-25`:

```http
POST /api/mcp
Authorization: Bearer <token>
Content-Type: application/json
Accept: application/json, text/event-stream
MCP-Protocol-Version: 2025-11-25

{"jsonrpc":"2.0","id":1,"method":"ping"}
```

Successful response, HTTP 200:

```json
{"jsonrpc":"2.0","id":1,"result":{}}
```

- `401`: missing, malformed, or revoked token. Includes a Bearer authentication challenge.
- `403`: no enabled MCP app, or a rejected `Origin` header.
- `503`: authentication lookup failed, for example because the database is unavailable.

The endpoint is stateless. It creates an SDK server per request, sends no session ID, and closes the transport after the JSON response. Authenticated `GET` and `DELETE` requests return `405` because persistent SSE streams and sessions are not supported.

Native clients can omit `Origin`. Requests carrying it must exactly match the origin configured in `AUTH_URL`, or `NEXTAUTH_URL` if `AUTH_URL` is unset. Without either setting, all requests carrying `Origin` are rejected. Cross-origin browser access is not enabled.

References: [MCP tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools), [MCP ping](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/ping), [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).
