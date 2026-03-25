import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { createTestProject, clearEvents, db, schema, eq } from "../../../__tests__/testHelper";
import { executeFolderTool } from "../folders";
import { generateGroupId, getHistory } from "../../undoManager";

let projectId: string;

beforeAll(async () => {
  projectId = await createTestProject("Folder Tools Test");
});

afterEach(async () => {
  await clearEvents(projectId);
});

describe("create_folder", () => {
  test("creates a folder", async () => {
    const result = await executeFolderTool("create_folder", { name: "My Folder" }, projectId);
    expect(result.success).toBe(true);
    const folder = (result.result as any).folder;
    expect(folder.name).toBe("My Folder");
    expect(folder.projectId).toBe(projectId);
    await db.delete(schema.folders).where(eq(schema.folders.id, folder.id));
  });

  test("records undo event", async () => {
    const groupId = generateGroupId();
    const result = await executeFolderTool("create_folder", { name: "Undo Folder" }, projectId, { groupId, seq: 0 });
    const state = await getHistory(projectId);
    expect(state.canUndo).toBe(true);
    await db.delete(schema.folders).where(eq(schema.folders.id, (result.result as any).folder.id));
  });
});

describe("rename_folder", () => {
  test("renames a folder", async () => {
    const create = await executeFolderTool("create_folder", { name: "Before" }, projectId);
    const folderId = (create.result as any).folder.id;

    const result = await executeFolderTool("rename_folder", { folder_id: folderId, name: "After" }, projectId);
    expect(result.success).toBe(true);
    expect((result.result as any).folder.name).toBe("After");
    await db.delete(schema.folders).where(eq(schema.folders.id, folderId));
  });
});

describe("delete_folder", () => {
  test("deletes a folder", async () => {
    const create = await executeFolderTool("create_folder", { name: "Delete Me" }, projectId);
    const folderId = (create.result as any).folder.id;

    const result = await executeFolderTool("delete_folder", { folder_id: folderId }, projectId);
    expect(result.success).toBe(true);
    const remaining = await db.select().from(schema.folders).where(eq(schema.folders.id, folderId));
    expect(remaining.length).toBe(0);
  });
});

describe("move_folder", () => {
  test("moves folder to new parent", async () => {
    const parent = await executeFolderTool("create_folder", { name: "Parent" }, projectId);
    const child = await executeFolderTool("create_folder", { name: "Child" }, projectId);
    const parentId = (parent.result as any).folder.id;
    const childId = (child.result as any).folder.id;

    await executeFolderTool("move_folder", { folder_id: childId, parent_id: parentId }, projectId);
    const [updated] = await db.select().from(schema.folders).where(eq(schema.folders.id, childId));
    expect(updated.parentId).toBe(parentId);

    await db.delete(schema.folders).where(eq(schema.folders.id, childId));
    await db.delete(schema.folders).where(eq(schema.folders.id, parentId));
  });
});

describe("list_folders", () => {
  test("lists all folders in project", async () => {
    const create = await executeFolderTool("create_folder", { name: "Listed" }, projectId);
    const folderId = (create.result as any).folder.id;

    const result = await executeFolderTool("list_folders", {}, projectId);
    expect(result.success).toBe(true);
    const folders = (result.result as any).folders;
    expect(folders.some((f: any) => f.id === folderId)).toBe(true);

    await db.delete(schema.folders).where(eq(schema.folders.id, folderId));
  });
});
