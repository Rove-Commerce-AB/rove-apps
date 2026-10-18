import "server-only";

import { fromJsonSchema, type McpServer } from "@modelcontextprotocol/server";
import { revalidatePath } from "next/cache";
import type { McpUser } from "@/lib/mcpAuth";
import { getWorkProjectContext, listAccessibleWorkProjects, listAssignedWorkCustomers } from "@/lib/workBoards";
import { WorkInputError } from "@/lib/workErrors";
import { getWorkIssue, listWorkIssueComments } from "@/lib/workIssueDetails";
import { listWorkIssues } from "@/lib/workIssueSearch";
import { getWorkIssueTimeLogState, logTimeOnWorkIssue, type WorkIssueTimeLogState } from "@/lib/workIssueTimeLog";
import { addIssueComment, addIssueReference, createWorkIssue, editWorkIssue, setIssueRequirementDone, setWorkIssueStatus } from "@/lib/workIssues";
import type {
  WorkIssueCommentsInput, WorkIssueCommentsPage, WorkIssueDetails, WorkIssueDetailsInput,
  WorkIssueListInput, WorkIssueListPage, WorkIssueLookup, WorkProjectContext,
} from "@/lib/workTypes";

const uuid = { type: "string", format: "uuid" } as const;
const projectIdProperty = { ...uuid, description: "Work project ID from listProjects, listCustomersAndProjects or /work/{customerId}/{projectId}." };
const issueIdProperty = { ...uuid, description: "Issue UUID returned by listIssues, getIssue or createIssue." };
const readAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const writeAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

const detailProperties = {
  title: { type: "string", minLength: 1, maxLength: 1000 },
  description: { type: "string", maxLength: 100000 },
  currentState: { type: "string", maxLength: 100000 },
  nextStep: { type: "string", maxLength: 100000 },
  outOfScope: { type: "string", maxLength: 100000 },
  issueType: { type: "string", enum: ["issue", "bug"] },
  priority: { enum: ["low", "medium", "high", null], description: "Null clears priority." },
  labels: {
    type: "array",
    maxItems: 50,
    items: { type: "string", minLength: 1, maxLength: 100 },
    description: "Label names. Reuses project labels case-insensitively and creates missing ones. On update, replaces the complete label set. An empty array clears labels. Omit to keep existing labels.",
  },
};

const projectProperties = {
  id: uuid,
  title: { type: "string" },
  prefix: { type: "string" },
  customerId: uuid,
  customerName: { type: "string" },
};

const customerListSchema = {
  type: "array",
  items: {
    type: "object",
    properties: { id: uuid, name: { type: "string" } },
    required: ["id", "name"],
    additionalProperties: false,
  },
};

const projectListSchema = {
  type: "array",
  items: { type: "object", properties: projectProperties, required: Object.keys(projectProperties), additionalProperties: false },
};

const emptyInput = fromJsonSchema<Record<string, never>>({ type: "object", properties: {}, additionalProperties: false });

const projectListInput = fromJsonSchema<{ customerId?: string }>({
  type: "object",
  properties: { customerId: { ...uuid, description: "Optional customer ID to restrict the project list." } },
  additionalProperties: false,
});

const customerListOutput = fromJsonSchema({
  type: "object",
  properties: { customers: customerListSchema },
  required: ["customers"],
  additionalProperties: false,
});

const projectListOutput = fromJsonSchema({
  type: "object",
  properties: { projects: projectListSchema },
  required: ["projects"],
  additionalProperties: false,
});

const discoveryOutput = fromJsonSchema({
  type: "object",
  properties: {
    customers: customerListSchema,
    projects: projectListSchema,
  },
  required: ["customers", "projects"],
  additionalProperties: false,
});

