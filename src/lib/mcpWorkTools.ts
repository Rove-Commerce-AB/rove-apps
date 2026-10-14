import "server-only";

import { fromJsonSchema, type McpServer } from "@modelcontextprotocol/server";
import type { McpUser } from "@/lib/mcpAuth";
import { getWorkProjectContext } from "@/lib/workBoards";
import type { WorkProjectContext } from "@/lib/workTypes";

const projectContextInput = fromJsonSchema<{ projectId: string }>({
  type: "object",
  properties: {
    projectId: { type: "string", format: "uuid", description: "Work project ID from /work/{customerId}/{projectId}." },
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
    "getProjectContext",
    {
      title: "Get project context",
      description: "Get project instructions and board columns before working on issues in a Rove Work project.",
      inputSchema: projectContextInput,
      outputSchema: projectContextOutput,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
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
