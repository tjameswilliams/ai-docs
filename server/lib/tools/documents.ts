import { db, schema } from "../../db/client";
import { eq } from "drizzle-orm";
import { newId } from "../nanoid";
import { recordEvent } from "../undoManager";

type UndoCtx = { groupId: string; seq: number } | undefined;

async function record(ctx: UndoCtx, projectId: string, entityId: string, action: "create" | "update" | "delete", before: any, after: any, desc: string) {
  if (!ctx) return;
  await recordEvent({
    projectId,
    batchId: ctx.groupId,
    sequence: ctx.seq,
    entityType: "documents",
    entityId,
    action,
    beforeJson: before ? JSON.stringify(before) : undefined,
    afterJson: after ? JSON.stringify(after) : undefined,
    source: "chat",
    description: desc,
  });
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export const documentToolDefinitions = [
  {
    type: "function" as const,
    function: {
      name: "create_document",
      description: "Create a new document in the project.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Document title" },
          folder_id: { type: "string", description: "Folder to put the document in (optional, root if omitted)" },
          content: { type: "string", description: "Initial markdown content (optional)" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_document",
      description: "Get a document's metadata (title, word count, folder, timestamps).",
      parameters: {
        type: "object",
        properties: {
          document_id: { type: "string" },
        },
        required: ["document_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_document_content",
      description: "Get the full markdown content of a document.",
      parameters: {
        type: "object",
        properties: {
          document_id: { type: "string" },
        },
        required: ["document_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_document",
      description: "Update a document's metadata (title, folder).",
      parameters: {
        type: "object",
        properties: {
          document_id: { type: "string" },
          title: { type: "string", description: "New title (optional)" },
          folder_id: { type: "string", description: "Move to folder (optional, use empty string for root)" },
        },
        required: ["document_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_document_content",
      description: "Update the content of a document. Supports replace (full) or append mode.",
      parameters: {
        type: "object",
        properties: {
          document_id: { type: "string" },
          content: { type: "string", description: "New content (markdown)" },
          mode: { type: "string", enum: ["replace", "append"], description: "Replace entire content or append to it (default: replace)" },
        },
        required: ["document_id", "content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "patch_document",
      description: `Apply surgical edits to a document without rewriting the entire content. Accepts an array of operations applied in order. This is far more efficient than update_document_content for targeted changes.

Operation types:
- "find_replace": Find exact text and replace it. Set old_text to the exact string to find (including whitespace/newlines). Supports optional "count" to limit replacements (default: replace first occurrence, use -1 for all).
- "insert_before": Insert new text immediately before the matched text.
- "insert_after": Insert new text immediately after the matched text.
- "delete": Delete the exact matched text from the document.
- "insert_at_line": Insert text at a specific line number (1-based). Line 1 = beginning of document, use a large number for end.
- "replace_range": Replace content between two line numbers (inclusive, 1-based).

Tips: Use enough surrounding context in old_text to ensure a unique match. Include a few words before and after the target to avoid ambiguity. Newlines in old_text should be written as actual newlines in the JSON string (\\n).`,
      parameters: {
        type: "object",
        properties: {
          document_id: { type: "string" },
          operations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                op: {
                  type: "string",
                  enum: ["find_replace", "insert_before", "insert_after", "delete", "insert_at_line", "replace_range"],
                },
                old_text: { type: "string", description: "Text to find (for find_replace, insert_before, insert_after, delete)" },
                new_text: { type: "string", description: "Replacement or insertion text" },
                line: { type: "number", description: "Line number for insert_at_line (1-based)" },
                start_line: { type: "number", description: "Start line for replace_range (1-based, inclusive)" },
                end_line: { type: "number", description: "End line for replace_range (1-based, inclusive)" },
                count: { type: "number", description: "Number of occurrences to replace for find_replace (default: 1, use -1 for all)" },
              },
              required: ["op"],
            },
            description: "Array of patch operations to apply in order",
          },
        },
        required: ["document_id", "operations"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_document_images",
      description: "List all images embedded in a document. Returns the image URLs (local or remote), alt text, and their position in the document. Use this to find images for reuse in other documents or projects.",
      parameters: {
        type: "object",
        properties: {
          document_id: { type: "string" },
        },
        required: ["document_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_document",
      description: "Delete a document.",
      parameters: {
        type: "object",
        properties: {
          document_id: { type: "string" },
        },
        required: ["document_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "move_document",
      description: "Move a document to a different folder.",
      parameters: {
        type: "object",
        properties: {
          document_id: { type: "string" },
          folder_id: { type: "string", description: "Target folder ID, or null/empty for root" },
        },
        required: ["document_id"],
      },
    },
  },
];

export async function executeDocumentTool(
  name: string,
  args: Record<string, unknown>,
  projectId: string,
  undoContext?: UndoCtx
): Promise<{ success: boolean; result: unknown }> {
  const now = new Date().toISOString();

  switch (name) {
    case "create_document": {
      const id = newId();
      const content = (args.content as string) || "";
      await db.insert(schema.documents).values({
        id,
        projectId,
        folderId: (args.folder_id as string) || null,
        title: (args.title as string) || "Untitled",
        content,
        order: 0,
        wordCount: countWords(content),
        createdAt: now,
        updatedAt: now,
      });
      const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, id));
      await record(undoContext, projectId, id, "create", null, doc, `Created document "${doc.title}"`);
      return { success: true, result: { message: `Created document "${doc.title}"`, document: doc } };
    }

    case "get_document": {
      const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, args.document_id as string));
      if (!doc) return { success: false, result: "Document not found" };
      return { success: true, result: { document: { ...doc, content: undefined } } };
    }

    case "get_document_content": {
      const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, args.document_id as string));
      if (!doc) return { success: false, result: "Document not found" };
      return { success: true, result: { documentId: doc.id, title: doc.title, content: doc.content, wordCount: doc.wordCount } };
    }

    case "update_document": {
      const docId = args.document_id as string;
      const [before] = await db.select().from(schema.documents).where(eq(schema.documents.id, docId));
      const updates: Record<string, unknown> = { updatedAt: now };
      if (args.title) updates.title = args.title;
      if (args.folder_id !== undefined) {
        updates.folderId = args.folder_id === "" ? null : args.folder_id;
      }
      await db.update(schema.documents).set(updates).where(eq(schema.documents.id, docId));
      const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, docId));
      await record(undoContext, projectId, docId, "update", before, doc, `Updated document "${doc.title}"`);
      return { success: true, result: { message: `Updated document "${doc.title}"`, document: doc } };
    }

    case "update_document_content": {
      const docId = args.document_id as string;
      const [before] = await db.select().from(schema.documents).where(eq(schema.documents.id, docId));
      const mode = (args.mode as string) || "replace";
      let newContent = args.content as string;

      if (mode === "append" && before) {
        newContent = (before.content || "") + "\n" + newContent;
      }

      await db.update(schema.documents).set({
        content: newContent,
        wordCount: countWords(newContent),
        updatedAt: now,
      }).where(eq(schema.documents.id, docId));

      const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, docId));
      await record(undoContext, projectId, docId, "update", before, doc, `Updated content of "${doc?.title}"`);
      return { success: true, result: { message: `Updated content of "${doc.title}" (${doc.wordCount} words)`, documentId: doc.id } };
    }

    case "patch_document": {
      const docId = args.document_id as string;
      const [beforePatch] = await db.select().from(schema.documents).where(eq(schema.documents.id, docId));
      const operations = args.operations as Array<{
        op: string;
        old_text?: string;
        new_text?: string;
        line?: number;
        start_line?: number;
        end_line?: number;
        count?: number;
      }>;

      const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, docId));
      if (!doc) return { success: false, result: "Document not found" };

      let content = doc.content || "";
      const applied: string[] = [];
      const failed: string[] = [];

      for (let i = 0; i < operations.length; i++) {
        const op = operations[i];
        const label = `op[${i}] ${op.op}`;

        switch (op.op) {
          case "find_replace": {
            if (!op.old_text) { failed.push(`${label}: old_text required`); break; }
            const replaceCount = op.count ?? 1;
            if (replaceCount === -1) {
              // Replace all
              if (!content.includes(op.old_text)) {
                failed.push(`${label}: old_text not found`);
              } else {
                const before = content;
                content = content.split(op.old_text).join(op.new_text ?? "");
                const count = (before.length - content.length + (op.new_text ?? "").length * ((before.length - content.length) / op.old_text.length)) ;
                applied.push(`${label}: replaced all occurrences`);
              }
            } else {
              let replacements = 0;
              for (let r = 0; r < replaceCount; r++) {
                const idx = content.indexOf(op.old_text);
                if (idx === -1) break;
                content = content.slice(0, idx) + (op.new_text ?? "") + content.slice(idx + op.old_text.length);
                replacements++;
              }
              if (replacements === 0) {
                failed.push(`${label}: old_text not found`);
              } else {
                applied.push(`${label}: replaced ${replacements} occurrence(s)`);
              }
            }
            break;
          }

          case "insert_before": {
            if (!op.old_text) { failed.push(`${label}: old_text required`); break; }
            const idx = content.indexOf(op.old_text);
            if (idx === -1) { failed.push(`${label}: old_text not found`); break; }
            content = content.slice(0, idx) + (op.new_text ?? "") + content.slice(idx);
            applied.push(label);
            break;
          }

          case "insert_after": {
            if (!op.old_text) { failed.push(`${label}: old_text required`); break; }
            const idx = content.indexOf(op.old_text);
            if (idx === -1) { failed.push(`${label}: old_text not found`); break; }
            const end = idx + op.old_text.length;
            content = content.slice(0, end) + (op.new_text ?? "") + content.slice(end);
            applied.push(label);
            break;
          }

          case "delete": {
            if (!op.old_text) { failed.push(`${label}: old_text required`); break; }
            const idx = content.indexOf(op.old_text);
            if (idx === -1) { failed.push(`${label}: old_text not found`); break; }
            content = content.slice(0, idx) + content.slice(idx + op.old_text.length);
            applied.push(label);
            break;
          }

          case "insert_at_line": {
            const lineNum = op.line ?? 1;
            const lines = content.split("\n");
            const insertIdx = Math.min(Math.max(lineNum - 1, 0), lines.length);
            lines.splice(insertIdx, 0, op.new_text ?? "");
            content = lines.join("\n");
            applied.push(`${label}: inserted at line ${lineNum}`);
            break;
          }

          case "replace_range": {
            const startLine = (op.start_line ?? 1) - 1;
            const endLine = (op.end_line ?? startLine + 1) - 1;
            const lines = content.split("\n");
            const clamped_start = Math.max(0, Math.min(startLine, lines.length));
            const clamped_end = Math.max(clamped_start, Math.min(endLine + 1, lines.length));
            const removedCount = clamped_end - clamped_start;
            lines.splice(clamped_start, removedCount, ...(op.new_text ?? "").split("\n"));
            content = lines.join("\n");
            applied.push(`${label}: replaced lines ${clamped_start + 1}-${clamped_end}`);
            break;
          }

          default:
            failed.push(`${label}: unknown operation`);
        }
      }

      await db.update(schema.documents).set({
        content,
        wordCount: countWords(content),
        updatedAt: now,
      }).where(eq(schema.documents.id, docId));

      const [afterPatch] = await db.select().from(schema.documents).where(eq(schema.documents.id, docId));
      if (applied.length > 0) {
        await record(undoContext, projectId, docId, "update", beforePatch, afterPatch, `Patched "${doc.title}"`);
      }

      return {
        success: failed.length === 0,
        result: {
          message: `Patched "${doc.title}": ${applied.length} applied, ${failed.length} failed`,
          applied,
          failed: failed.length > 0 ? failed : undefined,
          wordCount: countWords(content),
        },
      };
    }

    case "list_document_images": {
      const docId = args.document_id as string;
      const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, docId));
      if (!doc) return { success: false, result: "Document not found" };

      const content = doc.content || "";
      const images: Array<{ src: string; alt: string; line: number }> = [];

      // Match markdown images: ![alt](src)
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
        let match;
        while ((match = regex.exec(lines[i])) !== null) {
          images.push({ alt: match[1], src: match[2], line: i + 1 });
        }
      }

      // Match HTML images: <img src="...">
      for (let i = 0; i < lines.length; i++) {
        const regex = /<img[^>]+src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?/gi;
        let match;
        while ((match = regex.exec(lines[i])) !== null) {
          // Avoid duplicates if already found as markdown
          if (!images.some((img) => img.src === match[1] && img.line === i + 1)) {
            images.push({ src: match[1], alt: match[2] || "", line: i + 1 });
          }
        }
      }

      return {
        success: true,
        result: {
          documentId: doc.id,
          title: doc.title,
          imageCount: images.length,
          images,
        },
      };
    }

    case "delete_document": {
      const delId = args.document_id as string;
      const [beforeDel] = await db.select().from(schema.documents).where(eq(schema.documents.id, delId));
      await db.delete(schema.documents).where(eq(schema.documents.id, delId));
      await record(undoContext, projectId, delId, "delete", beforeDel, null, `Deleted document "${beforeDel?.title}"`);
      return { success: true, result: { message: "Document deleted" } };
    }

    case "move_document": {
      const moveId = args.document_id as string;
      const [beforeMove] = await db.select().from(schema.documents).where(eq(schema.documents.id, moveId));
      const folderId = args.folder_id ? (args.folder_id as string) : null;
      await db.update(schema.documents)
        .set({ folderId, updatedAt: now })
        .where(eq(schema.documents.id, moveId));
      const [afterMove] = await db.select().from(schema.documents).where(eq(schema.documents.id, moveId));
      await record(undoContext, projectId, moveId, "update", beforeMove, afterMove, `Moved document "${beforeMove?.title}"`);
      return { success: true, result: { message: "Document moved" } };
    }

    default:
      return { success: false, result: `Unknown document tool: ${name}` };
  }
}