const issueListInput = fromJsonSchema<WorkIssueListInput>({
  type: "object",
  properties: {
    projectId: projectIdProperty,
    customerId: { ...uuid, description: "Optional customer scope. If both IDs are set, the project must belong to this customer." },
    columnId: { ...uuid, description: "Optional column ID from getProjectContext. Requires projectId and must belong to that project." },
    assignedToMe: { type: "boolean", default: true, description: "True returns issues you own or are assigned to. False returns all issues in the accessible scope." },
    labels: {
      type: "array",
      maxItems: 50,
      items: { type: "string", minLength: 1, maxLength: 100 },
      description: "Require all supplied label names. Names are trimmed and matched case-insensitively. Empty array means no label filter.",
    },
    priority: { enum: ["low", "medium", "high", null], description: "Filter by priority. Null selects issues without priority. Omit for every priority." },
    isDone: { type: "boolean", description: "False selects open issues, true selects issues in done columns. Omit for both." },
    query: { type: "string", minLength: 1, maxLength: 500, description: "Case-insensitive literal text search in issue key, title and core text fields. Does not search comments." },
    sortBy: {
      type: "string",
      enum: ["number", "boardOrder", "priority"],
      default: "number",
      description: "number: project then issue number. boardOrder: project, column position then issue position. priority: high, medium, low, unset, then project and issue number.",
    },
    limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
    cursor: { type: "string", minLength: 1, maxLength: 1024, description: "Use nextCursor from the previous page with the same filters and sorting." },
  },
  dependentRequired: { columnId: ["projectId"] },
  additionalProperties: false,
});

const personSchema = {
  type: "object",
  properties: { id: uuid, name: { type: "string" }, initials: { type: "string" } },
  required: ["id", "name", "initials"],
  additionalProperties: false,
};

const issueProperties = {
  id: uuid,
  key: { type: "string" },
  title: { type: "string" },
  projectId: uuid,
  projectTitle: { type: "string" },
  customerId: uuid,
  customerName: { type: "string" },
  columnId: uuid,
  columnName: { type: "string" },
  isDone: { type: "boolean" },
  sortOrder: { type: "integer" },
  issueType: { type: "string", enum: ["issue", "bug"] },
  priority: { enum: ["low", "medium", "high", null] },
  description: { type: "string" },
  currentState: { type: "string" },
  nextStep: { type: "string" },
  outOfScope: { type: "string" },
  owner: { anyOf: [personSchema, { type: "null" }] },
  assignees: { type: "array", items: personSchema },
  labels: {
    type: "array",
    items: {
      type: "object",
      properties: { id: uuid, name: { type: "string" } },
      required: ["id", "name"],
      additionalProperties: false,
    },
  },
};

const issueListOutput = fromJsonSchema<WorkIssueListPage>({
  type: "object",
  properties: {
    issues: {
      type: "array",
      items: { type: "object", properties: issueProperties, required: Object.keys(issueProperties), additionalProperties: false },
    },
    nextCursor: { type: ["string", "null"] },
  },
  required: ["issues", "nextCursor"],
  additionalProperties: false,
});

const issueLookupInput = fromJsonSchema<WorkIssueLookup>({
  type: "object",
  properties: {
    projectId: projectIdProperty,
    issueId: issueIdProperty,
    issueKey: { type: "string", minLength: 4, maxLength: 32, description: "Issue key such as WORK-123, matched case-insensitively within projectId. Supply this or issueId, never both." },
  },
  required: ["projectId"],
  oneOf: [{ required: ["issueId"] }, { required: ["issueKey"] }],
  additionalProperties: false,
});

const checklistItemSchema = {
  type: "object",
  properties: { id: uuid, body: { type: "string" }, isDone: { type: "boolean" }, sortOrder: { type: "integer" } },
  required: ["id", "body", "isDone", "sortOrder"],
  additionalProperties: false,
};

const referenceSchema = {
  type: "object",
  properties: { id: uuid, url: { type: "string" }, label: { type: "string" }, sortOrder: { type: "integer" } },
  required: ["id", "url", "label", "sortOrder"],
  additionalProperties: false,
};

const relatedIssueSchema = {
  type: "object",
  properties: { relationId: uuid, id: uuid, key: { type: "string" }, title: { type: "string" }, status: uuid, isDone: { type: "boolean" } },
  required: ["relationId", "id", "key", "title", "status", "isDone"],
  additionalProperties: false,
};

