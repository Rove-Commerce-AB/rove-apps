# MCP server

Endpoint: `https://<rove-host>/api/mcp`. Transport: Streamable HTTP with JSON responses, using `@modelcontextprotocol/server` 2.3.1.

## Access

1. In Settings / People, open the person's MCP access tab and generate a token.
2. Enable MCP access for at least one app. Its ordinary App access must also be enabled.
3. Configure the MCP client with the endpoint URL and `Authorization: Bearer <token>`. Use HTTPS outside local development.

Each request checks the token hash and current app permissions in the database. Revoking the token, removing App access, or disabling the last MCP app denies subsequent requests. Customer users can only receive Work access. Browser login cookies do not authenticate MCP requests.

No OAuth login flow is provided. Clients must send the personal token explicitly.

## Ping

The SDK provides the standard MCP `ping` method and initialization handshake. No business tools are registered yet, so `tools/list` returns an empty list. Ping is a protocol method and does not appear as an agent tool.

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

References: [MCP ping](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/ping), [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).
