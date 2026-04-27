import { describe, test, expect, beforeAll } from "bun:test";
import { createTestProject, createTestDocument, db, schema, eq } from "../../../__tests__/testHelper";
import { executeReferenceTool } from "../references";
import { executeFolderTool } from "../folders";

let projectId: string;
let otherProjectId: string;

beforeAll(async () => {
  projectId = await createTestProject("Ref Project A");
  otherProjectId = await createTestProject("Ref Project B");
});

describe("list_projects", () => {
  test("returns all projects with isCurrent flag", async () => {
    const result = await executeReferenceTool("list_projects", {}, projectId);
    expect(result.success).toBe(true);
    const projects = (result.result as any).projects;
    expect(projects.length).toBeGreaterThanOrEqual(2);
    const current = projects.find((p: any) => p.id === projectId);
    expect(current.isCurrent).toBe(true);
    const other = projects.find((p: any) => p.id === otherProjectId);
    expect(other.isCurrent).toBe(false);
  });
});

describe("get_project_documents", () => {
  test("lists documents for current project by default", async () => {
    const doc = await createTestDocument(projectId, { title: "RefDoc1", content: "hello world" });
    const result = await executeReferenceTool("get_project_documents", {}, projectId);
    expect(result.success).toBe(true);
    const data = result.result as any;
    expect(data.project.id).toBe(projectId);
    expect(data.documents.some((d: any) => d.id === doc.id)).toBe(true);
    expect(data.totalWords).toBeGreaterThanOrEqual(2);
    await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));
  });

  test("lists documents by project_id", async () => {
    const doc = await createTestDocument(otherProjectId, { title: "OtherDoc" });
    const result = await executeReferenceTool("get_project_documents", { project_id: otherProjectId }, projectId);
    expect(result.success).toBe(true);
    expect((result.result as any).project.id).toBe(otherProjectId);
    expect((result.result as any).documents.some((d: any) => d.id === doc.id)).toBe(true);
    await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));
  });

  test("finds project by name", async () => {
    // Use a unique project name to avoid collisions from prior test runs
    const uniqueName = `RefNameLookup_${Date.now()}`;
    const uniqueId = await createTestProject(uniqueName);
    const result = await executeReferenceTool("get_project_documents", { project_name: uniqueName }, projectId);
    expect(result.success).toBe(true);
    expect((result.result as any).project.id).toBe(uniqueId);
  });

  test("returns failure for unknown project name", async () => {
    const result = await executeReferenceTool("get_project_documents", { project_name: "Nonexistent XYZ" }, projectId);
    expect(result.success).toBe(false);
  });

  test("returns failure for unknown project id", async () => {
    const result = await executeReferenceTool("get_project_documents", { project_id: "nope" }, projectId);
    expect(result.success).toBe(false);
  });

  test("includes folder names in document list", async () => {
    const folderResult = await executeFolderTool("create_folder", { name: "RefFolder" }, projectId);
    const folderId = (folderResult.result as any).folder.id;
    const doc = await createTestDocument(projectId, { title: "InFolder", folderId });
    const result = await executeReferenceTool("get_project_documents", {}, projectId);
    const docEntry = (result.result as any).documents.find((d: any) => d.id === doc.id);
    expect(docEntry.folder).toBe("RefFolder");
    await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));
    await db.delete(schema.folders).where(eq(schema.folders.id, folderId));
  });
});

describe("read_reference_document", () => {
  test("reads a document by id", async () => {
    const doc = await createTestDocument(projectId, { title: "Readable Ref", content: "some content" });
    const result = await executeReferenceTool("read_reference_document", { document_id: doc.id }, projectId);
    expect(result.success).toBe(true);
    const data = result.result as any;
    expect(data.title).toBe("Readable Ref");
    expect(data.content).toBe("some content");
    expect(data.projectName).toBe("Ref Project A");
    await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));
  });

  test("returns failure for missing document", async () => {
    const result = await executeReferenceTool("read_reference_document", { document_id: "nonexistent" }, projectId);
    expect(result.success).toBe(false);
  });
});

