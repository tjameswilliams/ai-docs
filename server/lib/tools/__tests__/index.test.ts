import { describe, test, expect, beforeAll } from "bun:test";
import { createTestProject, createTestDocument, db, schema, eq } from "../../../__tests__/testHelper";
import { getToolDefinitions, getToolNames, executeToolCall } from "../index";

let projectId: string;

beforeAll(async () => {
  projectId = await createTestProject("Tool Index Test");
});

describe("getToolDefinitions", () => {
  test("returns array of tool definitions", () => {
    const defs = getToolDefinitions();
    expect(Array.isArray(defs)).toBe(true);
    expect(defs.length).toBeGreaterThan(10);
    // Each definition should have the expected shape
    for (const def of defs) {
      expect(def.type).toBe("function");
      expect(def.function.name).toBeTruthy();
      expect(def.function.description).toBeTruthy();
    }
  });

  test("includes tools from all modules", () => {
    const names = getToolDefinitions().map((d) => d.function.name);
    // Spot-check one tool from each module
    expect(names).toContain("create_folder");
    expect(names).toContain("create_document");
    expect(names).toContain("search_documents_text");
    expect(names).toContain("query_database");
    expect(names).toContain("web_search");
    expect(names).toContain("list_projects");
    expect(names).toContain("create_plan");
  });
});

describe("getToolNames", () => {
  test("returns array of tool name strings", () => {
    const names = getToolNames();
    expect(Array.isArray(names)).toBe(true);
    expect(names.length).toBeGreaterThan(10);
    expect(names.every((n) => typeof n === "string")).toBe(true);
  });
});

describe("executeToolCall", () => {
  test("routes to document tools", async () => {
    const result = await executeToolCall("create_document", {
      title: "Routed Doc",
      content: "test",
    }, projectId);
    expect(result.success).toBe(true);
    const doc = (result.result as any).document;
    expect(doc.title).toBe("Routed Doc");
    await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));
  });

  test("routes to folder tools", async () => {
    const result = await executeToolCall("create_folder", {
      name: "Routed Folder",
    }, projectId);
    expect(result.success).toBe(true);
    const folder = (result.result as any).folder;
    expect(folder.name).toBe("Routed Folder");
    await db.delete(schema.folders).where(eq(schema.folders.id, folder.id));
  });

  test("routes to search tools", async () => {
    const result = await executeToolCall("search_documents_text", {
      query: "anything",
    }, projectId);
    expect(result.success).toBe(true);
  });

  test("routes to query tools", async () => {
    const result = await executeToolCall("get_project_status", {}, projectId);
    expect(result.success).toBe(true);
  });

  test("routes to reference tools", async () => {
    const result = await executeToolCall("list_projects", {}, projectId);
    expect(result.success).toBe(true);
  });

  test("routes to plan tools", async () => {
    const result = await executeToolCall("get_plan", {}, projectId);
    expect(result.success).toBe(true);
  });

  test("returns failure for unknown tool", async () => {
    const result = await executeToolCall("totally_fake_tool", {}, projectId);
    expect(result.success).toBe(false);
    expect(result.result as string).toContain("Unknown tool");
  });

  test("catches and returns errors gracefully", async () => {
    // Force an error by passing invalid SQL to query_database
    const result = await executeToolCall("query_database", {
      sql: "SELECT * FROM nonexistent_xyz",
    }, projectId);
    expect(result.success).toBe(false);
  });
});
