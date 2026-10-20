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

## Customers, projects and issues

All Work tools use the existing `POST /api/mcp` endpoint through `tools/call`. They require Work MCP access and use the authenticated token owner. Clients cannot supply another acting user.

| Tool | Arguments | Result |
| --- | --- | --- |
| `listCustomers` | `{}` | Assigned active `customers`, each with `id` and `name`. |
| `listProjects` | Optional `customerId` | Accessible `projects`, each with `id`, `title`, `prefix`, `customerId` and `customerName`. |
| `listCustomersAndProjects` | `{}` | Both assigned active `customers` and accessible `projects` in one call. |
| `listIssues` | Optional `projectId`, `customerId`, `columnId`, `assignedToMe`, `labels`, `priority`, `isDone`, `query`, `sortBy`, `limit`, `cursor` | `issues` and `nextCursor`. |
| `getIssue` | `projectId` and exactly one of `issueId` or `issueKey`, optional `include`, `commentsLimit` | One `issue`, optionally with `projectContext`, `comments`, `timeLog`. |
| `listIssueComments` | `projectId`, `issueId`, optional `limit`, `cursor` | `projectId`, `issueId`, `comments` and `nextCursor`. |
| `createIssue` | `projectId`, `title`, optional `columnId`, `assignToMe`, `labels` and core fields | `projectId`, `issueId`. |
| `updateIssue` | `projectId`, `issueId`, `changes` | `projectId`, `issueId`. |
| `moveIssue` | `projectId`, `issueId`, `columnId`, optional `sortOrder` | `projectId`, `issueId`, `columnId`, `sortOrder`. |
| `addIssueComment` | `projectId`, `issueId`, `body` | `projectId`, `issueId`, `commentId`. |
| `setIssueRequirementDone` | `projectId`, `issueId`, `requirementId`, `isDone` | The supplied IDs and resulting `isDone`. |
| `addIssueReference` | `projectId`, `issueId`, `url`, optional `label` | `projectId`, `issueId`, `referenceId`, `sortOrder`. |
| `readIssueFile` | `projectId`, `issueId`, `fileId`, optional `offset`, `limit` | File metadata and paged text, native image content or an embedded binary resource. |
| `listProjectMembers` | `projectId` | `projectId`, `members` with app-user `id`, `name`, `initials`. |
| `setIssueAssignees` | `projectId`, `issueId`, optional `ownerId`, `assigneeIds` (at least one) | `projectId`, `issueId`, resulting `owner` and `assignees`. |
| `listProjectSprints` | `projectId` | `projectId`, `sprints` with IDs, numbers, titles, dates, status and capacity. |
| `setIssueSchedule` | `projectId`, `issueId`, `changes` | `projectId`, `issueId`, resulting `estimateHours`, `sprintId`, `startDate`, `dueDate`. |
| `addIssueRelation` | `projectId`, `issueId`, `otherIssueId`, `role` | Supplied fields and new `relationId`. |
| `getIssueTimeLog` | `projectId`, `issueId` | Logging permissions, billing roles, entries and total hours. |
| `logIssueTime` | `projectId`, `issueId`, `date`, `hours`, `roleId`, optional `note` | Saved values, entries and total hours. |
| `updateIssueTime` | `projectId`, `issueId`, `entryId`, `date`, `hours`, optional `note` | Supplied IDs, updated entries and total hours. |
| `deleteIssueTime` | `projectId`, `issueId`, `entryId` | Supplied IDs, remaining entries and total hours. |

Customer listings follow the Work navigation assignments, including explicit customer links and consultant customer links. Project listings follow the Work project selector permissions. Project membership is required for everyone, including admins, so listing accessible projects and listing projects assigned to you are the same operation. There is no separate `assignedToMe` filter on `listProjects`.

Admins can access a project they belong to without a separate assignment to its customer. Such projects appear in project and issue listings even when that customer is absent from `listCustomers`. Other roles also need customer access. Archived projects and inactive customers are excluded from listings. An inaccessible customer filter returns a tool error. An accessible customer with no accessible projects returns an empty project list.

