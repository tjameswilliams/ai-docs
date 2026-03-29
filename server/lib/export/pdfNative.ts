import PDFDocument from "pdfkit";
import { db, schema } from "../../db/client";
import { eq } from "drizzle-orm";
import { runtime } from "../../runtime";
import { resolve } from "path";
import { existsSync, readFileSync } from "fs";
import { renderMathSvg } from "./mathRender";
import { Resvg } from "@resvg/resvg-js";

/**
 * Generate a native PDF with real text objects (searchable, parseable by LLMs).
 * Uses PDFKit for direct PDF generation — no browser rendering.
 */
export async function generateNativePdf(documentId: string): Promise<{
  buffer: Buffer;
  title: string;
}> {
  const [doc] = await db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.id, documentId));

  if (!doc) throw new Error("Document not found");

  const content = doc.content || "";
  const title = doc.title || "Untitled";

  const pdf = new PDFDocument({
    size: "letter",
    margins: { top: 72, bottom: 72, left: 80, right: 80 },
    info: {
      Title: title,
      Creator: "AI Docs",
    },
    bufferPages: true,
    autoFirstPage: true,
  });

  const chunks: Buffer[] = [];
  pdf.on("data", (c: Buffer) => chunks.push(c));

  const pageW = 612 - 160; // letter width minus margins (80 each side)

  // Render document title
  pdf.font(FONTS.bold).fontSize(SIZES.h1).fillColor(COLORS.heading);
  pdf.text(title, { lineGap: LINE_GAP.heading });
  pdf.moveDown(0.6);
  pdf.font(FONTS.regular).fontSize(SIZES.body).fillColor(COLORS.text);

  renderMarkdownToPdf(pdf, content, pageW);

  pdf.end();

  await new Promise<void>((resolve) => pdf.on("end", resolve));
  return { buffer: Buffer.concat(chunks), title };
}

// ── Fonts & Styling ──

const FONTS = {
  regular: "Helvetica",
  bold: "Helvetica-Bold",
  italic: "Helvetica-Oblique",
  boldItalic: "Helvetica-BoldOblique",
  mono: "Courier",
  monoBold: "Courier-Bold",
};

// Typography: minor-third scale (1.2×) from 10.5pt base
// Produces natural-looking size progression
const SIZES = {
  h1: 22,     // 1.2^4 ≈ 2.07× base
  h2: 18,     // 1.2^3 ≈ 1.73× base
  h3: 15,     // 1.2^2 ≈ 1.44× base
  h4: 12.5,   // 1.2^1 ≈ 1.2× base
  h5: 10.5,   // base (bold differentiates)
  h6: 10.5,   // base (italic+bold differentiates)
  body: 10.5,
  code: 9,
  small: 8.5,
};

// Line height: expressed as lineGap in points added between lines
// Target ~1.45× leading for body (10.5pt font × 1.45 = 15.2pt → gap ≈ 4.7pt)
const LINE_GAP = {
  body: 4.7,
  heading: 2,
  code: 3,
  list: 3.5,
};

// Spacing: in points, before/after elements
const SPACING = {
  paragraphAfter: 8,        // ~0.75em after paragraphs
  h1Before: 28,             // generous space before major headings
  h1After: 10,
  h2Before: 22,
  h2After: 8,
  h3Before: 16,
  h3After: 6,
  hMinorBefore: 12,
  hMinorAfter: 4,
  listItemGap: 2,           // tight spacing between list items
  listBlockAfter: 8,        // space after a list ends
  codeBlockBefore: 8,
  codeBlockAfter: 10,
  codeBlockPadX: 14,
  codeBlockPadY: 10,
  blockquotePadLeft: 18,
  blockquoteBorderWidth: 2.5,
  hrSpaceBefore: 14,
  hrSpaceAfter: 14,
  mathBefore: 10,
  mathAfter: 10,
  imageAfter: 10,
};

