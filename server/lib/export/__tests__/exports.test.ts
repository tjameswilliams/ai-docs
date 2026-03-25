import { describe, test, expect, beforeAll } from "bun:test";
import { createTestProject, createTestDocument, db, schema, eq } from "../../../__tests__/testHelper";
import { generatePrintableHtml } from "../pdf";
import { generateDocx } from "../docx";
import { renderTableSvg } from "../tableRender";
import { renderMathSvg } from "../mathRender";

let projectId: string;

beforeAll(async () => {
  projectId = await createTestProject("Export Test");
});

describe("generatePrintableHtml", () => {
  test("generates valid HTML document", async () => {
    const doc = await createTestDocument(projectId, {
      title: "Export Test",
      content: "# Hello\n\nParagraph here.",
    });
    const { html, title } = await generatePrintableHtml(doc.id);
    expect(title).toBe("Export Test");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<h1>Hello</h1>");
    expect(html).toContain("<p>Paragraph here.</p>");
    await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));
  });

  test("throws for missing document", async () => {
    expect(generatePrintableHtml("nonexistent")).rejects.toThrow("Document not found");
  });
});

describe("generateDocx", () => {
  test("generates valid DOCX buffer", async () => {
    const doc = await createTestDocument(projectId, {
      title: "DOCX Export",
      content: "# Title\n\n- item 1\n- item 2\n\n**bold** text",
    });
    const { buffer, title } = await generateDocx(doc.id);
    expect(title).toBe("DOCX Export");
    // DOCX files are ZIP archives starting with PK
    expect(buffer[0]).toBe(0x50); // P
    expect(buffer[1]).toBe(0x4b); // K
    expect(buffer.length).toBeGreaterThan(1000);
    await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));
  });

  test("throws for missing document", async () => {
    expect(generateDocx("nonexistent")).rejects.toThrow("Document not found");
  });
});

describe("renderTableSvg", () => {
  test("renders a table as SVG", () => {
    const svg = renderTableSvg({
      rows: [
        [{ text: "A", isHeader: true }, { text: "B", isHeader: true }],
        [{ text: "1", isHeader: false }, { text: "2", isHeader: false }],
      ],
      theme: "light",
    });
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain(">A<");
    expect(svg).toContain(">1<");
  });

  test("dark theme uses dark colors", () => {
    const svg = renderTableSvg({
      rows: [[{ text: "X", isHeader: true }]],
      theme: "dark",
    });
    expect(svg).toContain("#1a1a1a"); // dark bg
  });

  test("throws for empty rows", () => {
    expect(() => renderTableSvg({ rows: [], theme: "light" })).toThrow();
  });
});

describe("renderMathSvg", () => {
  test("renders LaTeX to SVG", () => {
    const svg = renderMathSvg({ latex: "E=mc^2", theme: "light" });
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });

  test("includes background rect", () => {
    const svg = renderMathSvg({ latex: "x^2", theme: "light" });
    expect(svg).toContain('fill="#ffffff"'); // light bg
  });

  test("dark theme uses dark background", () => {
    const svg = renderMathSvg({ latex: "x^2", theme: "dark" });
    expect(svg).toContain('fill="#1a1a1a"');
  });
});