const relatedIssuesSchema = { type: "array", items: relatedIssueSchema };
const issueDetailsProperties = {
  ...issueProperties,
  reporter: { anyOf: [personSchema, { type: "null" }] },
  component: { anyOf: [issueProperties.labels.items, { type: "null" }] },
  requirements: { type: "array", items: checklistItemSchema },
  definitionOfDone: { type: "array", items: checklistItemSchema },
  preDeployActions: { type: "array", items: checklistItemSchema },
  references: { type: "array", items: referenceSchema },
  relations: {
    type: "object",
    properties: {
      parent: { anyOf: [relatedIssueSchema, { type: "null" }] },
      children: relatedIssuesSchema,
      blocks: relatedIssuesSchema,
      blockedBy: relatedIssuesSchema,
      relates: relatedIssuesSchema,
    },
    required: ["parent", "children", "blocks", "blockedBy", "relates"],
    additionalProperties: false,
  },
  files: {
    type: "array",
    items: {
      type: "object",
      properties: {
        id: uuid, fileName: { type: "string" }, mimeType: { type: "string" },
        byteSize: { type: "integer" }, createdAt: { type: "string", format: "date-time" },
      },
      required: ["id", "fileName", "mimeType", "byteSize", "createdAt"],
      additionalProperties: false,
    },
  },
  showTime: { type: "boolean" },
  estimateHours: { type: ["number", "null"] },
  loggedHours: { type: "number" },
  sprintId: { type: ["string", "null"], format: "uuid" },
  startDate: { type: ["string", "null"], format: "date" },
  dueDate: { type: ["string", "null"], format: "date" },
};

const issueDetailsOutput = fromJsonSchema<{ issue: WorkIssueDetails }>({
  type: "object",
  properties: {
    issue: { type: "object", properties: issueDetailsProperties, required: Object.keys(issueDetailsProperties), additionalProperties: false },
  },
  required: ["issue"],
  additionalProperties: false,
});

const issueTimeLogInput = fromJsonSchema<{ projectId: string; issueId: string }>({
  type: "object",
  properties: { projectId: projectIdProperty, issueId: issueIdProperty },
  required: ["projectId", "issueId"],
  additionalProperties: false,
});

const timeLogEntriesSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      id: uuid,
      date: { type: "string", format: "date" },
      hours: { type: "number" },
      note: { type: ["string", "null"] },
      consultantId: uuid,
      consultantName: { type: "string" },
    },
    required: ["id", "date", "hours", "note", "consultantId", "consultantName"],
    additionalProperties: false,
  },
};

const issueTimeLogOutput = fromJsonSchema<WorkIssueTimeLogState & { projectId: string; issueId: string }>({
  type: "object",
  properties: {
    projectId: uuid,
    issueId: uuid,
    canLog: { type: "boolean" },
    cannotLogReason: { type: ["string", "null"] },
    currentConsultantId: { type: ["string", "null"], format: "uuid" },
    roleOptions: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, name: { type: "string" } },
        required: ["id", "name"],
        additionalProperties: false,
      },
    },
    defaultRoleId: { type: ["string", "null"] },
    entries: timeLogEntriesSchema,
    loggedHours: { type: "number" },
  },
  required: ["projectId", "issueId", "canLog", "cannotLogReason", "currentConsultantId", "roleOptions", "defaultRoleId", "entries", "loggedHours"],
  additionalProperties: false,
});