describe("search_all_documents", () => {
  test("finds documents matching query across projects", async () => {
    const doc1 = await createTestDocument(projectId, { title: "Alpha Search Target", content: "unique_keyword here" });
    const doc2 = await createTestDocument(otherProjectId, { title: "Beta", content: "has unique_keyword too" });

    const result = await executeReferenceTool("search_all_documents", { query: "unique_keyword" }, projectId);
    expect(result.success).toBe(true);
    const data = result.result as any;
    expect(data.resultCount).toBeGreaterThanOrEqual(2);
    const ids = data.results.map((r: any) => r.documentId);
    expect(ids).toContain(doc1.id);
    expect(ids).toContain(doc2.id);

    await db.delete(schema.documents).where(eq(schema.documents.id, doc1.id));
    await db.delete(schema.documents).where(eq(schema.documents.id, doc2.id));
  });

  test("title matches score higher than content-only matches", async () => {
    const titleMatch = await createTestDocument(projectId, { title: "findme_term", content: "nothing" });
    const contentMatch = await createTestDocument(projectId, { title: "Other", content: "findme_term" });

    const result = await executeReferenceTool("search_all_documents", { query: "findme_term" }, projectId);
    const results = (result.result as any).results;
    const titleIdx = results.findIndex((r: any) => r.documentId === titleMatch.id);
    const contentIdx = results.findIndex((r: any) => r.documentId === contentMatch.id);
    expect(titleIdx).toBeLessThan(contentIdx);

    await db.delete(schema.documents).where(eq(schema.documents.id, titleMatch.id));
    await db.delete(schema.documents).where(eq(schema.documents.id, contentMatch.id));
  });

  test("respects max_results", async () => {
    const docs = [];
    for (let i = 0; i < 5; i++) {
      docs.push(await createTestDocument(projectId, { title: `limitdoc_${i}`, content: "limitquery_xyz" }));
    }
    const result = await executeReferenceTool("search_all_documents", { query: "limitquery_xyz", max_results: 2 }, projectId);
    expect((result.result as any).resultCount).toBe(2);
    for (const doc of docs) {
      await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));
    }
  });

  test("filters by project_name", async () => {
    const doc = await createTestDocument(otherProjectId, { title: "ProjFilter", content: "projfilter_kw" });
    const result = await executeReferenceTool("search_all_documents", { query: "projfilter_kw", project_name: "Ref Project B" }, projectId);
    expect(result.success).toBe(true);
    const ids = (result.result as any).results.map((r: any) => r.documentId);
    expect(ids).toContain(doc.id);
    await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));
  });
});

describe("read_multiple_documents", () => {
  test("reads multiple documents at once", async () => {
    const doc1 = await createTestDocument(projectId, { title: "Multi1", content: "content one" });
    const doc2 = await createTestDocument(projectId, { title: "Multi2", content: "content two" });

    const result = await executeReferenceTool("read_multiple_documents", {
      document_ids: [doc1.id, doc2.id],
    }, projectId);
    expect(result.success).toBe(true);
    const data = result.result as any;
    expect(data.documentsRead).toBe(2);
    expect(data.documentsRequested).toBe(2);

    await db.delete(schema.documents).where(eq(schema.documents.id, doc1.id));
    await db.delete(schema.documents).where(eq(schema.documents.id, doc2.id));
  });

  test("skips missing documents", async () => {
    const doc = await createTestDocument(projectId, { title: "Exists", content: "yes" });
    const result = await executeReferenceTool("read_multiple_documents", {
      document_ids: [doc.id, "nonexistent"],
    }, projectId);
    expect(result.success).toBe(true);
    const data = result.result as any;
    expect(data.documentsRead).toBe(1);
    expect(data.documentsRequested).toBe(2);
    await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));
  });

  test("truncates content at max_length", async () => {
    const longContent = "x".repeat(500);
    const doc = await createTestDocument(projectId, { title: "Long", content: longContent });
    const result = await executeReferenceTool("read_multiple_documents", {
      document_ids: [doc.id],
      max_length: 100,
    }, projectId);
    const docResult = (result.result as any).documents[0];
    expect(docResult.content.length).toBeLessThan(longContent.length);
    expect(docResult.content).toContain("[Truncated");
    await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));
  });
});

describe("unknown tool", () => {
  test("returns failure for unknown tool name", async () => {
    const result = await executeReferenceTool("nonexistent_tool", {}, projectId);
    expect(result.success).toBe(false);
  });
});