const COLORS = {
  text: "#222222",
  heading: "#111111",
  link: "#1a56db",
  code: "#2d2d2d",
  codeBg: "#f7f7f8",
  codeBorder: "#e5e5e5",
  border: "#d0d0d0",
  blockquoteBorder: "#c0c0c0",
  blockquoteText: "#4a4a4a",
  tableBorder: "#d4d4d8",
  tableHeaderBg: "#f5f5f5",
  tableHeaderText: "#111111",
};

// ── Inline text parser ──

interface TextSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  link?: string;
  math?: boolean;
}

function parseInlineSpans(text: string): TextSpan[] {
  const spans: TextSpan[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    let match: RegExpMatchArray | null;

    // Inline math
    match = remaining.match(/^(?<!\$)\$([^$\n]+?)\$(?!\$)/);
    if (match && match.index === 0) {
      spans.push({ text: match[1], math: true, italic: true });
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Inline code
    match = remaining.match(/^`([^`]+)`/);
    if (match) {
      spans.push({ text: match[1], code: true });
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Image - skip in PDF inline (handled separately)
    match = remaining.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
    if (match) {
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Link
    match = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (match) {
      spans.push({ text: match[1], link: match[2] });
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Bold+italic
    match = remaining.match(/^\*\*\*(.+?)\*\*\*/);
    if (match) {
      spans.push({ text: match[1], bold: true, italic: true });
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Bold
    match = remaining.match(/^\*\*(.+?)\*\*/);
    if (match) {
      spans.push({ text: match[1], bold: true });
      remaining = remaining.slice(match[0].length);
      continue;
    }
    match = remaining.match(/^__(.+?)__/);
    if (match) {
      spans.push({ text: match[1], bold: true });
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Italic
    match = remaining.match(/^\*(.+?)\*/);
    if (match) {
      spans.push({ text: match[1], italic: true });
      remaining = remaining.slice(match[0].length);
      continue;
    }
    match = remaining.match(/^_(.+?)_/);
    if (match) {
      spans.push({ text: match[1], italic: true });
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Strikethrough
    match = remaining.match(/^~~(.+?)~~/);
    if (match) {
      spans.push({ text: match[1], strike: true });
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Plain text
    match = remaining.match(/^[^*_`~$!\[]+/);
    if (match) {
      spans.push({ text: match[0] });
      remaining = remaining.slice(match[0].length);
      continue;
    }

    spans.push({ text: remaining[0] });
    remaining = remaining.slice(1);
  }

  return spans;
}

function writeInlineSpans(
  pdf: InstanceType<typeof PDFDocument>,
  spans: TextSpan[],
  fontSize: number = SIZES.body,
  lineGap: number = LINE_GAP.body,
  extraOpts: Record<string, unknown> = {}
) {
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    const continued = i < spans.length - 1;
    const opts = { continued, lineGap, ...extraOpts };

    if (span.code) {
      pdf
        .font(FONTS.mono)
        .fontSize(fontSize - 1)
        .fillColor(COLORS.code)
        .text(span.text, opts);
    } else if (span.link) {
      pdf
        .font(FONTS.regular)
        .fontSize(fontSize)
        .fillColor(COLORS.link)
        .text(span.text, { ...opts, link: span.link, underline: true });
    } else if (span.math) {
      pdf
        .font(FONTS.italic)
        .fontSize(fontSize)
        .fillColor(COLORS.text)
        .text(span.text, opts);
    } else {
      const font =
        span.bold && span.italic ? FONTS.boldItalic :
        span.bold ? FONTS.bold :
        span.italic ? FONTS.italic :
        FONTS.regular;
      pdf
        .font(font)
        .fontSize(fontSize)
        .fillColor(COLORS.text)
        .text(span.text, { ...opts, strike: span.strike });
    }
  }

  // Reset state
  pdf.font(FONTS.regular).fontSize(fontSize).fillColor(COLORS.text);
}

// ── Image loading ──

