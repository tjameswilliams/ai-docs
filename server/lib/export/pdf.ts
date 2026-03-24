import { db, schema } from "../../db/client";
import { eq } from "drizzle-orm";
import { runtime } from "../../runtime";
import { resolve } from "path";
import { existsSync, readFileSync } from "fs";
import katex from "katex";

/**
 * Generate a self-contained HTML document suitable for printing to PDF.
 * Includes all styles inline, resolves local images to base64 data URIs.
 */
export async function generatePrintableHtml(documentId: string): Promise<{
  html: string;
  title: string;
}> {
  const [doc] = await db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.id, documentId));

  if (!doc) throw new Error("Document not found");

  const content = doc.content || "";
  const title = doc.title || "Untitled";

  // Convert markdown to HTML
  const htmlContent = markdownToHtml(content);

  // Resolve local images to base64 data URIs for self-contained export
  const resolvedHtml = await resolveLocalImages(htmlContent);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.40/dist/katex.min.css" crossorigin="anonymous">
<style>
${PRINT_STYLES}
</style>
</head>
<body>
<article>
${resolvedHtml}
</article>
</body>
</html>`;

  return { html, title };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Simple markdown to HTML converter for export.
 * Handles headings, paragraphs, lists, code blocks, bold, italic,
 * links, images, blockquotes, horizontal rules, and tables.
 */
function markdownToHtml(md: string): string {
  const lines = md.split("\n");
  const output: string[] = [];
  let inCodeBlock = false;
  let codeBlockLang = "";
  let codeLines: string[] = [];
  let inList: "ul" | "ol" | null = null;
  let listDepth = 0;

  function flushList() {
    if (inList) {
      output.push(`</${inList}>`);
      inList = null;
    }
  }

  function renderKatexSafe(latex: string, displayMode: boolean): string {
    try {
      return katex.renderToString(latex, { displayMode, throwOnError: false, output: "html", strict: false });
    } catch {
      return `<code>${escapeHtml(latex)}</code>`;
    }
  }

  function processInline(text: string): string {
    // Inline math $...$ (before other processing to avoid conflicts)
    text = text.replace(/(?<!\$)\$([^$\n]+?)\$(?!\$)/g, (_m, latex) => renderKatexSafe(latex, false));
    // Images
    text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />');
    // Links
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    // Bold + italic
    text = text.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
    // Bold
    text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/__(.+?)__/g, "<strong>$1</strong>");
    // Italic
    text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
    text = text.replace(/_(.+?)_/g, "<em>$1</em>");
    // Strikethrough
    text = text.replace(/~~(.+?)~~/g, "<del>$1</del>");
    // Inline code
    text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
    return text;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code blocks
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        output.push(`<pre><code class="language-${codeBlockLang}">${codeLines.map(escapeHtml).join("\n")}</code></pre>`);
        codeLines = [];
        inCodeBlock = false;
        codeBlockLang = "";
      } else {
        flushList();
        inCodeBlock = true;
        codeBlockLang = line.slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Block math $$...$$
    if (line.trim().startsWith("$$")) {
      flushList();
      let mathContent = line.trim().slice(2);
      // Single-line $$...$$
      if (mathContent.endsWith("$$")) {
        mathContent = mathContent.slice(0, -2);
        output.push(`<div class="math-block">${renderKatexSafe(mathContent.trim(), true)}</div>`);
      } else {
        // Multi-line: collect until closing $$
        const mathLines = [mathContent];
        while (i + 1 < lines.length) {
          i++;
          if (lines[i].trim().endsWith("$$")) {
            mathLines.push(lines[i].trim().slice(0, -2));
            break;
          }
          mathLines.push(lines[i]);
        }
        output.push(`<div class="math-block">${renderKatexSafe(mathLines.join("\n").trim(), true)}</div>`);
      }
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      flushList();
      output.push("<hr />");
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      output.push(`<h${level}>${processInline(headingMatch[2])}</h${level}>`);
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      flushList();
      output.push(`<blockquote><p>${processInline(line.slice(2))}</p></blockquote>`);
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^(\s*)[*+-]\s+(.+)/);
    if (ulMatch) {
      if (inList !== "ul") {
        flushList();
        output.push("<ul>");
        inList = "ul";
      }
      output.push(`<li>${processInline(ulMatch[2])}</li>`);
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^(\s*)\d+\.\s+(.+)/);
    if (olMatch) {
      if (inList !== "ol") {
        flushList();
        output.push("<ol>");
        inList = "ol";
      }
      output.push(`<li>${processInline(olMatch[2])}</li>`);
      continue;
    }

    // Task list
    const taskMatch = line.match(/^(\s*)[*+-]\s+\[([ xX])\]\s+(.+)/);
    if (taskMatch) {
      if (inList !== "ul") {
        flushList();
        output.push('<ul class="task-list">');
        inList = "ul";
      }
      const checked = taskMatch[2] !== " " ? " checked" : "";
      output.push(`<li><input type="checkbox"${checked} disabled /> ${processInline(taskMatch[3])}</li>`);
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      flushList();
      continue;
    }

    // Table detection (simple)
    if (line.includes("|") && i + 1 < lines.length && /^\|?[\s-:|]+\|?$/.test(lines[i + 1])) {
      flushList();
      // Parse table header
      const headers = line.split("|").map((c) => c.trim()).filter(Boolean);
      i++; // skip separator line
      output.push("<table><thead><tr>");
      for (const h of headers) {
        output.push(`<th>${processInline(h)}</th>`);
      }
      output.push("</tr></thead><tbody>");
      // Parse rows
      while (i + 1 < lines.length && lines[i + 1].includes("|")) {
        i++;
        const cells = lines[i].split("|").map((c) => c.trim()).filter(Boolean);
        output.push("<tr>");
        for (const cell of cells) {
          output.push(`<td>${processInline(cell)}</td>`);
        }
        output.push("</tr>");
      }
      output.push("</tbody></table>");
      continue;
    }

    // Paragraph
    flushList();
    output.push(`<p>${processInline(line)}</p>`);
  }

  flushList();
  if (inCodeBlock) {
    output.push(`<pre><code>${codeLines.map(escapeHtml).join("\n")}</code></pre>`);
  }

  return output.join("\n");
}

/**
 * Replace local image src="/api/uploads/xxx" with base64 data URIs
 */
async function resolveLocalImages(html: string): Promise<string> {
  const imgRegex = /src="(\/api\/uploads\/([^"]+))"/g;
  let result = html;
  let match;

  while ((match = imgRegex.exec(html)) !== null) {
    const [fullMatch, _path, filename] = match;
    const uploadsDir = resolve(runtime.getDataDir(), "uploads");
    const filePath = resolve(uploadsDir, filename);

    if (existsSync(filePath)) {
      try {
        const data = readFileSync(filePath);
        const base64 = Buffer.from(data).toString("base64");
        const ext = filename.split(".").pop()?.toLowerCase() || "png";
        const mimeMap: Record<string, string> = {
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          gif: "image/gif",
          webp: "image/webp",
          svg: "image/svg+xml",
        };
        const mime = mimeMap[ext] || "image/png";
        result = result.replace(fullMatch, `src="data:${mime};base64,${base64}"`);
      } catch {
        // Keep original src if read fails
      }
    }
  }

  return result;
}

const PRINT_STYLES = `
  @page {
    margin: 1in;
    size: letter;
  }

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.7;
    color: #1a1a1a;
    max-width: 100%;
  }

  article {
    max-width: 100%;
  }

  h1 {
    font-size: 24pt;
    font-weight: 700;
    line-height: 1.2;
    margin-top: 0;
    margin-bottom: 12pt;
    color: #000;
    border-bottom: 1px solid #e0e0e0;
    padding-bottom: 6pt;
  }

  h2 {
    font-size: 18pt;
    font-weight: 600;
    line-height: 1.3;
    margin-top: 24pt;
    margin-bottom: 8pt;
    color: #111;
  }

  h3 {
    font-size: 14pt;
    font-weight: 600;
    line-height: 1.4;
    margin-top: 18pt;
    margin-bottom: 6pt;
    color: #222;
  }

  h4, h5, h6 {
    font-size: 12pt;
    font-weight: 600;
    margin-top: 14pt;
    margin-bottom: 4pt;
    color: #333;
  }

  p {
    margin-bottom: 8pt;
  }

  strong {
    font-weight: 600;
  }

  em {
    font-style: italic;
  }

  del {
    text-decoration: line-through;
    color: #888;
  }

  a {
    color: #2563eb;
    text-decoration: underline;
  }

  ul, ol {
    margin-bottom: 8pt;
    padding-left: 24pt;
  }

  ul { list-style-type: disc; }
  ol { list-style-type: decimal; }

  li {
    margin-bottom: 3pt;
  }

  ul.task-list {
    list-style: none;
    padding-left: 0;
  }

  ul.task-list li {
    display: flex;
    align-items: baseline;
    gap: 6pt;
  }

  blockquote {
    border-left: 3pt solid #d0d0d0;
    padding-left: 12pt;
    margin: 8pt 0;
    color: #555;
    font-style: italic;
  }

  code {
    font-family: "SFMono-Regular", "SF Mono", Menlo, Consolas, monospace;
    font-size: 9.5pt;
    background: #f3f4f6;
    padding: 1pt 4pt;
    border-radius: 3pt;
    color: #c7254e;
  }

  pre {
    background: #f8f9fa;
    border: 1px solid #e5e7eb;
    border-radius: 4pt;
    padding: 10pt 14pt;
    margin: 8pt 0;
    overflow-x: auto;
    font-size: 9pt;
    line-height: 1.5;
  }

  pre code {
    background: transparent;
    padding: 0;
    border-radius: 0;
    color: #1a1a1a;
  }

  hr {
    border: none;
    border-top: 1px solid #d0d0d0;
    margin: 18pt 0;
  }

  table {
    border-collapse: collapse;
    width: 100%;
    margin: 8pt 0;
    font-size: 10pt;
  }

  th, td {
    border: 1px solid #d0d0d0;
    padding: 5pt 8pt;
    text-align: left;
  }

  th {
    background: #f3f4f6;
    font-weight: 600;
  }

  img {
    max-width: 100%;
    height: auto;
    margin: 8pt 0;
    border-radius: 4pt;
  }

  .math-block {
    margin: 12pt 0;
    text-align: center;
    page-break-inside: avoid;
  }

  @media print {
    body { font-size: 11pt; }
    h1 { page-break-after: avoid; }
    h2, h3 { page-break-after: avoid; }
    img { page-break-inside: avoid; }
    table { page-break-inside: avoid; }
    pre { page-break-inside: avoid; }
  }
`;