const logIssueTimeInput = fromJsonSchema<{
  projectId: string; issueId: string; date: string; hours: number; roleId: string; note?: string;
}>({
  type: "object",
  properties: {
    projectId: projectIdProperty,
    issueId: issueIdProperty,
    date: { type: "string", format: "date", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Date worked, in the user's timezone." },
    hours: { type: "number", exclusiveMinimum: 0, maximum: 24, description: "Hours to add as a new entry. 90 minutes is 1.5 hours." },
    roleId: { type: "string", minLength: 1, maxLength: 80, description: "Exact roleOptions[].id from getIssueTimeLog, including cr:/pr: prefixes." },
    note: { type: "string", maxLength: 10000, description: "Optional note about the work performed." },
  },
  required: ["projectId", "issueId", "date", "hours", "roleId"],
  additionalProperties: false,
});

const logIssueTimeOutput = fromJsonSchema({
  type: "object",
  properties: {
    projectId: uuid,
    issueId: uuid,
    date: { type: "string", format: "date" },
    hours: { type: "number" },
    roleId: { type: "string" },
    note: { type: ["string", "null"] },
    loggedHours: { type: "number" },
    entries: timeLogEntriesSchema,
  },
  required: ["projectId", "issueId", "date", "hours", "roleId", "note", "loggedHours", "entries"],
  additionalProperties: false,
});

const issueCommentsInput = fromJsonSchema<WorkIssueCommentsInput>({
  type: "object",
  properties: {
    projectId: projectIdProperty,
    issueId: issueIdProperty,
    limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
    cursor: { type: "string", minLength: 1, maxLength: 1024, description: "Use nextCursor from the previous page for this same project and issue." },
  },
  required: ["projectId", "issueId"],
  additionalProperties: false,
});

const issueCommentsOutput = fromJsonSchema<WorkIssueCommentsPage>({
  type: "object",
  properties: {
    projectId: uuid,
    issueId: uuid,
    comments: {
      type: "array",
      items: {
        type: "object",
        properties: { id: uuid, body: { type: "string" }, createdAt: { type: "string", format: "date-time" }, author: personSchema },
        required: ["id", "body", "createdAt", "author"],
        additionalProperties: false,
      },
    },
    nextCursor: { type: ["string", "null"] },
  },
  required: ["projectId", "issueId", "comments", "nextCursor"],
  additionalProperties: false,
});

const requirementDoneInput = fromJsonSchema<{ projectId: string; issueId: string; requirementId: string; isDone: boolean }>({
  type: "object",
  properties: {
    projectId: projectIdProperty,
    issueId: issueIdProperty,
    requirementId: { ...uuid, description: "ID from issue.requirements or issue.definitionOfDone returned by getIssue. Pre-deploy actions cannot be updated here." },
    isDone: { type: "boolean", description: "True checks the item, false unchecks it." },
  },
  required: ["projectId", "issueId", "requirementId", "isDone"],
  additionalProperties: false,
});

const requirementDoneOutput = fromJsonSchema({
  type: "object",
  properties: { projectId: uuid, issueId: uuid, requirementId: uuid, isDone: { type: "boolean" } },
  required: ["projectId", "issueId", "requirementId", "isDone"],
  additionalProperties: false,
});

const referenceInput = fromJsonSchema<{ projectId: string; issueId: string; url: string; label?: string }>({
  type: "object",
  properties: {
    projectId: projectIdProperty,
    issueId: issueIdProperty,
    url: { type: "string", minLength: 1, maxLength: 4096, description: "HTTP or HTTPS link. HTTPS is assumed when the scheme is omitted. The URL is stored, not fetched." },
    label: { type: "string", maxLength: 1000, default: "", description: "Optional reference title, such as Pull request." },
  },
  required: ["projectId", "issueId", "url"],
  additionalProperties: false,
});

const referenceOutput = fromJsonSchema({
  type: "object",
  properties: { projectId: uuid, issueId: uuid, referenceId: uuid, sortOrder: { type: "integer" } },
  required: ["projectId", "issueId", "referenceId", "sortOrder"],
  additionalProperties: false,
});

type CreateIssueInput = WorkIssueDetailsInput & { projectId: string; title: string; columnId?: string; assignToMe?: boolean };

const createIssueInput = fromJsonSchema<CreateIssueInput>({
  type: "object",
  properties: {
    projectId: projectIdProperty,
    columnId: { ...uuid, description: "Column from getProjectContext. Defaults to the first column." },
    ...detailProperties,
    assignToMe: { type: "boolean", default: true, description: "True makes you the owner. False leaves the issue unassigned." },
  },
  required: ["projectId", "title"],
  additionalProperties: false,
});

const updateIssueInput = fromJsonSchema<{ projectId: string; issueId: string; changes: WorkIssueDetailsInput }>({
  type: "object",
  properties: {
    projectId: projectIdProperty,
    issueId: issueIdProperty,
    changes: {
      type: "object",
      properties: detailProperties,
      minProperties: 1,
      additionalProperties: false,
      description: "Only provided fields change. Empty text clears a text field. Labels replace the existing set when provided. Reassignment is not supported yet.",
    },
  },
  required: ["projectId", "issueId", "changes"],
  additionalProperties: false,
});

const moveIssueInput = fromJsonSchema<{ projectId: string; issueId: string; columnId: string; sortOrder?: number }>({
  type: "object",
  properties: {
    projectId: projectIdProperty,
    issueId: issueIdProperty,
    columnId: { ...uuid, description: "Destination column ID from getProjectContext for this project." },
    sortOrder: { type: "integer", minimum: 0, maximum: 2147483646, description: "Optional sort order. Omit to append to the column." },
  },
  required: ["projectId", "issueId", "columnId"],
  additionalProperties: false,
});

const commentInput = fromJsonSchema<{ projectId: string; issueId: string; body: string }>({
  type: "object",
  properties: {
    projectId: projectIdProperty,
    issueId: issueIdProperty,
    body: { type: "string", minLength: 1, maxLength: 100000, description: "Comment text." },
  },
  required: ["projectId", "issueId", "body"],
  additionalProperties: false,
});

const issueWriteOutput = fromJsonSchema({
  type: "object",
  properties: { projectId: uuid, issueId: uuid },
  required: ["projectId", "issueId"],
  additionalProperties: false,
});

const moveIssueOutput = fromJsonSchema({
  type: "object",
  properties: { projectId: uuid, issueId: uuid, columnId: uuid, sortOrder: { type: "integer" } },
  required: ["projectId", "issueId", "columnId", "sortOrder"],
  additionalProperties: false,
});

const commentOutput = fromJsonSchema({
  type: "object",
  properties: { projectId: uuid, issueId: uuid, commentId: uuid },
  required: ["projectId", "issueId", "commentId"],
  additionalProperties: false,
});

const projectContextInput = fromJsonSchema<{ projectId: string }>({
  type: "object",
  properties: {
    projectId: projectIdProperty,
  },
  required: ["projectId"],
  additionalProperties: false,
});

const projectContextOutput = fromJsonSchema<WorkProjectContext>({
  type: "object",
  properties: {
    project: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        title: { type: "string" },
        prefix: { type: "string" },
        customerId: { type: "string", format: "uuid" },
        customerName: { type: "string" },
      },
      required: ["id", "title", "prefix", "customerId", "customerName"],
      additionalProperties: false,
    },
    columns: {
      type: "array",
      description: "Board columns in display order. Column IDs are the issue status IDs.",
      items: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          sortOrder: { type: "integer" },
          isDone: { type: "boolean" },
        },
        required: ["id", "name", "sortOrder", "isDone"],
        additionalProperties: false,
      },
    },
    agentsMd: { type: "string", description: "Instructions for working in this project, saved in Project settings / agents.md." },
  },
  required: ["project", "columns", "agentsMd"],
  additionalProperties: false,
});