function loadImage(src: string): { data: Buffer; ext: string } | null {
  const localMatch = src.match(/(?:https?:\/\/[^/]*)?\/api\/uploads\/(.+)$/);
  if (!localMatch) return null;
  const uploadsDir = resolve(runtime.getDataDir(), "uploads");
  const filePath = resolve(uploadsDir, localMatch[1]);
  if (!existsSync(filePath)) return null;
  try {
    return { data: readFileSync(filePath), ext: localMatch[1].split(".").pop()?.toLowerCase() || "png" };
  } catch {
    return null;
  }
}

// ── Math to PNG ──

function mathToPng(latex: string): Buffer | null {
  try {
    const svg = renderMathSvg({ latex, theme: "light", fontSize: 16 });
    const resvg = new Resvg(svg, { fitTo: { mode: "zoom" as any, value: 3 } });
    return Buffer.from(resvg.render().asPng());
  } catch {
    return null;
  }
}

// ── Main renderer ──

function renderMarkdownToPdf(pdf: InstanceType<typeof PDFDocument>, md: string, pageW: number) {
  const lines = md.split("\n");
  let inCodeBlock = false;
  let codeBlockLang = "";
  let codeLines: string[] = [];
  let inList: "ul" | "ol" | null = null;
  let listNum = 0;

  // Set default text options for the document
  pdf.font(FONTS.regular).fontSize(SIZES.body).fillColor(COLORS.text);

  function ensureSpace(needed: number) {
    if (pdf.y + needed > (pdf.page.height - pdf.page.margins.bottom)) {
      pdf.addPage();
    }
  }

  function addVerticalSpace(pts: number) {
    pdf.y += pts;
  }

  function resetBodyStyle() {
    pdf.font(FONTS.regular).fontSize(SIZES.body).fillColor(COLORS.text);
  }

  function flushList() {
    if (inList) {
      addVerticalSpace(SPACING.listBlockAfter);
      inList = null;
      listNum = 0;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ── Code blocks ──
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        const codeText = codeLines.join("\n");
        const padX = SPACING.codeBlockPadX;
        const padY = SPACING.codeBlockPadY;

        pdf.font(FONTS.mono).fontSize(SIZES.code);
        const codeHeight = pdf.heightOfString(codeText, {
          width: pageW - padX * 2,
          lineGap: LINE_GAP.code,
        }) + padY * 2;

        ensureSpace(codeHeight + SPACING.codeBlockAfter);
        const codeX = pdf.page.margins.left;
        const codeY = pdf.y;

        // Background with subtle border
        pdf.save();
        pdf.roundedRect(codeX, codeY, pageW, codeHeight, 3)
          .fillAndStroke(COLORS.codeBg, COLORS.codeBorder);
        pdf.restore();

        // Code text
        pdf.font(FONTS.mono).fontSize(SIZES.code).fillColor(COLORS.code);
        pdf.text(codeText, codeX + padX, codeY + padY, {
          width: pageW - padX * 2,
          lineGap: LINE_GAP.code,
        });
        pdf.y = codeY + codeHeight + SPACING.codeBlockAfter;

        codeLines = [];
        inCodeBlock = false;
        codeBlockLang = "";
        resetBodyStyle();
      } else {
        flushList();
        addVerticalSpace(SPACING.codeBlockBefore);
        inCodeBlock = true;
        codeBlockLang = line.slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // ── Block math $$...$$ ──
    if (line.trim().startsWith("$$")) {
      flushList();
      let mathContent = line.trim().slice(2);
      if (mathContent.endsWith("$$")) {
        mathContent = mathContent.slice(0, -2);
      } else {
        const mathLines = [mathContent];
        while (i + 1 < lines.length) {
          i++;
          if (lines[i].trim().endsWith("$$")) {
            mathLines.push(lines[i].trim().slice(0, -2));
            break;
          }
          mathLines.push(lines[i]);
        }
        mathContent = mathLines.join("\n").trim();
      }

      addVerticalSpace(SPACING.mathBefore);
      const png = mathToPng(mathContent);
      if (png) {
        try {
          const imgObj = pdf.openImage(png);
          const scale = Math.min(1, (pageW * 0.8) / imgObj.width);
          const imgW = imgObj.width * scale;
          const imgH = imgObj.height * scale;
          ensureSpace(imgH + SPACING.mathAfter);
          const imgX = pdf.page.margins.left + (pageW - imgW) / 2;
          pdf.image(png, imgX, pdf.y, { width: imgW });
          pdf.y += imgH + SPACING.mathAfter;
        } catch {
          pdf.font(FONTS.italic).fontSize(SIZES.body).fillColor(COLORS.text);
          pdf.text(mathContent, { align: "center", lineGap: LINE_GAP.body });
          addVerticalSpace(SPACING.mathAfter);
        }
      } else {
        pdf.font(FONTS.italic).fontSize(SIZES.body).fillColor(COLORS.text);
        pdf.text(mathContent, { align: "center", lineGap: LINE_GAP.body });
        addVerticalSpace(SPACING.mathAfter);
      }
      resetBodyStyle();
      continue;
    }

    // ── Horizontal rule ──
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      flushList();
      addVerticalSpace(SPACING.hrSpaceBefore);
      ensureSpace(SPACING.hrSpaceAfter + 1);
      const y = pdf.y;
      pdf.save();
      pdf.moveTo(pdf.page.margins.left, y)
        .lineTo(pdf.page.width - pdf.page.margins.right, y)
        .strokeColor(COLORS.border)
        .lineWidth(0.5)
        .stroke();
      pdf.restore();
      pdf.y = y + SPACING.hrSpaceAfter;
      continue;
    }

    // ── Headings ──
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const size = [SIZES.h1, SIZES.h2, SIZES.h3, SIZES.h4, SIZES.h5, SIZES.h6][level - 1];
      const spaceBefore = level === 1 ? SPACING.h1Before
        : level === 2 ? SPACING.h2Before
        : level === 3 ? SPACING.h3Before
        : SPACING.hMinorBefore;
      const spaceAfter = level === 1 ? SPACING.h1After
        : level === 2 ? SPACING.h2After
        : level === 3 ? SPACING.h3After
        : SPACING.hMinorAfter;

      ensureSpace(size + spaceBefore + spaceAfter);
      addVerticalSpace(spaceBefore);

      const spans = parseInlineSpans(headingMatch[2]);
      const boldSpans = spans.map((s) => ({
        ...s,
        bold: true,
        italic: level === 6 ? true : s.italic, // H6 uses bold-italic
      }));
      pdf.fillColor(COLORS.heading);
      writeInlineSpans(pdf, boldSpans, size, LINE_GAP.heading);
      addVerticalSpace(spaceAfter);
      resetBodyStyle();
      continue;
    }

    // ── Blockquote ──
    if (line.startsWith("> ")) {
      flushList();
      const text = line.slice(2);
      const spans = parseInlineSpans(text);
      const indent = SPACING.blockquotePadLeft;

      ensureSpace(SIZES.body + 8);
      const startY = pdf.y;

      pdf.fillColor(COLORS.blockquoteText);
      pdf.text("", pdf.page.margins.left + indent, pdf.y); // move x
      writeInlineSpans(pdf, spans, SIZES.body, LINE_GAP.body, { width: pageW - indent });
      pdf.x = pdf.page.margins.left;

      const endY = pdf.y;
      // Left accent bar
      pdf.save();
      pdf.moveTo(pdf.page.margins.left + 5, startY - 1)
        .lineTo(pdf.page.margins.left + 5, endY + 1)
        .strokeColor(COLORS.blockquoteBorder)
        .lineWidth(SPACING.blockquoteBorderWidth)
        .stroke();
      pdf.restore();

      resetBodyStyle();
      addVerticalSpace(SPACING.paragraphAfter);
      continue;
    }

    // ── Task list ──
    const taskMatch = line.match(/^(\s*)[*+-]\s+\[([ xX])\]\s+(.+)/);
    if (taskMatch) {
      if (!inList) inList = "ul";
      const checked = taskMatch[2] !== " ";
      const prefix = checked ? "☑ " : "☐ ";
      ensureSpace(SIZES.body + 6);
      const spans = parseInlineSpans(taskMatch[3]);
      pdf.font(FONTS.regular).fontSize(SIZES.body);
      pdf.text(prefix, { continued: true, indent: 20, lineGap: LINE_GAP.list });
      writeInlineSpans(pdf, spans, SIZES.body, LINE_GAP.list);
      addVerticalSpace(SPACING.listItemGap);
      continue;
    }

    // ── Unordered list ──
    const ulMatch = line.match(/^(\s*)[*+-]\s+(.+)/);
    if (ulMatch) {
      if (inList !== "ul") {
        flushList();
        inList = "ul";
      }
      ensureSpace(SIZES.body + 6);
      const spans = parseInlineSpans(ulMatch[2]);
      pdf.font(FONTS.regular).fontSize(SIZES.body);
      pdf.text("•   ", { continued: true, indent: 20, lineGap: LINE_GAP.list });
      writeInlineSpans(pdf, spans, SIZES.body, LINE_GAP.list);
      addVerticalSpace(SPACING.listItemGap);
      continue;
    }

    // ── Ordered list ──
    const olMatch = line.match(/^(\s*)\d+\.\s+(.+)/);
    if (olMatch) {
      if (inList !== "ol") {
        flushList();
        inList = "ol";
        listNum = 0;
      }
      listNum++;
      ensureSpace(SIZES.body + 6);
      const spans = parseInlineSpans(olMatch[2]);
      pdf.font(FONTS.regular).fontSize(SIZES.body);
      const numStr = `${listNum}.  `;
      pdf.text(numStr, { continued: true, indent: 20, lineGap: LINE_GAP.list });
      writeInlineSpans(pdf, spans, SIZES.body, LINE_GAP.list);
      addVerticalSpace(SPACING.listItemGap);
      continue;
    }

    // ── Empty line ──
    if (line.trim() === "") {
      flushList();
      continue;
    }

    // ── Table ──
    if (line.includes("|") && i + 1 < lines.length && /^\|?[\s-:|]+\|?$/.test(lines[i + 1])) {
      flushList();
      const headers = line.split("|").map((c) => c.trim()).filter(Boolean);
      i++; // skip separator

      const rows: string[][] = [];
      while (i + 1 < lines.length && lines[i + 1].includes("|")) {
        i++;
        rows.push(lines[i].split("|").map((c) => c.trim()).filter(Boolean));
      }

      renderTable(pdf, headers, rows, pageW);
      addVerticalSpace(SPACING.paragraphAfter);
      continue;
    }

    // ── Standalone image ──
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
    if (imgMatch) {
      flushList();
      const imgData = loadImage(imgMatch[2]);
      if (imgData) {
        try {
          const imgObj = pdf.openImage(imgData.data);
          const scale = Math.min(1, pageW / imgObj.width);
          const imgW = imgObj.width * scale;
          const imgH = imgObj.height * scale;
          ensureSpace(imgH + SPACING.imageAfter);
          pdf.image(imgData.data, { width: imgW });
          addVerticalSpace(SPACING.imageAfter);
        } catch {
          pdf.font(FONTS.italic).fontSize(SIZES.small).fillColor("#999999");
          pdf.text(`[Image: ${imgMatch[1] || imgMatch[2]}]`, { lineGap: LINE_GAP.body });
          addVerticalSpace(SPACING.paragraphAfter);
        }
      } else {
        pdf.font(FONTS.italic).fontSize(SIZES.small).fillColor("#999999");
        pdf.text(`[Image: ${imgMatch[1] || imgMatch[2]}]`, { lineGap: LINE_GAP.body });
        addVerticalSpace(SPACING.paragraphAfter);
      }
      resetBodyStyle();
      continue;
    }

    // ── Paragraph (with possible inline images) ──
    flushList();
    const inlineImgMatch = line.match(/!\[([^\]]*)\]\(([^)]+)\)/);
    if (inlineImgMatch) {
      const parts = line.split(/!\[[^\]]*\]\([^)]+\)/);
      const images = [...line.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)];

      for (let p = 0; p < parts.length; p++) {
        if (parts[p].trim()) {
          const spans = parseInlineSpans(parts[p]);
          writeInlineSpans(pdf, spans, SIZES.body, LINE_GAP.body);
        }
        if (images[p]) {
          const imgData = loadImage(images[p][2]);
          if (imgData) {
            try {
              const imgObj = pdf.openImage(imgData.data);
              const scale = Math.min(1, pageW / imgObj.width);
              pdf.image(imgData.data, { width: imgObj.width * scale });
            } catch { /* skip */ }
          }
        }
      }
      addVerticalSpace(SPACING.paragraphAfter);
    } else {
      const spans = parseInlineSpans(line);
      if (spans.length > 0) {
        ensureSpace(SIZES.body + 8);
        writeInlineSpans(pdf, spans, SIZES.body, LINE_GAP.body);
        addVerticalSpace(SPACING.paragraphAfter);
      }
    }
  }

  // Flush remaining code block
  flushList();
  if (inCodeBlock && codeLines.length) {
    const codeText = codeLines.join("\n");
    pdf.font(FONTS.mono).fontSize(SIZES.code).fillColor(COLORS.code);
    pdf.text(codeText, { lineGap: LINE_GAP.code });
  }
}

