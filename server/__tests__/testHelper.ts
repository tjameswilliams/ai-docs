/**
 * Test helper: provides access to the db and utilities for creating test data.
 * The db uses the project's normal init path (temp data.db in project root).
 */
import { db, schema } from "../db/client";
import { eq } from "drizzle-orm";
import { newId } from "../lib/nanoid";

export { db, schema, eq, newId };

/** Create a test project and return its ID */
export async function createTestProject(name = "Test Project"): Promise<string> {
  const id = newId();
  const now = new Date().toISOString();
  await db.insert(schema.projects).values({ id, name, createdAt: now, updatedAt: now });
  return id;
}

/** Create a test document and return it */
export async function createTestDocument(
  projectId: string,
  opts: { title?: string; content?: string; folderId?: string } = {}
) {
  const id = newId();
  const now = new Date().toISOString();
  const content = opts.content || "";
  await db.insert(schema.documents).values({
    id,
    projectId,
    folderId: opts.folderId || null,
    title: opts.title || "Test Document",
    content,
    order: 0,
    wordCount: content.split(/\s+/).filter(Boolean).length,
    createdAt: now,
    updatedAt: now,
  });
  return (await db.select().from(schema.documents).where(eq(schema.documents.id, id)))[0];
}

/** Clean up test events */
export async function clearEvents(projectId: string) {
  await db.delete(schema.events).where(eq(schema.events.projectId, projectId));
}
