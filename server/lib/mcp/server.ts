import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { db, schema } from "../../db/client";
import { eq } from "drizzle-orm";
import { executeToolCall, getToolDefinitions } from "../tools/index";
import { newId } from "../nanoid";

let currentProjectId: string | null = null;

const server = new Server(
  { name: "ai-docs", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

const exposedTools = [
  "get_project_status",
  "create_folder",
  "rename_folder",
  "delete_folder",
  "move_folder",
  "list_folders",
  "create_document",
  "get_document",
  "get_document_content",
  "update_document",
  "update_document_content",
  "patch_document",
  "list_document_images",
  "delete_document",
  "move_document",
  "search_documents",
  "search_documents_text",
  "query_database",
  "web_search",
  "fetch_webpage",
  "download_image",
  "list_projects",
  "get_project_documents",
  "read_reference_document",
  "search_all_documents",
  "read_multiple_documents",
];

const projectIdProp = {
  project_id: {
    type: "string" as const,
    description: "Project ID (uses active project if omitted)",
  },
};

const metaTools = [
  {
    name: "list_projects",
    description: "List all projects in the workspace.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "set_active_project",
    description: "Set the active project for subsequent tool calls.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "Project ID to activate" },
      },
      required: ["project_id"],
    },
  },
  {
    name: "create_project",
    description: "Create a new project.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Project name" },
        description: { type: "string", description: "Project description (optional)" },
      },
      required: ["name"],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const allDefs = getToolDefinitions();
  const filtered = allDefs
    .filter((t) => exposedTools.includes(t.function.name))
    .map((t) => ({
      name: t.function.name,
      description: t.function.description,
      inputSchema: {
        ...t.function.parameters,
        properties: {
          ...(t.function.parameters as any).properties,
          ...projectIdProp,
        },
      },
    }));

  return { tools: [...metaTools, ...filtered] };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const typedArgs = (args ?? {}) as Record<string, unknown>;

  if (name === "list_projects") {
    const projects = await db.select().from(schema.projects);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            projects: projects.map((p) => ({ id: p.id, name: p.name })),
            activeProjectId: currentProjectId,
          }),
        },
      ],
    };
  }

  if (name === "set_active_project") {
    currentProjectId = typedArgs.project_id as string;
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ activeProjectId: currentProjectId }) }],
    };
  }

  if (name === "create_project") {
    const id = newId();
    const now = new Date().toISOString();
    await db.insert(schema.projects).values({
      id,
      name: (typedArgs.name as string) || "Untitled Project",
      description: (typedArgs.description as string) || "",
      createdAt: now,
      updatedAt: now,
    });
    currentProjectId = id;
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ projectId: id, name: typedArgs.name, activeProjectId: id }) }],
    };
  }

  const projectId = (typedArgs.project_id as string) || currentProjectId;
  if (!projectId) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: "No project selected. Use set_active_project first." }],
    };
  }

  const result = await executeToolCall(name, typedArgs, projectId);
  return {
    isError: !result.success,
    content: [{ type: "text" as const, text: JSON.stringify(result.result) }],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcp-server] AI Docs MCP server running on stdio");
}

main().catch(console.error);
