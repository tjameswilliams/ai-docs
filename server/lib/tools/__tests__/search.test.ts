import { describe, test, expect, beforeAll } from "bun:test";
import { createTestProject, createTestDocument, db, schema, eq } from "../../../__tests__/testHelper";
import { executeSearchTool } from "../search";
import { executeFolderTool } from "../folders";

let projectId: string;

beforeAll(async () => {
  projectId = await createTestProject("Search Tools Test");
});

describe("search_documents_text", () => {
  test("finds documents matching text query", async () => {
    const doc = await createTestDocument(projectId, {
      title: "Searchable",
      content: "The quick brown fox jumps over the lazy dog",
    });

    const result = await executeSearchTool("search_documents_text", { query: "brown fox" }, projectId);
    expect(result.success).toBe(true);
    const data = result.result as any;
    expect(data.documents.length).toBeGreaterThanOrEqual(1);
    expect(data.documents.some((d: any) => d.documentId === doc.id)).toBe(true);

    await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));
  });

  test("search is case-insensitive", async () => {
    const doc = await createTestDocument(projectId, {
      title: "CaseTest",
      content: "JavaScript is awesome",
    });

    const result = await executeSearchTool("search_documents_text", { query: "javascript" }, projectId);
    expect(result.success).toBe(true);
    expect((result.result as any).documents.some((d: any) => d.documentId === doc.id)).toBe(true);

    await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));
  });

  test("returns line numbers and match text", async () => {
    const doc = await createTestDocument(projectId, {
      title: "LineTest",
      content: "line one\nline two match_here\nline three",
    });

    const result = await executeSearchTool("search_documents_text", { query: "match_here" }, projectId);
    const matches = (result.result as any).documents.find((d: any) => d.documentId === doc.id)?.matches;
    expect(matches).toBeDefined();
    expect(matches[0].line).toBe(2);
    expect(matches[0].text).toContain("match_here");

    await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));
  });

  test("supports regex search", async () => {
    const doc = await createTestDocument(projectId, {
      title: "RegexTest",
      content: "error-123 happened\nerror-456 too",
    });

    const result = await executeSearchTool("search_documents_text", {
      query: "error-\\d+",
      regex: true,
    }, projectId);
    expect(result.success).toBe(true);
    const docResult = (result.result as any).documents.find((d: any) => d.documentId === doc.id);
    expect(docResult).toBeDefined();
    expect(docResult.matches.length).toBe(2);

    await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));
  });

  test("filters by folder_id", async () => {
    const folderResult = await executeFolderTool("create_folder", { name: "SearchFolder" }, projectId);
    const folderId = (folderResult.result as any).folder.id;

    const inFolder = await createTestDocument(projectId, { title: "InFolder", content: "folder_kw", folderId });
    const notInFolder = await createTestDocument(projectId, { title: "NotInFolder", content: "folder_kw" });

    const result = await executeSearchTool("search_documents_text", {
      query: "folder_kw",
      folder_id: folderId,
    }, projectId);

    const ids = (result.result as any).documents.map((d: any) => d.documentId);
    expect(ids).toContain(inFolder.id);
    expect(ids).not.toContain(notInFolder.id);

    await db.delete(schema.documents).where(eq(schema.documents.id, inFolder.id));
    await db.delete(schema.documents).where(eq(schema.documents.id, notInFolder.id));
    await db.delete(schema.folders).where(eq(schema.folders.id, folderId));
  });

  test("returns empty results when no match", async () => {
    const result = await executeSearchTool("search_documents_text", {
      query: "zzznonexistent_search_term_zzz",
    }, projectId);
    expect(result.success).toBe(true);
    expect((result.result as any).documents.length).toBe(0);
    expect((result.result as any).totalMatches).toBe(0);
  });

  test("caps matches at 20 per document", async () => {
    const lines = Array.from({ length: 30 }, (_, i) => `repeat_term line ${i}`).join("\n");
    const doc = await createTestDocument(projectId, { title: "ManyMatches", content: lines });

    const result = await executeSearchTool("search_documents_text", { query: "repeat_term" }, projectId);
    const docResult = (result.result as any).documents.find((d: any) => d.documentId === doc.id);
    expect(docResult.matches.length).toBeLessThanOrEqual(20);

    await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));
  });
});

describe("search_documents (semantic)", () => {
  test("falls back to text search when embeddings unavailable", async () => {
    const doc = await createTestDocument(projectId, {
      title: "SemanticFallback",
      content: "semantic_fallback_term here",
    });

    const result = await executeSearchTool("search_documents", { query: "semantic_fallback_term" }, projectId);
    expect(result.success).toBe(true);

    await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));
  });
});

describe("unknown tool", () => {
  test("returns failure for unknown tool name", async () => {
    const result = await executeSearchTool("nonexistent", {}, projectId);
    expect(result.success).toBe(false);
  });
});
