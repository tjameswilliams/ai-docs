import { describe, test, expect } from "bun:test";
import { getSystemPrompt } from "../systemPrompt";

describe("getSystemPrompt", () => {
  test("returns base prompt with no context", () => {
    const prompt = getSystemPrompt({});
    expect(prompt).toContain("AI Docs");
    expect(prompt).toContain("document editor");
    expect(prompt).toContain("patch_document");
  });

  test("includes project name", () => {
    const prompt = getSystemPrompt({ projectName: "My Book" });
    expect(prompt).toContain('Current project: "My Book"');
  });

  test("includes folder list", () => {
    const prompt = getSystemPrompt({
      folders: [
        { id: "f1", name: "Chapter 1", parentId: null },
        { id: "f2", name: "Notes", parentId: "f1" },
      ],
    });
    expect(prompt).toContain("Chapter 1 [f1]");
    expect(prompt).toContain("(root)");
    expect(prompt).toContain("Notes [f2]");
    expect(prompt).toContain("(in folder f1)");
  });

  test("includes document list with word counts", () => {
    const prompt = getSystemPrompt({
      documents: [
        { id: "d1", title: "Intro", folderId: null, wordCount: 150 },
        { id: "d2", title: "Chapter", folderId: "f1", wordCount: 3000 },
      ],
    });
    expect(prompt).toContain("Intro [d1]");
    expect(prompt).toContain("150 words");
    expect(prompt).toContain("Chapter [d2]");
    expect(prompt).toContain("3000 words");
  });

  test("includes active document info", () => {
    const prompt = getSystemPrompt({
      activeDocumentId: "d1",
      activeDocumentTitle: "Active Doc",
    });
    expect(prompt).toContain('Currently active document: "Active Doc" [d1]');
  });

  test("includes style guide", () => {
    const prompt = getSystemPrompt({
      styleGuide: "Use short sentences. Prefer active voice.",
    });
    expect(prompt).toContain("Writing Style Guide");
    expect(prompt).toContain("Use short sentences");
    expect(prompt).toContain("Prefer active voice");
  });

  test("includes editor context with selection", () => {
    const prompt = getSystemPrompt({
      editorContext: {
        cursorLine: 5,
        cursorPos: 10,
        selectedText: "selected paragraph",
        beforeCursor: "text before",
        afterCursor: "text after",
        headingPath: ["Chapter 1", "Section A"],
      },
    });
    expect(prompt).toContain("Editor Context");
    expect(prompt).toContain("Section: Chapter 1 > Section A");
    expect(prompt).toContain("Cursor at line 5");
    expect(prompt).toContain("selected paragraph");
    expect(prompt).toContain("text before");
    expect(prompt).toContain("text after");
  });

  test("includes editor context without selection", () => {
    const prompt = getSystemPrompt({
      editorContext: {
        cursorLine: 1,
        cursorPos: 0,
        selectedText: "",
        beforeCursor: "",
        afterCursor: "",
        headingPath: [],
      },
    });
    expect(prompt).toContain("Cursor at line 1");
    expect(prompt).not.toContain("selected_text");
  });

  test("includes active plan context", () => {
    const prompt = getSystemPrompt({
      activePlan: {
        id: "p1",
        title: "Write Book",
        description: "Write the book",
        status: "in_progress",
        steps: [
          {
            id: "s1",
            title: "Outline",
            description: "Write outline",
            status: "completed",
            substeps: [],
          },
          {
            id: "s2",
            title: "Draft",
            description: "Write first draft",
            status: "in_progress",
            substeps: [
              { id: "s2a", title: "Chapter 1", description: null, status: "completed" },
              { id: "s2b", title: "Chapter 2", description: null, status: "pending" },
            ],
          },
        ],
      },
    });
    expect(prompt).toContain("Active Plan");
    expect(prompt).toContain("Write Book");
    expect(prompt).toContain("[x] 1. Outline");
    expect(prompt).toContain("[>] 2. Draft");
    expect(prompt).toContain("Progress: 2/4 steps completed");
    expect(prompt).toContain("Work through the steps sequentially");
    expect(prompt).toContain("MUST");
    expect(prompt).toContain("update_plan_step");
    expect(prompt).toContain("update_plan");
  });

  test("includes draft plan instructions", () => {
    const prompt = getSystemPrompt({
      activePlan: {
        id: "p1",
        title: "Draft Plan",
        description: null,
        status: "draft",
        steps: [{ id: "s1", title: "Step 1", description: null, status: "pending" }],
      },
    });
    expect(prompt).toContain("DRAFT status");
    expect(prompt).toContain("Do NOT start executing");
  });

  test("includes plan mode instructions", () => {
    const prompt = getSystemPrompt({ chatMode: "plan" });
    expect(prompt).toContain("PLAN MODE ACTIVE");
    expect(prompt).toContain("Do NOT execute any document");
  });

  test("does not include plan mode in chat mode", () => {
    const prompt = getSystemPrompt({ chatMode: "chat" });
    expect(prompt).not.toContain("PLAN MODE ACTIVE");
  });

  test("completed step descriptions are collapsed", () => {
    const prompt = getSystemPrompt({
      activePlan: {
        id: "p1",
        title: "Plan",
        description: null,
        status: "in_progress",
        steps: [
          {
            id: "s1",
            title: "Done Step",
            description: "This long description should not appear",
            status: "completed",
          },
          {
            id: "s2",
            title: "Pending Step",
            description: "This description should appear",
            status: "pending",
          },
        ],
      },
    });
    expect(prompt).not.toContain("This long description should not appear");
    expect(prompt).toContain("This description should appear");
  });
});