export function registerWorkMcpTools(server: McpServer, user: McpUser): void {
  if (!user.appKeys.includes("work")) {
    return;
  }

  server.registerTool(
    "listCustomers",
    {
      title: "List my customers",
      description: "List active customers assigned to you, including explicit customer and consultant links. Admins also receive only their assigned customers.",
      inputSchema: emptyInput,
      outputSchema: customerListOutput,
      annotations: readAnnotations,
    },
    async () => workToolResult("list customers", async () => {
      const customers = await listAssignedWorkCustomers(user);

      return { customers: customers.map(({ id, name }) => ({ id, name })) };
    })
  );

  server.registerTool(
    "listProjects",
    {
      title: "List my projects",
      description: "List accessible Work projects, optionally filtered by customerId. Project membership is required for everyone, including admins, so all returned projects are assigned to you. Each includes its customer name.",
      inputSchema: projectListInput,
      outputSchema: projectListOutput,
      annotations: readAnnotations,
    },
    async ({ customerId }) => workToolResult("list projects", async () => ({
      projects: await listAccessibleWorkProjects(user, customerId),
    }))
  );

  server.registerTool(
    "listCustomersAndProjects",
    {
      title: "List my customers and projects",
      description: "Discover your assigned active customers and accessible Work projects in one call. Each project includes its customer name. Admins may belong to projects outside their assigned customers.",
      inputSchema: emptyInput,
      outputSchema: discoveryOutput,
      annotations: readAnnotations,
    },
    async () => workToolResult("list customers and projects", async () => {
      const [customers, projects] = await Promise.all([
        listAssignedWorkCustomers(user),
        listAccessibleWorkProjects(user),
      ]);

      return {
        customers: customers.map(({ id, name }) => ({ id, name })),
        projects,
      };
    })
  );

  server.registerTool(
    "listIssues",
    {
      title: "List Work issues",
      description: "List issues you own or are assigned to, optionally scoped to a project or customer. Filter by column, labels, priority, completion or text. Sort by number, boardOrder or priority. Set assignedToMe=false for all accessible issues. Follow nextCursor for more pages. Reading issues never changes their status.",
      inputSchema: issueListInput,
      outputSchema: issueListOutput,
      annotations: readAnnotations,
    },
    async (input) => workToolResult("list issues", () => listWorkIssues(user, input))
  );

  server.registerTool(
    "getIssue",
    {
      title: "Get a Work issue",
      description: "Read one issue by UUID or key within a project. Includes core fields, checklists, pre-deploy actions, references, related issues, attachment metadata and scheduling. Time fields follow existing permissions. Use listIssueComments for discussion. Does not change issue status.",
      inputSchema: issueLookupInput,
      outputSchema: issueDetailsOutput,
      annotations: readAnnotations,
    },
    async (input) => workToolResult("get issue", () => getWorkIssue(user, input))
  );

  server.registerTool(
    "getIssueTimeLog",
    {
      title: "Get a Work issue's time log",
      description: "Read time entries, available billing roles and whether you can log time on a Rove Work issue. Uses Work MCP access and project membership. Time report access is not required. Existing customer time-visibility rules apply. Use roleOptions[].id when calling logIssueTime.",
      inputSchema: issueTimeLogInput,
      outputSchema: issueTimeLogOutput,
      annotations: readAnnotations,
    },
    async ({ projectId, issueId }) => workToolResult("get issue time log", async () => ({
      projectId, issueId, ...await getWorkIssueTimeLogState(projectId, issueId, user),
    }))
  );

  server.registerTool(
    "logIssueTime",
    {
      title: "Log time on a Work issue",
      description: "Add one time entry to a Rove Work issue as the token owner's linked consultant. Uses Work MCP access, not Time report access. Customer users cannot log time. Read getProjectContext and getIssueTimeLog first. The Work project's linked Planner project is resolved automatically. Establish the issue, date, duration and billing role from the user or existing context. Never guess duration or work performed. Use the only available role or ask when ambiguous. After the user authorizes logging and the details are established, save without another confirmation. Each call creates a new entry, even for the same date. If the outcome is uncertain, check getIssueTimeLog before retrying. Summarize the returned saved hours, date, role and note.",
      inputSchema: logIssueTimeInput,
      outputSchema: logIssueTimeOutput,
      annotations: writeAnnotations,
    },
    async ({ projectId, issueId, ...input }) => workToolResult("log issue time", async () => {
      const result = await logTimeOnWorkIssue(projectId, issueId, input, user);

      if (!result.ok) throw new WorkInputError(result.error);

      return {
        projectId, issueId, date: input.date, hours: Math.round(input.hours * 100) / 100,
        roleId: input.roleId.trim(), note: input.note?.trim() || null,
        loggedHours: result.loggedHours, entries: result.entries,
      };
    }, true, ["/time-report"])
  );

  server.registerTool(
    "listIssueComments",
    {
      title: "List Work issue comments",
      description: "Read issue discussion, newest comments first. Includes author and timestamp. Follow nextCursor until null to read earlier comments.",
      inputSchema: issueCommentsInput,
      outputSchema: issueCommentsOutput,
      annotations: readAnnotations,
    },
    async (input) => workToolResult("list issue comments", () => listWorkIssueComments(user, input))
  );

  server.registerTool(
    "setIssueRequirementDone",
    {
      title: "Check a Work issue requirement",
      description: "Check or uncheck an acceptance criterion or definition-of-done item from getIssue. Read getProjectContext first. Mark items done only after verification. Repeating the same value does not add another activity event.",
      inputSchema: requirementDoneInput,
      outputSchema: requirementDoneOutput,
      annotations: { ...writeAnnotations, destructiveHint: true, idempotentHint: true },
    },
    async ({ projectId, issueId, requirementId, isDone }) => workToolResult("set issue requirement completion", async () => {
      await setIssueRequirementDone(projectId, issueId, requirementId, isDone, user);

      return { projectId, issueId, requirementId, isDone };
    }, true)
  );

  server.registerTool(
    "addIssueReference",
    {
      title: "Add a Work issue reference",
      description: "Attach an HTTP or HTTPS reference, such as a pull request, to an issue. Read getProjectContext first. Creates a new reference on each call and does not fetch the URL.",
      inputSchema: referenceInput,
      outputSchema: referenceOutput,
      annotations: writeAnnotations,
    },
    async ({ projectId, issueId, url, label }) => workToolResult("add issue reference", async () => {
      const reference = await addIssueReference(projectId, issueId, url, label ?? "", user);

      return { projectId, issueId, referenceId: reference.id, sortOrder: reference.sortOrder };
    }, true)
  );

  server.registerTool(
    "createIssue",
    {
      title: "Create a Work issue",
      description: "Create an issue with optional labels in a project after reading getProjectContext. Defaults to the first column and assigns you as owner. Set assignToMe=false to leave it unassigned.",
      inputSchema: createIssueInput,
      outputSchema: issueWriteOutput,
      annotations: writeAnnotations,
    },
    async ({ projectId, columnId, ...details }) => workToolResult("create issue", async () => {
      const issueId = await createWorkIssue({ ...details, boardId: projectId, status: columnId }, user);

      return { projectId, issueId };
    }, true)
  );

  server.registerTool(
    "updateIssue",
    {
      title: "Update a Work issue",
      description: "Update an issue's core fields and labels in one transaction. Read getProjectContext first. Omitted fields stay unchanged. Supplied labels replace the complete set. Reassignment is postponed.",
      inputSchema: updateIssueInput,
      outputSchema: issueWriteOutput,
      annotations: { ...writeAnnotations, destructiveHint: true },
    },
    async ({ projectId, issueId, changes }) => workToolResult("update issue", async () => {
      await editWorkIssue(projectId, issueId, changes, user);

      return { projectId, issueId };
    }, true)
  );

  server.registerTool(
    "moveIssue",
    {
      title: "Move a Work issue",
      description: "Move an issue between columns within its project. Use column IDs from getProjectContext. Defaults to the end of the destination column.",
      inputSchema: moveIssueInput,
      outputSchema: moveIssueOutput,
      annotations: { ...writeAnnotations, destructiveHint: true },
    },
    async ({ projectId, issueId, columnId, sortOrder }) => workToolResult("move issue", async () => {
      const nextOrder = await setWorkIssueStatus(projectId, issueId, columnId, sortOrder, user);

      return { projectId, issueId, columnId, sortOrder: nextOrder };
    }, true)
  );

  server.registerTool(
    "addIssueComment",
    {
      title: "Add a Work issue comment",
      description: "Add a comment to an issue in the specified project as the authenticated user.",
      inputSchema: commentInput,
      outputSchema: commentOutput,
      annotations: writeAnnotations,
    },
    async ({ projectId, issueId, body }) => workToolResult("add issue comment", async () => {
      const commentId = await addIssueComment(projectId, issueId, body, user);

      return { projectId, issueId, commentId };
    }, true)
  );

  server.registerTool(
    "getProjectContext",
    {
      title: "Get project context",
      description: "Get project instructions and board columns before working on issues in a Rove Work project.",
      inputSchema: projectContextInput,
      outputSchema: projectContextOutput,
      annotations: readAnnotations,
    },
    async ({ projectId }) => {
      try {
        const context = await getWorkProjectContext(projectId, user);

        if (!context) {
          return { isError: true, content: [{ type: "text", text: "Project not found or access denied." }] };
        }

        return {
          structuredContent: context,
          content: [{ type: "text", text: JSON.stringify(context) }],
        };
      } catch {
        console.error("[mcp] Failed to load project context.");
        return { isError: true, content: [{ type: "text", text: "Unable to load project context." }] };
      }
    }
  );
}

async function workToolResult(
  action: string,
  operation: () => Promise<Record<string, unknown>>,
  mutates = false,
  additionalRevalidationPaths: string[] = []
) {
  try {
    const result = await operation();

    if (mutates) {
      try {
        for (const path of ["/work", ...additionalRevalidationPaths]) {
          revalidatePath(path, "layout");
        }
      } catch {
        // A cache failure must not report a committed mutation as failed.
        console.error("[mcp] Failed to revalidate pages.");
      }
    }

    return { structuredContent: result, content: [{ type: "text" as const, text: JSON.stringify(result) }] };
  } catch (error) {
    if (!(error instanceof WorkInputError)) console.error(`[mcp] Failed to ${action}.`);

    return {
      isError: true,
      content: [{ type: "text" as const, text: error instanceof WorkInputError ? error.message : `Unable to ${action}.` }],
    };
  }
}
