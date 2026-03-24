import { db, schema } from "../../db/client";
import { eq } from "drizzle-orm";
import { sqlite } from "../../db/client";

export const queryToolDefinitions = [
  {
    type: "function" as const,
    function: {
      name: "query_database",
      description: "Execute a read-only SQL query against the database. Use this for complex queries that the other tools don't cover. Tables: projects, folders, documents, document_embeddings, chat_messages, settings, events.",
      parameters: {
        type: "object",
        properties: {
          sql: { type: "string", description: "SQL query (SELECT only)" },
        },
        required: ["sql"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_project_status",
      description: "Get an overview of the current project: folder structure, documents, and their word counts.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "Project ID (uses current if omitted)" },
        },
      },
    },
  },
];

export async function executeQueryTool(
  name: string,
  args: Record<string, unknown>,
  projectId: string
): Promise<{ success: boolean; result: unknown }> {
  switch (name) {
    case "query_database": {
      const sql = (args.sql as string).trim();
      if (!sql.toLowerCase().startsWith("select")) {
        return { success: false, result: "Only SELECT queries are allowed" };
      }
      try {
        const rows = sqlite.query(sql).all();
        return { success: true, result: { rows, count: (rows as any[]).length } };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, result: `SQL error: ${message}` };
      }
    }

    case "get_project_status": {
      const pid = (args.project_id as string) || projectId;
      const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, pid));
      if (!project) return { success: false, result: "Project not found" };

      const folders = await db.select().from(schema.folders).where(eq(schema.folders.projectId, pid));
      const documents = await db.select().from(schema.documents).where(eq(schema.documents.projectId, pid));

      const totalWords = documents.reduce((sum, d) => sum + (d.wordCount ?? 0), 0);

      // Build tree structure
      const buildTree = (parentId: string | null): any[] => {
        const childFolders = folders
          .filter((f) => f.parentId === parentId)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

        const childDocs = documents
          .filter((d) => d.folderId === parentId)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

        return [
          ...childFolders.map((f) => ({
            type: "folder",
            id: f.id,
            name: f.name,
            children: buildTree(f.id),
          })),
          ...childDocs.map((d) => ({
            type: "document",
            id: d.id,
            title: d.title,
            wordCount: d.wordCount,
          })),
        ];
      };

      return {
        success: true,
        result: {
          project: { id: project.id, name: project.name, description: project.description },
          stats: {
            folderCount: folders.length,
            documentCount: documents.length,
            totalWords,
          },
          tree: buildTree(null),
        },
      };
    }

    default:
      return { success: false, result: `Unknown query tool: ${name}` };
  }
}
