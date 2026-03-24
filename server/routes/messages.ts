import { Hono } from "hono";
import { db, schema } from "../db/client";
import { eq, gt } from "drizzle-orm";
import { newId } from "../lib/nanoid";

const app = new Hono();

app.get("/projects/:projectId/messages", async (c) => {
  const projectId = c.req.param("projectId");
  const rows = await db
    .select()
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.projectId, projectId));
  return c.json(rows);
});

app.post("/projects/:projectId/messages", async (c) => {
  const projectId = c.req.param("projectId");
  const body = await c.req.json();
  const id = body.id || newId();
  await db.insert(schema.chatMessages).values({
    id,
    projectId,
    role: body.role,
    content: body.content || "",
    thinking: body.thinking || null,
    toolCalls: body.toolCalls ? JSON.stringify(body.toolCalls) : null,
    segments: body.segments ? JSON.stringify(body.segments) : null,
    createdAt: body.createdAt || new Date().toISOString(),
  });
  return c.json({ id }, 201);
});

app.delete("/projects/:projectId/messages", async (c) => {
  const projectId = c.req.param("projectId");
  await db.delete(schema.chatMessages).where(eq(schema.chatMessages.projectId, projectId));
  return c.json({ success: true });
});

app.delete("/projects/:projectId/messages/:messageId/after", async (c) => {
  const projectId = c.req.param("projectId");
  const messageId = c.req.param("messageId");
  // Get the target message's createdAt to delete everything after it
  const [target] = await db.select().from(schema.chatMessages).where(eq(schema.chatMessages.id, messageId));
  if (!target) return c.json({ success: true });

  // Delete messages created after this one (by createdAt)
  const allMessages = await db.select().from(schema.chatMessages).where(eq(schema.chatMessages.projectId, projectId));
  const targetIdx = allMessages.findIndex((m) => m.id === messageId);
  if (targetIdx === -1) return c.json({ success: true });

  const toDelete = allMessages.slice(targetIdx + 1);
  for (const msg of toDelete) {
    await db.delete(schema.chatMessages).where(eq(schema.chatMessages.id, msg.id));
  }
  return c.json({ success: true });
});

export default app;