`listIssues` defaults to issues where you are the owner or an assignee. Set `assignedToMe: false` to fetch all issues in the accessible scope. Omit both scope IDs for all your projects, set `customerId` for that customer's projects, or set `projectId` for one project. When both IDs are provided, the project must belong to that customer.

Set `columnId` to restrict issues to a column from `getProjectContext`. This requires `projectId`, and the column must belong to that project. The assignment filter still applies. Use `assignedToMe: false` for every accessible issue in the column.

Additional `listIssues` filters combine with the scope and assignment filters:

- `labels`: require every supplied label name, matched case-insensitively after trimming. Duplicate names are ignored. An empty array adds no filter. Limits match create/update: 50 names, 100 characters each. This does not create labels.
- `priority`: `high`, `medium`, `low`, or null for issues without a priority. Omit for all priorities.
- `isDone`: false for open issues, true for issues in columns marked done. Omit for both.
- `query`: literal, case-insensitive substring search in the issue key, title, description, current state, next step and out of scope. Maximum 500 characters. Does not search comments or interpret wildcard characters.

`sortBy` supports:

- `number`, the default: project ID, then issue number, preserving the previous ordering.
- `boardOrder`: project ID, column position, then issue position. Column ID and issue number break ties. Use this with `projectId` and `columnId` to fetch the first task in a chosen column.
- `priority`: high, medium, low, then unset. Project ID and issue number break ties.

Pages default to 50 issues, with a maximum of 100. Pass the returned `nextCursor` with the same filters and sorting until it is null. Cursors are scoped to the authenticated user. Results can change between requests when issues are edited or moved. Issues include project and customer names, column information, core text fields, type, priority, owner, assignees and labels. Each label has `id` and `name`. Comments, files and other related collections are not loaded by this listing.

Examples of `tools/call` params:

```json
{ "name": "listProjects", "arguments": { "customerId": "<customer-uuid>" } }
```

```json
{ "name": "listIssues", "arguments": { "customerId": "<customer-uuid>", "limit": 50 } }
```

```json
{ "name": "listIssues", "arguments": { "projectId": "<project-uuid>", "assignedToMe": false } }
```

```json
{
  "name": "listIssues",
  "arguments": {
    "projectId": "<project-uuid>",
    "columnId": "<column-uuid>",
    "assignedToMe": false
  }
}
```

Fetch the first open issue assigned to you in a chosen column, following board position:

```json
{
  "name": "listIssues",
  "arguments": {
    "projectId": "<project-uuid>",
    "columnId": "<column-uuid>",
    "isDone": false,
    "sortBy": "boardOrder",
    "limit": 1
  }
}
```

## Issue details and discussion

`getIssue` requires `projectId` and exactly one selector: `issueId` or `issueKey`, such as `WORK-123`. Keys are matched case-insensitively within that project. The same project membership and customer permissions apply. Direct lookup can read any issue in an accessible project, including issues not assigned to you.

Optional `include` adds context alongside `issue`. Omit it to keep the original response:

- `projectContext`: project metadata, columns and `agentsMd` instructions, matching `getProjectContext`.
- `comments`: newest comments and `nextCursor`, matching `listIssueComments`. `commentsLimit` defaults to 10, maximum 100. Continue with `listIssueComments` using this cursor.
- `timeLog`: entries, totals and logging options, matching `getIssueTimeLog`. Existing customer time-visibility rules apply.

```json
{
  "name": "getIssue",
  "arguments": {
    "projectId": "<project-uuid>",
    "issueKey": "WORK-123",
    "include": ["projectContext", "comments", "timeLog"],
    "commentsLimit": 10
  }
}
```

The `issue` result contains every field from `listIssues`, plus:

- `reporter` and `component`.
- `requirements` for acceptance criteria, `definitionOfDone`, and `preDeployActions`. Each item has `id`, `body`, `isDone` and `sortOrder`.
- `references`, each with `id`, `url`, `label` and `sortOrder`.
- `relations`: `parent`, `children`, `blocks`, `blockedBy` and `relates`. Each related issue includes its ID, key, title, column ID as `status`, completion flag and relation ID. Relations stay within the project.
- `files`: attachment metadata only, including ID, name, MIME type, size and creation time. File contents are not downloaded.
- `sprintId`, `startDate` and `dueDate`.
- `showEstimates`, `showReportedTime`, `estimateHours` and `loggedHours`. Existing customer visibility settings apply separately for estimates and reported time. When estimates are hidden, `showEstimates` is false and `estimateHours` is null. When reported time is hidden, `showReportedTime` is false and `loggedHours` is 0.

