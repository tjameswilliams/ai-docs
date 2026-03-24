import { Hono } from "hono";
import { db, schema } from "../db/client";
import { eq } from "drizzle-orm";
import { newId } from "../lib/nanoid";

const app = new Hono();

app.get("/", async (c) => {
  const rows = await db.select().from(schema.projects);
  return c.json(rows);
});

app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const rows = await db.select().from(schema.projects).where(eq(schema.projects.id, id));
  if (rows.length === 0) return c.json({ error: "Not found" }, 404);
  return c.json(rows[0]);
});

app.post("/", async (c) => {
  const body = await c.req.json();
  const id = newId();
  const now = new Date().toISOString();
  await db.insert(schema.projects).values({
    id,
    name: body.name || "Untitled Project",
    description: body.description || "",
    createdAt: now,
    updatedAt: now,
  });
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, id));
  return c.json(project, 201);
});

app.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  await db
    .update(schema.projects)
    .set({ ...body, updatedAt: new Date().toISOString() })
    .where(eq(schema.projects.id, id));
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, id));
  return c.json(project);
});

app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await db.delete(schema.projects).where(eq(schema.projects.id, id));
  return c.json({ success: true });
});

export default app;
