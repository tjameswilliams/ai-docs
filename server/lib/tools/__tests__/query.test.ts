import { describe, test, expect, beforeAll } from "bun:test";
import { createTestProject, createTestDocument, db, schema, eq } from "../../../__tests__/testHelper";
import { executeQueryTool } from "../query";
import { executeFolderTool } from "../folders";

let projectId: string;

beforeAll(async () => {
  projectId = await createTestProject("Query Tools Test");
});

describe("query_database", () => {
  test("executes SELECT queries", async () => {
    const result = await executeQueryTool("query_database", {
      sql: "SELECT id, name FROM projects LIMIT 5",
    }, projectId);
    expect(result.success).toBe(true);
    const data = result.result as any;
    expect(data.rows.length).toBeGreaterThanOrEqual(1);
    expect(data.count).toBeGreaterThanOrEqual(1);
  });

  test("rejects non-SELECT queries", async () => {
    const result = await executeQueryTool("query_database", {
      sql: "DELETE FROM projects WHERE id = 'x'",
    }, projectId);
    expect(result.success).toBe(false);
    expect(result.result).toContain("Only SELECT");
  });

  test("rejects INSERT queries", async () => {
    const result = await executeQueryTool("query_database", {
      sql: "INSERT INTO projects (id, name) VALUES ('x', 'y')",
    }, projectId);
    expect(result.success).toBe(false);
  });

  test("returns error for invalid SQL", async () => {
    const result = await executeQueryTool("query_database", {
      sql: "SELECT * FROM nonexistent_table_xyz",
    }, projectId);
    expect(result.success).toBe(false);
    expect(result.result as string).toContain("SQL error");
  });

  test("handles case-insensitive SELECT", async () => {
    const result = await executeQueryTool("query_database", {
      sql: "select count(*) as cnt from projects",
    }, projectId);
    expect(result.success).toBe(true);
  });
});

describe("get_project_status", () => {
  test("returns project overview with stats", async () => {
    const doc = await createTestDocument(projectId, { title: "StatusDoc", content: "word1 word2 word3" });
    const result = await executeQueryTool("get_project_status", {}, projectId);
    expect(result.success).toBe(true);
    const data = result.result as any;
    expect(data.project.name).toBe("Query Tools Test");
    expect(data.stats.documentCount).toBeGreaterThanOrEqual(1);
    expect(data.stats.totalWords).toBeGreaterThanOrEqual(3);
    await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));
  });

  test("returns tree structure with folders and documents", async () => {
    const folderResult = await executeFolderTool("create_folder", { name: "TreeFolder" }, projectId);
    const folderId = (folderResult.result as any).folder.id;
    const doc = await createTestDocument(projectId, { title: "TreeDoc", folderId });

    const result = await executeQueryTool("get_project_status", {}, projectId);
    const tree = (result.result as any).tree;
    const folder = tree.find((n: any) => n.type === "folder" && n.id === folderId);
    expect(folder).toBeDefined();
    expect(folder.name).toBe("TreeFolder");
    expect(folder.children.some((c: any) => c.id === doc.id)).toBe(true);

    await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));
    await db.delete(schema.folders).where(eq(schema.folders.id, folderId));
  });

  test("uses explicit project_id when provided", async () => {
    const otherId = await createTestProject("Other Query Project");
    const result = await executeQueryTool("get_project_status", { project_id: otherId }, projectId);
    expect(result.success).toBe(true);
    expect((result.result as any).project.name).toBe("Other Query Project");
  });

  test("returns failure for nonexistent project", async () => {
    const result = await executeQueryTool("get_project_status", { project_id: "nope" }, projectId);
    expect(result.success).toBe(false);
  });
});

describe("unknown tool", () => {
  test("returns failure for unknown tool name", async () => {
    const result = await executeQueryTool("nonexistent", {}, projectId);
    expect(result.success).toBe(false);
  });
});
