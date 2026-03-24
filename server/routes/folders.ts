import { Hono } from "hono";
import { db, schema } from "../db/client";
import { eq, and } from "drizzle-orm";
import { newId } from "../lib/nanoid";

const app = new Hono();

// List folders for a project
app.get("/projects/:projectId/folders", async (c) => {
  const projectId = c.req.param("projectId");
  const rows = await db.select().from(schema.folders).where(eq(schema.folders.projectId, projectId));
  return c.json(rows);
});

// Create folder
app.post("/projects/:projectId/folders", async (c) => {
  const projectId = c.req.param("projectId");
  const body = await c.req.json();
  const id = newId();
  const now = new Date().toISOString();

  // Get max order for siblings
  const siblings = await db.select().from(schema.folders).where(
    body.parentId
      ? and(eq(schema.folders.projectId, projectId), eq(schema.folders.parentId, body.parentId))
      : and(eq(schema.folders.projectId, projectId))
  );
  const maxOrder = siblings.reduce((max, f) => Math.max(max, f.order ?? 0), -1);

  await db.insert(schema.folders).values({
    id,
    projectId,
    parentId: body.parentId || null,
    name: body.name || "New Folder",
    order: maxOrder + 1,
    createdAt: now,
    updatedAt: now,
  });
  const [folder] = await db.select().from(schema.folders).where(eq(schema.folders.id, id));
  return c.json(folder, 201);
});

// Update folder
app.put("/folders/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  await db
    .update(schema.folders)
    .set({ ...body, updatedAt: new Date().toISOString() })
    .where(eq(schema.folders.id, id));
  const [folder] = await db.select().from(schema.folders).where(eq(schema.folders.id, id));
  return c.json(folder);
});

// Delete folder (cascade deletes documents via FK)
app.delete("/folders/:id", async (c) => {
  const id = c.req.param("id");
  await db.delete(schema.folders).where(eq(schema.folders.id, id));
  return c.json({ success: true });
});

// Reorder folders
app.put("/projects/:projectId/folders/reorder", async (c) => {
  const body = await c.req.json();
  const { folderIds } = body;
  const now = new Date().toISOString();
  for (let i = 0; i < folderIds.length; i++) {
    await db.update(schema.folders).set({ order: i, updatedAt: now }).where(eq(schema.folders.id, folderIds[i]));
  }
  return c.json({ success: true });
});

export default app;