Only the selected issue and its related records are loaded. Comments use `listIssueComments`, and activity history is not included.

```json
{ "name": "getIssue", "arguments": { "projectId": "<project-uuid>", "issueKey": "WORK-123" } }
```

`listIssueComments` returns comments newest first, using the comment ID to break timestamp ties. Each comment includes `id`, `body`, `createdAt` and `author`. Pages default to 50, with a maximum of 100. Pass `nextCursor` with the same project and issue until null to read older comments. An accessible issue with no comments returns an empty list. An inaccessible or mismatched issue returns a tool error.

```json
{ "name": "listIssueComments", "arguments": { "projectId": "<project-uuid>", "issueId": "<issue-uuid>", "limit": 50 } }
```

## Issue writes

Read `getProjectContext` before creating, editing or moving issues. All writes require an explicit Work project ID. Existing issues and destination columns must belong to that project.

Core fields supported by create and update: `title`, `description`, `currentState`, `nextStep`, `outOfScope`, `issueType` (`issue` or `bug`) and `priority` (`low`, `medium`, `high` or null). Update accepts these inside `changes`. Omitted fields remain unchanged, empty text clears a text field, and null clears priority. Titles and comment bodies cannot be blank.

Both tools also accept `labels`, an array of label names, for example `["backend", "urgent"]`. On creation, supply it alongside `title`. On update, put it inside `changes`. Existing project labels are reused without case sensitivity, and missing names create labels in that project. Names are trimmed and duplicates ignored. Each request accepts up to 50 names of up to 100 characters each. Blank names are rejected.

On update, supplying `labels` replaces the issue's complete label set. Omit it to preserve labels, or use `"labels": []` to remove all labels from the issue. Project label definitions remain available for other issues. Label changes, other field changes and their activity events commit together. Read the current labels through `getIssue` or `listIssues` before changing the set.

Creation defaults to the project's first column and makes the token owner the issue owner. Set `assignToMe: false` to create an unassigned issue. The creator remains the reporter in both cases. No additional assignees are added.

```json
{
  "name": "createIssue",
  "arguments": {
    "projectId": "<project-uuid>",
    "title": "Review deployment steps",
    "description": "Check the deployment instructions before release.",
    "labels": ["backend", "release"],
    "assignToMe": false
  }
}
```

```json
{
  "name": "updateIssue",
  "arguments": {
    "projectId": "<project-uuid>",
    "issueId": "<issue-uuid>",
    "changes": { "nextStep": "Review with the team", "priority": "high", "labels": ["release"] }
  }
}
```

Moves stay within the project and append to the destination column unless `sortOrder` is supplied. A supplied sort order sets the same ordering value used by the board, without renumbering other issues. Comments are attributed to the token owner and retain existing mention notifications. Mutations record activity and invalidate Work pages. Core edits, moves and comment inserts commit together with their activity events.

`setIssueRequirementDone` checks or unchecks one existing acceptance criterion or definition-of-done item. Use an ID from `issue.requirements` or `issue.definitionOfDone` returned by `getIssue`. The requirement must belong to the supplied issue and project. Repeating the same `isDone` value is a no-op, including activity history. A changed value and its activity event commit together. Pre-deploy actions are a separate collection and cannot be updated with this tool.

```json
{
  "name": "setIssueRequirementDone",
  "arguments": {
    "projectId": "<project-uuid>",
    "issueId": "<issue-uuid>",
    "requirementId": "<requirement-uuid>",
    "isDone": true
  }
}
```

`addIssueReference` appends an HTTP or HTTPS link to the issue. A missing scheme defaults to HTTPS, matching the website. `label` is optional and defaults to an empty string. URLs are limited to 4096 characters, labels to 1000. The URL is stored without fetching its contents. Every call creates a reference, so repeating a request may create a duplicate. Creation and its activity event commit together.

