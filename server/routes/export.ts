import { Hono } from "hono";
import { generatePrintableHtml } from "../lib/export/pdf";
import { generateDocx } from "../lib/export/docx";
import { renderMathSvg } from "../lib/export/mathRender";
import { renderTableSvg } from "../lib/export/tableRender";
import { db, schema } from "../db/client";
import { eq } from "drizzle-orm";

const app = new Hono();

// Export document as self-contained HTML (for PDF printing)
app.get("/documents/:id/export/html", async (c) => {
  try {
    const { html, title } = await generatePrintableHtml(c.req.param("id"));
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="${encodeURIComponent(title)}.html"`,
      },
    });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 404);
  }
});

// Export document as downloadable HTML file
app.get("/documents/:id/export/html/download", async (c) => {
  try {
    const { html, title } = await generatePrintableHtml(c.req.param("id"));
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(title)}.html"`,
      },
    });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 404);
  }
});

// Export document as raw markdown
app.get("/documents/:id/export/markdown", async (c) => {
  const id = c.req.param("id");
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, id));
  if (!doc) return c.json({ error: "Document not found" }, 404);

  return new Response(doc.content || "", {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(doc.title)}.md"`,
    },
  });
});

// Export document as Word (.docx)
app.get("/documents/:id/export/docx", async (c) => {
  try {
    const { buffer, title } = await generateDocx(c.req.param("id"));
    return new Response(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(title)}.docx"`,
      },
    });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 404);
  }
});

// Render LaTeX equation as SVG (pure vector, no external resources)
app.post("/math/render", async (c) => {
  try {
    const { latex, theme, fontSize } = await c.req.json<{
      latex: string;
      theme: "light" | "dark";
      fontSize?: number;
    }>();
    if (!latex) return c.json({ error: "latex is required" }, 400);

    const svg = renderMathSvg({
      latex,
      theme: theme || "light",
      fontSize: fontSize || 20,
    });

    return new Response(svg, {
      headers: { "Content-Type": "image/svg+xml; charset=utf-8" },
    });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// Render table as SVG (pure vector, no external resources)
app.post("/table/render", async (c) => {
  try {
    const { rows, theme, fontSize } = await c.req.json<{
      rows: { text: string; isHeader: boolean }[][];
      theme: "light" | "dark";
      fontSize?: number;
    }>();
    if (!rows?.length) return c.json({ error: "rows is required" }, 400);

    const svg = renderTableSvg({
      rows,
      theme: theme || "light",
      fontSize: fontSize || 14,
    });

    return new Response(svg, {
      headers: { "Content-Type": "image/svg+xml; charset=utf-8" },
    });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

export default app;
