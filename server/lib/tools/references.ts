import { db, schema } from "../../db/client";
import { eq, like } from "drizzle-orm";

export const referenceToolDefinitions = [
  {
    type: "function" as const,
    function: {
      name: "list_projects",
      description:
        "List all projects in the workspace. Use this to discover other projects whose documents can be referenced as research material or source content.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_project_documents",
      description:
        "List all documents in a specific project. Use this to browse a reference project's content before reading specific documents. Returns titles, word counts, and folder structure.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "string",
            description: "Project ID to list documents from",
          },
          project_name: {
            type: "string",
            description: "Search for project by name instead of ID (fuzzy match)",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_reference_document",
      description:
        "Read the full content of a document from any project. Use this to pull in research notes, reference material, or source content from other projects when writing. Returns the document title, content, and word count.",
      parameters: {
        type: "object",
        properties: {
          document_id: {
            type: "string",
            description: "Document ID to read",
          },
        },
        required: ["document_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_all_documents",
      description:
        "Search across ALL projects for documents matching a query. Use this to find relevant research, notes, or reference material anywhere in the workspace — not just the current project. Searches by title and content.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search text to match against document titles and content",
          },
          project_name: {
            type: "string",
            description: "Optionally limit search to a specific project by name",
          },
          max_results: {
            type: "number",
            description: "Maximum number of results (default: 15)",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_multiple_documents",
      description:
        "Read the content of multiple documents at once. Use this to efficiently load several reference documents in a single call rather than reading them one at a time. Returns an array of document contents. Each document's content is capped at max_length characters.",
      parameters: {
        type: "object",
        properties: {
          document_ids: {
            type: "array",
            items: { type: "string" },
            description: "Array of document IDs to read",
          },
          max_length: {
            type: "number",
            description: "Max characters per document (default: 10000). Use lower values when reading many documents to stay within context limits.",
          },
        },
        required: ["document_ids"],
      },
    },
  },
];

export async function executeReferenceTool(
  name: string,
  args: Record<string, unknown>,
  currentProjectId: string
): Promise<{ success: boolean; result: unknown }> {
  switch (name) {
    case "list_projects": {
      const projects = await db.select().from(schema.projects);
      return {
        success: true,
        result: {
          projects: projects.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            isCurrent: p.id === currentProjectId,
          })),
        },
      };
    }

    case "get_project_documents": {
      let targetProjectId = args.project_id as string | undefined;

      // Search by name if no ID provided
      if (!targetProjectId && args.project_name) {
        const projects = await db.select().from(schema.projects);
        const searchName = (args.project_name as string).toLowerCase();
        const match = projects.find(
          (p) =>
            p.name.toLowerCase() === searchName ||
            p.name.toLowerCase().includes(searchName)
        );
        if (!match) {
          return {
            success: false,
            result: `No project found matching "${args.project_name}". Use list_projects to see available projects.`,
          };
        }
        targetProjectId = match.id;
      }

      if (!targetProjectId) {
        targetProjectId = currentProjectId;
      }

      const [project] = await db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, targetProjectId));
      if (!project)
        return { success: false, result: "Project not found" };

      const folders = await db
        .select()
        .from(schema.folders)
        .where(eq(schema.folders.projectId, targetProjectId));
      const documents = await db
        .select()
        .from(schema.documents)
        .where(eq(schema.documents.projectId, targetProjectId));

      const folderMap = new Map(folders.map((f) => [f.id, f.name]));

      return {
        success: true,
        result: {
          project: { id: project.id, name: project.name },
          documentCount: documents.length,
          totalWords: documents.reduce(
            (sum, d) => sum + (d.wordCount ?? 0),
            0
          ),
          documents: documents.map((d) => ({
            id: d.id,
            title: d.title,
            folder: d.folderId ? folderMap.get(d.folderId) || d.folderId : null,
            wordCount: d.wordCount,
          })),
        },
      };
    }

    case "read_reference_document": {
      const docId = args.document_id as string;
      const [doc] = await db
        .select()
        .from(schema.documents)
        .where(eq(schema.documents.id, docId));
      if (!doc) return { success: false, result: "Document not found" };

      // Get the project name for context
      const [project] = await db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, doc.projectId));

      return {
        success: true,
        result: {
          documentId: doc.id,
          title: doc.title,
          projectId: doc.projectId,
          projectName: project?.name,
          wordCount: doc.wordCount,
          content: doc.content,
        },
      };
    }

    case "search_all_documents": {
      const query = (args.query as string).toLowerCase();
      const maxResults = (args.max_results as number) || 15;

      // Get all projects (optionally filtered by name)
      let projects = await db.select().from(schema.projects);
      if (args.project_name) {
        const pname = (args.project_name as string).toLowerCase();
        projects = projects.filter(
          (p) =>
            p.name.toLowerCase().includes(pname)
        );
      }
      const projectMap = new Map(projects.map((p) => [p.id, p.name]));
      const projectIds = new Set(projects.map((p) => p.id));

      // Search across all documents in matching projects
      const allDocs = await db.select().from(schema.documents);
      const matchingDocs = allDocs.filter((d) => {
        if (!projectIds.has(d.projectId)) return false;
        const titleMatch = d.title.toLowerCase().includes(query);
        const contentMatch = (d.content || "")
          .toLowerCase()
          .includes(query);
        return titleMatch || contentMatch;
      });

      // Score: title match is worth more
      const scored = matchingDocs.map((d) => {
        let score = 0;
        if (d.title.toLowerCase().includes(query)) score += 10;
        const content = (d.content || "").toLowerCase();
        const occurrences = content.split(query).length - 1;
        score += Math.min(occurrences, 10);
        return { doc: d, score };
      });

      scored.sort((a, b) => b.score - a.score);
      const top = scored.slice(0, maxResults);

      return {
        success: true,
        result: {
          query: args.query,
          resultCount: top.length,
          results: top.map(({ doc, score }) => {
            // Extract a snippet around the first match
            const content = doc.content || "";
            const idx = content.toLowerCase().indexOf(query);
            const snippetStart = Math.max(0, idx - 80);
            const snippetEnd = Math.min(content.length, idx + query.length + 80);
            const snippet =
              idx >= 0
                ? (snippetStart > 0 ? "..." : "") +
                  content.slice(snippetStart, snippetEnd) +
                  (snippetEnd < content.length ? "..." : "")
                : content.slice(0, 160) + (content.length > 160 ? "..." : "");

            return {
              documentId: doc.id,
              title: doc.title,
              projectId: doc.projectId,
              projectName: projectMap.get(doc.projectId),
              wordCount: doc.wordCount,
              snippet,
              score,
            };
          }),
        },
      };
    }

    case "read_multiple_documents": {
      const docIds = args.document_ids as string[];
      const maxLength = (args.max_length as number) || 10000;

      const results: Array<{
        documentId: string;
        title: string;
        projectName: string | undefined;
        wordCount: number | null;
        content: string;
      }> = [];

      for (const docId of docIds) {
        const [doc] = await db
          .select()
          .from(schema.documents)
          .where(eq(schema.documents.id, docId));
        if (!doc) continue;

        const [project] = await db
          .select()
          .from(schema.projects)
          .where(eq(schema.projects.id, doc.projectId));

        let content = doc.content || "";
        if (content.length > maxLength) {
          content =
            content.slice(0, maxLength) +
            `\n\n[Truncated at ${maxLength} characters — use read_reference_document for full content]`;
        }

        results.push({
          documentId: doc.id,
          title: doc.title,
          projectName: project?.name,
          wordCount: doc.wordCount,
          content,
        });
      }

      return {
        success: true,
        result: {
          documentsRead: results.length,
          documentsRequested: docIds.length,
          documents: results,
        },
      };
    }

    default:
      return { success: false, result: `Unknown reference tool: ${name}` };
  }
}
