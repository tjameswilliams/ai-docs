import { db, schema } from "../../db/client";
import { eq } from "drizzle-orm";

export const searchToolDefinitions = [
  {
    type: "function" as const,
    function: {
      name: "search_documents_text",
      description: "Search document content by text or regex pattern. Returns matching documents with snippets.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Text or regex pattern to search for" },
          regex: { type: "boolean", description: "Treat query as regex (default: false)" },
          folder_id: { type: "string", description: "Limit search to a specific folder (optional)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_documents",
      description: "Semantic search across all documents using vector embeddings. Use this to find documents by meaning rather than exact text.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Natural language search query" },
          top_k: { type: "number", description: "Number of results to return (default: 10)" },
        },
        required: ["query"],
      },
    },
  },
];

export async function executeSearchTool(
  name: string,
  args: Record<string, unknown>,
  projectId: string
): Promise<{ success: boolean; result: unknown }> {
  switch (name) {
    case "search_documents_text": {
      const query = args.query as string;
      const useRegex = args.regex as boolean;
      const folderId = args.folder_id as string | undefined;

      let docs = await db.select().from(schema.documents).where(eq(schema.documents.projectId, projectId));

      if (folderId) {
        docs = docs.filter((d) => d.folderId === folderId);
      }

      const pattern = useRegex ? new RegExp(query, "gi") : null;
      const results: Array<{
        documentId: string;
        title: string;
        folderId: string | null;
        matches: Array<{ line: number; text: string }>;
      }> = [];

      for (const doc of docs) {
        const content = doc.content || "";
        const lines = content.split("\n");
        const matches: Array<{ line: number; text: string }> = [];

        lines.forEach((line, idx) => {
          const found = pattern ? pattern.test(line) : line.toLowerCase().includes(query.toLowerCase());
          if (found) {
            matches.push({ line: idx + 1, text: line.slice(0, 200) });
          }
          if (pattern) pattern.lastIndex = 0;
        });

        if (matches.length > 0) {
          results.push({
            documentId: doc.id,
            title: doc.title,
            folderId: doc.folderId,
            matches: matches.slice(0, 20), // Cap at 20 matches per doc
          });
        }
      }

      return {
        success: true,
        result: {
          query,
          totalMatches: results.reduce((sum, r) => sum + r.matches.length, 0),
          documents: results,
        },
      };
    }

    case "search_documents": {
      // Semantic search - delegates to embeddings module when available
      // For now, fall back to text search
      try {
        const { searchDocumentsSemantic } = await import("../embeddings");
        const results = await searchDocumentsSemantic(
          projectId,
          args.query as string,
          { topK: (args.top_k as number) || 10 }
        );
        return { success: true, result: { query: args.query, results } };
      } catch {
        // Fall back to basic text search if embeddings not configured
        return executeSearchTool("search_documents_text", args, projectId);
      }
    }

    default:
      return { success: false, result: `Unknown search tool: ${name}` };
  }
}