// ── Table renderer ──

function renderTable(
  pdf: InstanceType<typeof PDFDocument>,
  headers: string[],
  rows: string[][],
  tableW: number
) {
  const colCount = headers.length;
  const colW = tableW / colCount;
  const cellPadX = 8;
  const cellPadY = 6;
  const fontSize = SIZES.body;

  // Row height: font size + padding + line gap
  const rowH = fontSize + cellPadY * 2 + 6;
  const totalH = (1 + rows.length) * rowH;

  if (pdf.y + totalH > pdf.page.height - pdf.page.margins.bottom) {
    pdf.addPage();
  }

  const startX = pdf.page.margins.left;
  const tableTop = pdf.y;
  let y = tableTop;

  // Header row background
  pdf.save();
  pdf.rect(startX, y, tableW, rowH).fill(COLORS.tableHeaderBg);
  pdf.restore();

  // Header text
  for (let c = 0; c < colCount; c++) {
    const x = startX + c * colW;
    pdf.font(FONTS.bold).fontSize(fontSize).fillColor(COLORS.tableHeaderText);
    pdf.text(headers[c] || "", x + cellPadX, y + cellPadY + 1, {
      width: colW - cellPadX * 2,
      height: rowH - cellPadY * 2,
      lineBreak: false,
    });
  }
  y += rowH;

  // Thick line below header
  pdf.save();
  pdf.moveTo(startX, y).lineTo(startX + tableW, y)
    .strokeColor(COLORS.tableBorder).lineWidth(1.2).stroke();
  pdf.restore();

  // Data rows
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < colCount; c++) {
      const x = startX + c * colW;
      pdf.font(FONTS.regular).fontSize(fontSize).fillColor(COLORS.text);
      pdf.text(row[c] || "", x + cellPadX, y + cellPadY + 1, {
        width: colW - cellPadX * 2,
        height: rowH - cellPadY * 2,
        lineBreak: false,
      });
    }
    y += rowH;

    // Light row separator
    if (r < rows.length - 1) {
      pdf.save();
      pdf.moveTo(startX, y).lineTo(startX + tableW, y)
        .strokeColor(COLORS.tableBorder).lineWidth(0.3).stroke();
      pdf.restore();
    }
  }

  // Outer border
  pdf.save();
  pdf.rect(startX, tableTop, tableW, y - tableTop)
    .strokeColor(COLORS.tableBorder).lineWidth(0.8).stroke();
  pdf.restore();

  // Vertical column dividers
  pdf.save();
  for (let c = 1; c < colCount; c++) {
    const x = startX + c * colW;
    pdf.moveTo(x, tableTop).lineTo(x, y)
      .strokeColor(COLORS.tableBorder).lineWidth(0.3).stroke();
  }
  pdf.restore();

  pdf.y = y + 4;
  pdf.font(FONTS.regular).fontSize(SIZES.body).fillColor(COLORS.text);
}