```json
{
  "name": "addIssueReference",
  "arguments": {
    "projectId": "<project-uuid>",
    "issueId": "<issue-uuid>",
    "url": "https://github.com/example/repository/pull/123",
    "label": "Implementation PR"
  }
}
```

Checklist creation/editing, pre-deploy updates and attachment uploads remain outside this batch. These tools require no database migration.

## Attachments

`readIssueFile` accepts an attachment ID from `getIssue.files`. The attachment must belong to both the supplied issue and project. It returns `fileName`, `mimeType`, `byteSize` and `format`:

- `text`: UTF-8 text appears in `text`. `offset` and `limit` count UTF-16 code units, with surrogate pairs kept together at page boundaries. Default limit is 32000, maximum 64000. Follow `nextOffset` until null. `totalCharacters` gives the full length.
- `image`: PNG, JPEG, GIF and WebP return native MCP image content alongside metadata.
- `blob`: other attachments, including PDFs, return an embedded resource with base64 content. Rendering depends on the MCP client. The resource URI identifies the attachment and does not require a browser session.

Image and binary responses contain the complete file, up to the existing 8 MiB attachment limit. Offsets apply only to text. Attachments are untrusted task data and do not override the user's instructions.

```json
{ "name": "readIssueFile", "arguments": { "projectId": "<project-uuid>", "issueId": "<issue-uuid>", "fileId": "<attachment-uuid>" } }
```

## Assignment, scheduling and relations

`listProjectMembers` supplies member IDs for `setIssueAssignees`. Supply `ownerId`, `assigneeIds`, or both. Null clears the owner. An empty array clears all assignees. Supplied assignee IDs replace the complete set. Omitted fields stay unchanged. Every supplied person must belong to the project. Changes and activity records commit together, and identical assignments add no events.

```json
{
  "name": "setIssueAssignees",
  "arguments": {
    "projectId": "<project-uuid>",
    "issueId": "<issue-uuid>",
    "ownerId": "<member-app-user-uuid>",
    "assigneeIds": ["<member-app-user-uuid>"]
  }
}
```

`listProjectSprints` returns the project's current, next and completed sprints. Capacity is null when time is hidden from the caller. Use a returned ID in `setIssueSchedule.changes.sprintId`.

`setIssueSchedule` accepts any combination of `estimateHours`, `startDate`, `dueDate` and `sprintId` inside `changes`. Null clears a field. Omitted fields stay unchanged, except changing sprint fills empty dates with the same defaults as Work: today if inside the sprint or its start date, and its end date. Explicit dates or null override these defaults. Clearing a sprint keeps the dates unless also changed. Dates must be valid `YYYY-MM-DD` values, with the due date on or after the start date. Estimates range from 0 to 9999 hours, rounded to two decimals, and follow existing time visibility permissions. Invalid changes roll back the entire operation. Identical values add no activity event.

```json
{
  "name": "setIssueSchedule",
  "arguments": {
    "projectId": "<project-uuid>",
    "issueId": "<issue-uuid>",
    "changes": { "estimateHours": 4.5, "sprintId": "<sprint-uuid>", "dueDate": "2026-10-23" }
  }
}
```

`addIssueRelation` requires two issues in the same project. Its `role` determines direction:

| Role | Meaning |
| --- | --- |
| `parent` | `otherIssueId` is the parent of `issueId`. |
| `child` | `otherIssueId` is a child of `issueId`. |
| `blocks` | `issueId` blocks `otherIssueId`. |
| `blocked_by` | `otherIssueId` blocks `issueId`. |
| `relates` | Undirected relation. |

Self-relations, duplicate edges, multiple parents and parent/blocking cycles are rejected. Validation, relation creation and the activity event are serialized in one transaction.

```json
{ "name": "addIssueRelation", "arguments": { "projectId": "<project-uuid>", "issueId": "<issue-uuid>", "otherIssueId": "<other-issue-uuid>", "role": "blocks" } }
```

