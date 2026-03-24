import { Hono } from "hono";
import { db, schema } from "../db/client";
import { eq } from "drizzle-orm";
import { newId } from "../lib/nanoid";
import { generateStyleGuide, getStyleProfile } from "../lib/styleAnalyzer";

const app = new Hono();

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ── Style Sources ──

// List sources for a project
app.get("/projects/:projectId/style/sources", async (c) => {
  const projectId = c.req.param("projectId");
  const rows = await db
    .select()
    .from(schema.styleSources)
    .where(eq(schema.styleSources.projectId, projectId));
  return c.json(rows);
});

// Add a source from pasted text
app.post("/projects/:projectId/style/sources", async (c) => {
  const projectId = c.req.param("projectId");
  const body = await c.req.json();
  const id = newId();
  const content = body.content || "";

  await db.insert(schema.styleSources).values({
    id,
    projectId,
    type: body.type || "upload",
    name: body.name || "Untitled Sample",
    content,
    url: body.url || null,
    documentId: body.documentId || null,
    wordCount: countWords(content),
    createdAt: new Date().toISOString(),
  });

  const [source] = await db
    .select()
    .from(schema.styleSources)
    .where(eq(schema.styleSources.id, id));
  return c.json(source, 201);
});

// Add a source from URL (fetch and extract)
app.post("/projects/:projectId/style/sources/url", async (c) => {
  const projectId = c.req.param("projectId");
  const body = await c.req.json();
  const url = body.url as string;

  if (!url) return c.json({ error: "URL required" }, 400);

  // Use the web fetch tool to extract content
  const { executeWebTool } = await import("../lib/tools/web");
  const result = await executeWebTool("fetch_webpage", { url, max_length: 50000 });

  if (!result.success) {
    return c.json({ error: `Failed to fetch URL: ${result.result}` }, 400);
  }

  const page = result.result as {
    title: string;
    content: string;
    wordCount: number;
  };

  const id = newId();
  await db.insert(schema.styleSources).values({
    id,
    projectId,
    type: "url",
    name: page.title || url,
    content: page.content,
    url,
    wordCount: page.wordCount,
    createdAt: new Date().toISOString(),
  });

  const [source] = await db
    .select()
    .from(schema.styleSources)
    .where(eq(schema.styleSources.id, id));
  return c.json(source, 201);
});

// Add a source from a project document
app.post("/projects/:projectId/style/sources/document", async (c) => {
  const projectId = c.req.param("projectId");
  const body = await c.req.json();
  const documentId = body.documentId as string;

  if (!documentId) return c.json({ error: "documentId required" }, 400);

  const [doc] = await db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.id, documentId));

  if (!doc) return c.json({ error: "Document not found" }, 404);

  const id = newId();
  await db.insert(schema.styleSources).values({
    id,
    projectId,
    type: "document",
    name: doc.title,
    content: doc.content || "",
    documentId,
    wordCount: doc.wordCount ?? 0,
    createdAt: new Date().toISOString(),
  });

  const [source] = await db
    .select()
    .from(schema.styleSources)
    .where(eq(schema.styleSources.id, id));
  return c.json(source, 201);
});

// Upload file as source
app.post("/projects/:projectId/style/sources/upload", async (c) => {
  const projectId = c.req.param("projectId");
  const body = await c.req.parseBody();
  const file = body.file;

  if (!file || typeof file === "string") {
    return c.json({ error: "No file provided" }, 400);
  }

  const content = await file.text();
  const id = newId();

  await db.insert(schema.styleSources).values({
    id,
    projectId,
    type: "upload",
    name: file.name || "Uploaded File",
    content,
    wordCount: countWords(content),
    createdAt: new Date().toISOString(),
  });

  const [source] = await db
    .select()
    .from(schema.styleSources)
    .where(eq(schema.styleSources.id, id));
  return c.json(source, 201);
});

// Delete a source
app.delete("/style/sources/:id", async (c) => {
  const id = c.req.param("id");
  await db.delete(schema.styleSources).where(eq(schema.styleSources.id, id));
  return c.json({ success: true });
});

// ── Style Profile ──

// Get the generated style profile
app.get("/projects/:projectId/style/profile", async (c) => {
  const projectId = c.req.param("projectId");
  const profile = await getStyleProfile(projectId);
  return c.json(profile || { guide: null, examples: [], metadata: {} });
});

// Generate / regenerate the style profile
app.post("/projects/:projectId/style/generate", async (c) => {
  const projectId = c.req.param("projectId");
  try {
    const result = await generateStyleGuide(projectId);
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: message }, 400);
  }
});

// Update the style guide (manual edits)
app.put("/projects/:projectId/style/profile", async (c) => {
  const projectId = c.req.param("projectId");
  const body = await c.req.json();
  const now = new Date().toISOString();

  const existing = await db
    .select()
    .from(schema.styleProfiles)
    .where(eq(schema.styleProfiles.projectId, projectId));

  if (existing.length > 0) {
    await db
      .update(schema.styleProfiles)
      .set({ guide: body.guide, updatedAt: now })
      .where(eq(schema.styleProfiles.projectId, projectId));
  } else {
    await db.insert(schema.styleProfiles).values({
      id: newId(),
      projectId,
      guide: body.guide,
      examples: "[]",
      metadata: "{}",
      createdAt: now,
      updatedAt: now,
    });
  }

  return c.json({ success: true });
});

export default app;
