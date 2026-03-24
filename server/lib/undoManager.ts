import { db, schema } from "../db/client";
import { eq, and, desc, asc } from "drizzle-orm";
import { newId } from "./nanoid";

interface EntitySnapshot {
  table: "folders" | "documents";
  id: string;
  row: Record<string, unknown> | null; // null = deletion
}

export function generateGroupId(): string {
  return newId();
}

export async function recordEvent(input: {
  projectId: string;
  batchId: string;
  sequence: number;
  entityType: string;
  entityId: string;
  action: "create" | "update" | "delete";
  beforeJson?: string;
  afterJson?: string;
  source?: string;
  description?: string;
}): Promise<string> {
  const id = newId();
  await db.insert(schema.events).values({
    id,
    projectId: input.projectId,
    batchId: input.batchId,
    sequence: input.sequence,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    beforeJson: input.beforeJson || null,
    afterJson: input.afterJson || null,
    source: input.source || "chat",
    description: input.description || "",
    undone: 0,
    createdAt: new Date().toISOString(),
  });
  return id;
}

const tableMap = {
  folders: schema.folders,
  documents: schema.documents,
} as const;

async function applySnapshot(entityType: string, entityId: string, json: string | null): Promise<void> {
  const table = tableMap[entityType as keyof typeof tableMap];
  if (!table) return;

  const data = json ? JSON.parse(json) : null;
  const [existing] = await db.select().from(table).where(eq(table.id, entityId));

  if (!data) {
    // Delete
    if (existing) {
      await db.delete(table).where(eq(table.id, entityId));
    }
  } else if (existing) {
    // Update
    await db.update(table).set(data).where(eq(table.id, entityId));
  } else {
    // Insert
    await db.insert(table).values({ ...data, id: entityId });
  }
}

export async function undo(projectId: string): Promise<{ success: boolean; label?: string; canUndo: boolean; canRedo: boolean }> {
  // Find latest non-undone batch
  const [latestEvent] = await db
    .select()
    .from(schema.events)
    .where(and(eq(schema.events.projectId, projectId), eq(schema.events.undone, 0)))
    .orderBy(desc(schema.events.createdAt))
    .limit(1);

  if (!latestEvent) return { success: false, canUndo: false, canRedo: false };

  const batchId = latestEvent.batchId;
  const batchEvents = await db
    .select()
    .from(schema.events)
    .where(and(eq(schema.events.batchId, batchId), eq(schema.events.undone, 0)))
    .orderBy(desc(schema.events.sequence));

  for (const event of batchEvents) {
    await applySnapshot(event.entityType, event.entityId, event.beforeJson);
    await db.update(schema.events).set({ undone: 1 }).where(eq(schema.events.id, event.id));
  }

  const state = await getUndoState(projectId);
  return { success: true, label: latestEvent.description || "Undo", ...state };
}

export async function redo(projectId: string): Promise<{ success: boolean; label?: string; canUndo: boolean; canRedo: boolean }> {
  const [oldestUndone] = await db
    .select()
    .from(schema.events)
    .where(and(eq(schema.events.projectId, projectId), eq(schema.events.undone, 1)))
    .orderBy(asc(schema.events.createdAt))
    .limit(1);

  if (!oldestUndone) return { success: false, canUndo: false, canRedo: false };

  const batchId = oldestUndone.batchId;
  const batchEvents = await db
    .select()
    .from(schema.events)
    .where(and(eq(schema.events.batchId, batchId), eq(schema.events.undone, 1)))
    .orderBy(asc(schema.events.sequence));

  for (const event of batchEvents) {
    await applySnapshot(event.entityType, event.entityId, event.afterJson);
    await db.update(schema.events).set({ undone: 0 }).where(eq(schema.events.id, event.id));
  }

  const state = await getUndoState(projectId);
  return { success: true, label: oldestUndone.description || "Redo", ...state };
}

async function getUndoState(projectId: string): Promise<{ canUndo: boolean; canRedo: boolean }> {
  const [undoable] = await db
    .select()
    .from(schema.events)
    .where(and(eq(schema.events.projectId, projectId), eq(schema.events.undone, 0)))
    .limit(1);
  const [redoable] = await db
    .select()
    .from(schema.events)
    .where(and(eq(schema.events.projectId, projectId), eq(schema.events.undone, 1)))
    .limit(1);
  return { canUndo: !!undoable, canRedo: !!redoable };
}

export async function getHistory(projectId: string): Promise<{ canUndo: boolean; canRedo: boolean }> {
  return getUndoState(projectId);
}
