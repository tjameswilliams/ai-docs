import { Hono } from "hono";
import { db, schema } from "../db/client";
import { eq, and } from "drizzle-orm";
import { newId } from "../lib/nanoid";
import { searchDocumentsSemantic } from "../lib/embeddings";

const app = new Hono();

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// Debounced embedding: waits 3s after last save before embedding
const embeddingTimers = new Map<string, ReturnType<typeof setTimeout>>();
function scheduleEmbedding(documentId: string) {
  const existing = embeddingTimers.get(documentId);
  if (existing) clearTimeout(existing);
  embeddingTimers.set(documentId, setTimeout(async () => {
    embeddingTimers.delete(documentId);
    try {
      const { embedDocument } = await import("../lib/embeddings");
      await embedDocument(documentId);
    } catch (e) {
      console.error("[embeddings] Failed to embed document:", e);
    }
  }, 3000));
}

// List documents for a project
app.get("/projects/:projectId/documents", async (c) => {
  const projectId = c.req.param("projectId");
  const rows = await db.select().from(schema.documents).where(eq(schema.documents.projectId, projectId));
  return c.json(rows);
});

// Get single document
app.get("/documents/:id", async (c) => {
  const id = c.req.param("id");
  const rows = await db.select().from(schema.documents).where(eq(schema.documents.id, id));
  if (rows.length === 0) return c.json({ error: "Not found" }, 404);
  return c.json(rows[0]);
});

// Create document
app.post("/projects/:projectId/documents", async (c) => {
  const projectId = c.req.param("projectId");
  const body = await c.req.json();
  const id = newId();
  const now = new Date().toISOString();
  const content = body.content || "";

  // Get max order among siblings
  const siblings = await db.select().from(schema.documents).where(
    body.folderId
      ? and(eq(schema.documents.projectId, projectId), eq(schema.documents.folderId, body.folderId))
      : and(eq(schema.documents.projectId, projectId))
  );
  const maxOrder = siblings.reduce((max, d) => Math.max(max, d.order ?? 0), -1);

  await db.insert(schema.documents).values({
    id,
    projectId,
    folderId: body.folderId || null,
    title: body.title || "Untitled",
    content,
    order: maxOrder + 1,
    wordCount: countWords(content),
    createdAt: now,
    updatedAt: now,
  });
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, id));
  return c.json(doc, 201);
});

// Update document
app.put("/documents/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const updates: Record<string, unknown> = {
    ...body,
    updatedAt: new Date().toISOString(),
  };

  // Recompute word count if content changed
  if (typeof body.content === "string") {
    updates.wordCount = countWords(body.content);
  }

  await db.update(schema.documents).set(updates).where(eq(schema.documents.id, id));
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, id));

  // Fire-and-forget embedding on content change
  if (typeof body.content === "string") {
    scheduleEmbedding(id);
  }

  return c.json(doc);
});

// Delete document
app.delete("/documents/:id", async (c) => {
  const id = c.req.param("id");
  await db.delete(schema.documents).where(eq(schema.documents.id, id));
  return c.json({ success: true });
});

// Reorder documents
app.put("/projects/:projectId/documents/reorder", async (c) => {
  const body = await c.req.json();
  const { documentIds } = body;
  const now = new Date().toISOString();
  for (let i = 0; i < documentIds.length; i++) {
    await db.update(schema.documents).set({ order: i, updatedAt: now }).where(eq(schema.documents.id, documentIds[i]));
  }
  return c.json({ success: true });
});

// Semantic search across project documents
app.get("/projects/:projectId/search", async (c) => {
  const projectId = c.req.param("projectId");
  const query = c.req.query("q") || "";
  const topK = parseInt(c.req.query("topK") || "10", 10);

  if (!query.trim()) return c.json([]);

  try {
    const results = await searchDocumentsSemantic(projectId, query, { topK });
    return c.json(results);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

export default app;