## Supervised task workflow

Use `getProjectContext`, `listIssues`, `getIssue` and `listIssueComments` to read the task and its instructions. Reading never assigns, claims or moves an issue. Project `agents.md` can tell the client to present the task and proposed approach, then wait for the user's approval before implementation.

After approval, use `moveIssue` to start work. After verification, update completed requirements, post an outcome with `addIssueComment`, attach a PR with `addIssueReference`, and move the issue to the agreed review column. Column choices and approval rules come from the project instructions and the user's directions. MCP provides these operations but does not enforce an approval workflow or start work automatically.

## Logging time on Work issues

`getIssueTimeLog`, `logIssueTime`, `updateIssueTime` and `deleteIssueTime` use **Work MCP access** in Settings / People. None requires Time report App access or Time report MCP access. All require access to the Work customer and project, including project membership for admins. Customer users cannot write time, and their time-log reads follow the existing customer time-visibility setting.

`getIssueTimeLog` takes `projectId` and `issueId`. It returns `canLog`, `cannotLogReason`, the current consultant ID, available `roleOptions`, the default role ID, existing entries and total logged hours. Role IDs can be UUIDs or custom `cr:`/`pr:` billing keys. Read this tool before logging and use an exact `roleOptions[].id`.

`logIssueTime` takes the Work `projectId`, `issueId`, `date`, `hours`, `roleId` and an optional `note`. It resolves the customer and linked Planner project from the Work issue. No customer ID, Planner project ID, external issue reference or consultant ID is accepted from the client. The token owner needs a linked consultant profile. Existing consultant customer assignments and external-consultant project restrictions still apply. The Work project must have a linked Planner project and configured billing roles.

```json
{
  "name": "logIssueTime",
  "arguments": {
    "projectId": "<work-project-uuid>",
    "issueId": "<work-issue-uuid>",
    "date": "2026-10-18",
    "hours": 1.5,
    "roleId": "<role-id-from-getIssueTimeLog>",
    "note": "Fixed the task's checkout validation."
  }
}
```

Each call adds a separate entry, including repeated calls for the same date. Hours must be greater than zero and at most 24, rounded to two decimals. The tool uses the website's Work logging service and existing transaction, billing and audit logic. It returns the saved date, hours, role and note, plus the updated time entries and total. Work and Time report pages are invalidated after saving. If the result is uncertain, inspect `getIssueTimeLog` before retrying to avoid duplicate entries.

Read `getProjectContext` before writing. Reuse details the user already supplied, ask only for missing information, and never invent duration or work performed. Use the only available billing role or ask when ambiguous. Once logging is authorized and the details are established, save without another confirmation.

`updateIssueTime` replaces `date` and `hours` for one existing `entryId` from `getIssueTimeLog`. Omit `note` to preserve it, or use null/empty text to clear it. The entry ID and billing snapshots stay unchanged. Moving an entry to another week updates both week revisions, the entry and its audit records in one transaction. A failed move leaves the original entry intact.

`deleteIssueTime` permanently deletes one existing entry, retaining its audit history. Both tools only modify the token owner's linked consultant entries and retain consultant customer assignments and external-consultant project restrictions. An entry from another consultant or issue is rejected. Both return `projectId`, `issueId`, `entryId`, `entries` and `loggedHours`, then invalidate Work and Time report pages. If a result is uncertain, read `getIssueTimeLog` before retrying.

```json
{
  "name": "updateIssueTime",
  "arguments": {
    "projectId": "<project-uuid>",
    "issueId": "<issue-uuid>",
    "entryId": "<entry-uuid>",
    "date": "2026-10-19",
    "hours": 2,
    "note": "Corrected duration."
  }
}
```

```json
{ "name": "deleteIssueTime", "arguments": { "projectId": "<project-uuid>", "issueId": "<issue-uuid>", "entryId": "<entry-uuid>" } }
```

## Ping

The SDK provides the standard MCP `ping` method and initialization handshake. `tools/list` includes the 23 Work tools documented above when Work MCP access is enabled, otherwise it returns an empty list. Ping is a protocol method and does not appear as an agent tool.

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
