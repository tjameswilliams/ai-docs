import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { createTestProject, createTestDocument, clearEvents, db, schema, eq } from "../../../__tests__/testHelper";
import { executeDocumentTool } from "../documents";
import { generateGroupId, getHistory } from "../../undoManager";

let projectId: string;

beforeAll(async () => {
  projectId = await createTestProject("Doc Tools Test");
});

afterEach(async () => {
  await clearEvents(projectId);
});

describe("create_document", () => {
  test("creates a document with title and content", async () => {
    const result = await executeDocumentTool("create_document", {
      title: "My Doc", content: "Hello world",
    }, projectId);
    expect(result.success).toBe(true);
    const doc = (result.result as any).document;
    expect(doc.title).toBe("My Doc");
    expect(doc.content).toBe("Hello world");
    expect(doc.wordCount).toBe(2);
    // Cleanup
    await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));
  });

  test("records undo event when undoContext provided", async () => {
    const groupId = generateGroupId();
    const result = await executeDocumentTool("create_document", {
      title: "Undo Doc",
    }, projectId, { groupId, seq: 0 });
    expect(result.success).toBe(true);

    const state = await getHistory(projectId);
    expect(state.canUndo).toBe(true);

    // Cleanup
    const doc = (result.result as any).document;
    await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));
  });
});

describe("update_document", () => {
  test("updates document title", async () => {
    const doc = await createTestDocument(projectId, { title: "Before" });
    const result = await executeDocumentTool("update_document", {
      document_id: doc.id, title: "After",
    }, projectId);
    expect(result.success).toBe(true);
    expect((result.result as any).document.title).toBe("After");
    await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));
  });
});

describe("update_document_content", () => {
  test("replaces content", async () => {
    const doc = await createTestDocument(projectId, { content: "old" });
    const result = await executeDocumentTool("update_document_content", {
      document_id: doc.id, content: "new content",
    }, projectId);
    expect(result.success).toBe(true);
    const [updated] = await db.select().from(schema.documents).where(eq(schema.documents.id, doc.id));
    expect(updated.content).toBe("new content");
    await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));
  });

  test("appends content", async () => {
    const doc = await createTestDocument(projectId, { content: "line1" });
    await executeDocumentTool("update_document_content", {
      document_id: doc.id, content: "line2", mode: "append",
    }, projectId);
    const [updated] = await db.select().from(schema.documents).where(eq(schema.documents.id, doc.id));
    expect(updated.content).toBe("line1\nline2");
    await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));
  });
});

describe("patch_document", () => {
  test("find_replace works", async () => {
    const doc = await createTestDocument(projectId, { content: "Hello world" });
    const result = await executeDocumentTool("patch_document", {
      document_id: doc.id,
      operations: [{ op: "find_replace", old_text: "world", new_text: "earth" }],
    }, projectId);
    expect(result.success).toBe(true);
    const [updated] = await db.select().from(schema.documents).where(eq(schema.documents.id, doc.id));
    expect(updated.content).toBe("Hello earth");
    await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));
  });

  test("insert_after works", async () => {
    const doc = await createTestDocument(projectId, { content: "Hello world" });
    await executeDocumentTool("patch_document", {
      document_id: doc.id,
      operations: [{ op: "insert_after", old_text: "Hello", new_text: " beautiful" }],
    }, projectId);
    const [updated] = await db.select().from(schema.documents).where(eq(schema.documents.id, doc.id));
    expect(updated.content).toBe("Hello beautiful world");
    await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));
  });

  test("delete operation works", async () => {
    const doc = await createTestDocument(projectId, { content: "Hello cruel world" });
    await executeDocumentTool("patch_document", {
      document_id: doc.id,
      operations: [{ op: "delete", old_text: " cruel" }],
    }, projectId);
    const [updated] = await db.select().from(schema.documents).where(eq(schema.documents.id, doc.id));
    expect(updated.content).toBe("Hello world");
    await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));
  });

  test("returns failure when old_text not found", async () => {
    const doc = await createTestDocument(projectId, { content: "Hello" });
    const result = await executeDocumentTool("patch_document", {
      document_id: doc.id,
      operations: [{ op: "find_replace", old_text: "MISSING", new_text: "x" }],
    }, projectId);
    expect(result.success).toBe(false);
    await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));
  });

  test("records undo event for patches", async () => {
    const doc = await createTestDocument(projectId, { content: "abc" });
    const groupId = generateGroupId();
    await executeDocumentTool("patch_document", {
      document_id: doc.id,
      operations: [{ op: "find_replace", old_text: "abc", new_text: "xyz" }],
    }, projectId, { groupId, seq: 0 });

    const state = await getHistory(projectId);
    expect(state.canUndo).toBe(true);
    await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));
  });
});

describe("delete_document", () => {
  test("deletes a document", async () => {
    const doc = await createTestDocument(projectId, { title: "Delete Me" });
    const result = await executeDocumentTool("delete_document", {
      document_id: doc.id,
    }, projectId);
    expect(result.success).toBe(true);
    const remaining = await db.select().from(schema.documents).where(eq(schema.documents.id, doc.id));
    expect(remaining.length).toBe(0);
  });
});

describe("move_document", () => {
  test("moves document to null folder (root)", async () => {
    const doc = await createTestDocument(projectId);
    await executeDocumentTool("move_document", {
      document_id: doc.id, folder_id: "",
    }, projectId);
    const [updated] = await db.select().from(schema.documents).where(eq(schema.documents.id, doc.id));
    expect(updated.folderId).toBeNull();
    await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));
  });
});

describe("get_document / get_document_content", () => {
  test("returns document metadata", async () => {
    const doc = await createTestDocument(projectId, { title: "Readable" });
    const result = await executeDocumentTool("get_document", { document_id: doc.id }, projectId);
    expect(result.success).toBe(true);
    expect((result.result as any).document.title).toBe("Readable");
    await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));
  });

  test("returns not found for missing doc", async () => {
    const result = await executeDocumentTool("get_document", { document_id: "nonexistent" }, projectId);
    expect(result.success).toBe(false);
  });
});
