import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { createTestProject, clearEvents, db, schema, eq } from "../../__tests__/testHelper";
import { generateGroupId, recordEvent, undo, redo, getHistory } from "../undoManager";
import { newId } from "../nanoid";

let projectId: string;

beforeAll(async () => {
  projectId = await createTestProject("Undo Test");
});

afterEach(async () => {
  await clearEvents(projectId);
});

describe("generateGroupId", () => {
  test("returns unique IDs", () => {
    const a = generateGroupId();
    const b = generateGroupId();
    expect(a).not.toBe(b);
    expect(typeof a).toBe("string");
    expect(a.length).toBeGreaterThan(5);
  });
});

describe("recordEvent", () => {
  test("stores an event in the database", async () => {
    const batchId = generateGroupId();
    const id = await recordEvent({
      projectId,
      batchId,
      sequence: 0,
      entityType: "documents",
      entityId: "doc-1",
      action: "create",
      afterJson: JSON.stringify({ id: "doc-1", title: "Test" }),
      description: "Created doc",
    });

    expect(typeof id).toBe("string");
    const [event] = await db.select().from(schema.events).where(eq(schema.events.id, id));
    expect(event).toBeTruthy();
    expect(event.batchId).toBe(batchId);
    expect(event.entityType).toBe("documents");
    expect(event.action).toBe("create");
    expect(event.undone).toBe(0);
  });
});

describe("undo / redo", () => {
  test("undo reverses a create by deleting the entity", async () => {
    // Create a document
    const docId = newId();
    const now = new Date().toISOString();
    await db.insert(schema.documents).values({
      id: docId, projectId, title: "Undo Me", content: "", order: 0, wordCount: 0,
      createdAt: now, updatedAt: now, folderId: null,
    });
    const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, docId));

    // Record the create event
    const batchId = generateGroupId();
    await recordEvent({
      projectId, batchId, sequence: 0, entityType: "documents", entityId: docId,
      action: "create", beforeJson: undefined, afterJson: JSON.stringify(doc),
      description: "Created",
    });

    // Undo
    const result = await undo(projectId);
    expect(result.success).toBe(true);
    expect(result.canRedo).toBe(true);

    // Document should be gone
    const docs = await db.select().from(schema.documents).where(eq(schema.documents.id, docId));
    expect(docs.length).toBe(0);
  });

  test("redo restores after undo", async () => {
    const docId = newId();
    const now = new Date().toISOString();
    const docData = {
      id: docId, projectId, title: "Redo Me", content: "hello", order: 0, wordCount: 1,
      createdAt: now, updatedAt: now, folderId: null,
    };
    await db.insert(schema.documents).values(docData);

    const batchId = generateGroupId();
    await recordEvent({
      projectId, batchId, sequence: 0, entityType: "documents", entityId: docId,
      action: "create", afterJson: JSON.stringify(docData), description: "Created",
    });

    await undo(projectId);
    const result = await redo(projectId);
    expect(result.success).toBe(true);

    const [restored] = await db.select().from(schema.documents).where(eq(schema.documents.id, docId));
    expect(restored).toBeTruthy();
    expect(restored.title).toBe("Redo Me");

    // Cleanup
    await db.delete(schema.documents).where(eq(schema.documents.id, docId));
  });

  test("undo groups multiple events in a batch", async () => {
    const docId1 = newId();
    const docId2 = newId();
    const now = new Date().toISOString();
    for (const id of [docId1, docId2]) {
      await db.insert(schema.documents).values({
        id, projectId, title: `Batch ${id}`, content: "", order: 0, wordCount: 0,
        createdAt: now, updatedAt: now, folderId: null,
      });
    }

    const batchId = generateGroupId();
    for (const [i, id] of [docId1, docId2].entries()) {
      const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, id));
      await recordEvent({
        projectId, batchId, sequence: i, entityType: "documents", entityId: id,
        action: "create", afterJson: JSON.stringify(doc), description: "Batch create",
      });
    }

    // Single undo should reverse both
    await undo(projectId);
    const remaining = await db.select().from(schema.documents).where(eq(schema.documents.projectId, projectId));
    const batchDocs = remaining.filter(d => d.id === docId1 || d.id === docId2);
    expect(batchDocs.length).toBe(0);
  });

  test("getHistory returns correct state", async () => {
    const state1 = await getHistory(projectId);
    expect(state1.canUndo).toBe(false);
    expect(state1.canRedo).toBe(false);

    const batchId = generateGroupId();
    await recordEvent({
      projectId, batchId, sequence: 0, entityType: "documents", entityId: "x",
      action: "update", beforeJson: "{}", afterJson: "{}", description: "test",
    });

    const state2 = await getHistory(projectId);
    expect(state2.canUndo).toBe(true);
    expect(state2.canRedo).toBe(false);
  });

  test("undo with nothing to undo returns success false", async () => {
    const result = await undo(projectId);
    expect(result.success).toBe(false);
  });

  test("redo with nothing to redo returns success false", async () => {
    const result = await redo(projectId);
    expect(result.success).toBe(false);
  });
});
