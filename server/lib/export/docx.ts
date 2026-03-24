import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  ImageRun,
  ExternalHyperlink,
  ShadingType,
  TabStopType,
  TabStopPosition,
} from "docx";
import { db, schema } from "../../db/client";
import { eq } from "drizzle-orm";
import { runtime } from "../../runtime";
import { resolve } from "path";
import { existsSync, readFileSync } from "fs";
import { renderMathSvg } from "./mathRender";
import { Resvg } from "@resvg/resvg-js";

/**
 * Generate a .docx Word document from a document's markdown content.
 */
export async function generateDocx(
  documentId: string
): Promise<{ buffer: Buffer; title: string }> {
  const [doc] = await db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.id, documentId));

  if (!doc) throw new Error("Document not found");

  const content = doc.content || "";
  const title = doc.title || "Untitled";

  const children = await markdownToDocx(content);

  const document = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 }, // 1 inch = 1440 twips
          },
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(document);
  return { buffer: buffer as Buffer, title };
}

// ── Inline text parsing ──

interface InlineSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  link?: string;
  math?: boolean;
}

function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  // Process inline elements using regex, building segments
  let remaining = text;

  while (remaining.length > 0) {
    // Inline math $...$
    let match = remaining.match(/^(?<!\$)\$([^$\n]+?)\$(?!\$)/);
    if (match && match.index === 0) {
      segments.push({ text: match[1], math: true, italic: true });
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Inline code `...`
    match = remaining.match(/^`([^`]+)`/);
    if (match) {
      segments.push({ text: match[1], code: true });
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Image ![alt](url) — skip in inline, handled separately
    match = remaining.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
    if (match) {
      segments.push({ text: `[Image: ${match[1] || match[2]}]`, italic: true });
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Link [text](url)
    match = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (match) {
      segments.push({ text: match[1], link: match[2] });
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Bold+italic ***...***
    match = remaining.match(/^\*\*\*(.+?)\*\*\*/);
    if (match) {
      segments.push({ text: match[1], bold: true, italic: true });
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Bold **...**
    match = remaining.match(/^\*\*(.+?)\*\*/);
    if (match) {
      segments.push({ text: match[1], bold: true });
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Bold __...__
    match = remaining.match(/^__(.+?)__/);
    if (match) {
      segments.push({ text: match[1], bold: true });
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Italic *...*
    match = remaining.match(/^\*(.+?)\*/);
    if (match) {
      segments.push({ text: match[1], italic: true });
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Italic _..._
    match = remaining.match(/^_(.+?)_/);
    if (match) {
      segments.push({ text: match[1], italic: true });
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Strikethrough ~~...~~
    match = remaining.match(/^~~(.+?)~~/);
    if (match) {
      segments.push({ text: match[1], strike: true });
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Plain text — consume up to the next special character
    match = remaining.match(/^[^*_`~$!\[]+/);
    if (match) {
      segments.push({ text: match[0] });
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Single special char that didn't match a pattern — consume it
    segments.push({ text: remaining[0] });
    remaining = remaining.slice(1);
  }

  return segments;
}

function segmentsToRuns(segments: InlineSegment[]): (TextRun | ExternalHyperlink)[] {
  const runs: (TextRun | ExternalHyperlink)[] = [];

  for (const seg of segments) {
    if (seg.link) {
      runs.push(
        new ExternalHyperlink({
          link: seg.link,
          children: [
            new TextRun({
              text: seg.text,
              color: "2563EB",
              underline: { type: "single" as any },
              bold: seg.bold,
              italics: seg.italic,
            }),
          ],
        })
      );
    } else if (seg.code) {
      runs.push(
        new TextRun({
          text: seg.text,
          font: "Courier New",
          size: 20, // 10pt in half-points
          shading: { type: ShadingType.CLEAR, fill: "F0F0F0" },
        })
      );
    } else if (seg.math) {
      runs.push(
        new TextRun({
          text: seg.text,
          italics: true,
          font: "Cambria Math",
        })
      );
    } else {
      runs.push(
        new TextRun({
          text: seg.text,
          bold: seg.bold,
          italics: seg.italic,
          strike: seg.strike,
        })
      );
    }
  }

  return runs;
}

function inlineToRuns(text: string): (TextRun | ExternalHyperlink)[] {
  return segmentsToRuns(parseInline(text));
}

// ── Image loading ──

function loadImageBuffer(src: string): { buffer: Buffer; ext: string } | null {
  // Handle local uploads
  const localMatch = src.match(/^\/api\/uploads\/(.+)$/);
  if (localMatch) {
    const uploadsDir = resolve(runtime.getDataDir(), "uploads");
    const filePath = resolve(uploadsDir, localMatch[1]);
    if (existsSync(filePath)) {
      try {
        const buffer = readFileSync(filePath) as Buffer;
        const ext = localMatch[1].split(".").pop()?.toLowerCase() || "png";
        return { buffer, ext };
      } catch {
        return null;
      }
    }
  }
  return null;
}

// ── Math to image ──

function renderMathImage(latex: string): { png: Buffer; width: number; height: number } | null {
  try {
    const svg = renderMathSvg({ latex, theme: "light", fontSize: 18 });
    // Convert SVG to PNG at 3x for crisp rendering
    const scale = 3;
    const resvg = new Resvg(svg, {
      fitTo: { mode: "zoom" as any, value: scale },
    });
    const rendered = resvg.render();
    const png = rendered.asPng();
    return {
      png: Buffer.from(png),
      width: Math.round(rendered.width / scale),
      height: Math.round(rendered.height / scale),
    };
  } catch {
    return null;
  }
}

// ── Main converter ──

const HEADING_MAP: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const cellBorders = {
  top: thinBorder,
  bottom: thinBorder,
  left: thinBorder,
  right: thinBorder,
};

async function markdownToDocx(md: string): Promise<Paragraph[]> {
  const lines = md.split("\n");
  const children: (Paragraph | Table)[] = [];
  let inCodeBlock = false;
  let codeBlockLang = "";
  let codeLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code blocks
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        // Emit code block as paragraphs with monospace font + gray background
        for (const codeLine of codeLines) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: codeLine || " ",
                  font: "Courier New",
                  size: 18, // 9pt
                }),
              ],
              shading: { type: ShadingType.CLEAR, fill: "F5F5F5" },
              spacing: { before: 0, after: 0, line: 276 },
              indent: { left: 360 },
            })
          );
        }
        codeLines = [];
        inCodeBlock = false;
        codeBlockLang = "";
        // Add spacing after code block
        children.push(new Paragraph({ spacing: { before: 120 } }));
      } else {
        inCodeBlock = true;
        codeBlockLang = line.slice(3).trim();
        // Add spacing before code block
        children.push(new Paragraph({ spacing: { after: 60 } }));
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Block math $$...$$
    if (line.trim().startsWith("$$")) {
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

      // Render math as PNG image
      const mathImg = renderMathImage(mathContent);
      if (mathImg) {
        // Scale to fit ~5 inches max width
        const maxW = 360; // 5 inches in pt
        const scale = mathImg.width > maxW ? maxW / mathImg.width : 1;

        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({
                data: mathImg.png,
                transformation: {
                  width: Math.round(mathImg.width * scale),
                  height: Math.round(mathImg.height * scale),
                },
              }),
            ],
            spacing: { before: 120, after: 120 },
          })
        );
      } else {
        // Fallback: render as italic text
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: mathContent, italics: true, font: "Cambria Math" })],
            spacing: { before: 120, after: 120 },
          })
        );
      }
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      children.push(
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" } },
          spacing: { before: 200, after: 200 },
        })
      );
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      children.push(
        new Paragraph({
          heading: HEADING_MAP[level] || HeadingLevel.HEADING_3,
          children: inlineToRuns(headingMatch[2]),
          spacing: { before: level === 1 ? 360 : 240, after: 120 },
        })
      );
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      children.push(
        new Paragraph({
          children: inlineToRuns(line.slice(2)),
          indent: { left: 720 },
          border: { left: { style: BorderStyle.SINGLE, size: 6, color: "BBBBBB" } },
          spacing: { before: 60, after: 60 },
        })
      );
      continue;
    }

    // Task list
    const taskMatch = line.match(/^(\s*)[*+-]\s+\[([ xX])\]\s+(.+)/);
    if (taskMatch) {
      const checked = taskMatch[2] !== " ";
      const prefix = checked ? "☑ " : "☐ ";
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: prefix }),
            ...inlineToRuns(taskMatch[3]),
          ],
          indent: { left: 360 },
          spacing: { before: 40, after: 40 },
        })
      );
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^(\s*)[*+-]\s+(.+)/);
    if (ulMatch) {
      children.push(
        new Paragraph({
          children: inlineToRuns(ulMatch[2]),
          bullet: { level: 0 },
          spacing: { before: 40, after: 40 },
        })
      );
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^(\s*)\d+\.\s+(.+)/);
    if (olMatch) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "•  " }),
            ...inlineToRuns(olMatch[2]),
          ],
          indent: { left: 360 },
          spacing: { before: 40, after: 40 },
        })
      );
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      continue;
    }

    // Table
    if (line.includes("|") && i + 1 < lines.length && /^\|?[\s-:|]+\|?$/.test(lines[i + 1])) {
      const headers = line.split("|").map((c) => c.trim()).filter(Boolean);
      i++; // skip separator

      const rows: string[][] = [];
      while (i + 1 < lines.length && lines[i + 1].includes("|")) {
        i++;
        rows.push(lines[i].split("|").map((c) => c.trim()).filter(Boolean));
      }

      const colCount = headers.length;
      const colPct = Math.floor(100 / colCount);
      const table = new Table({
        rows: [
          // Header row
          new TableRow({
            tableHeader: true,
            children: headers.map(
              (h) =>
                new TableCell({
                  children: [new Paragraph({ children: inlineToRuns(h), spacing: { before: 40, after: 40 } })],
                  borders: cellBorders,
                  shading: { type: ShadingType.CLEAR, fill: "F0F0F0" },
                  width: { size: colPct, type: WidthType.PERCENTAGE },
                })
            ),
          }),
          // Data rows
          ...rows.map(
            (row) =>
              new TableRow({
                children: Array.from({ length: colCount }, (_, ci) =>
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: inlineToRuns(row[ci] || ""),
                        spacing: { before: 40, after: 40 },
                      }),
                    ],
                    borders: cellBorders,
                    width: { size: colPct, type: WidthType.PERCENTAGE },
                  })
                ),
              })
          ),
        ],
        width: { size: 100, type: WidthType.PERCENTAGE },
      });

      children.push(table as any);
      children.push(new Paragraph({ spacing: { before: 120 } }));
      continue;
    }

    // Image on its own line
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
    if (imgMatch) {
      const imgData = loadImageBuffer(imgMatch[2]);
      if (imgData) {
        const imgRunOpts: any = {
          data: imgData.buffer,
          transformation: { width: 400, height: 300 },
        };
        if (imgData.ext === "svg") {
          imgRunOpts.type = "svg";
          imgRunOpts.fallback = {
            data: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"),
            type: "png",
          };
        }
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new ImageRun(imgRunOpts)],
            spacing: { before: 120, after: 120 },
          })
        );
      } else {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: `[Image: ${imgMatch[1] || imgMatch[2]}]`, italics: true, color: "888888" })],
            spacing: { before: 60, after: 60 },
          })
        );
      }
      continue;
    }

    // Paragraph
    children.push(
      new Paragraph({
        children: inlineToRuns(line),
        spacing: { before: 60, after: 60 },
      })
    );
  }

  // Flush any remaining code block
  if (inCodeBlock && codeLines.length) {
    for (const codeLine of codeLines) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: codeLine || " ", font: "Courier New", size: 18 })],
          shading: { type: ShadingType.CLEAR, fill: "F5F5F5" },
          spacing: { before: 0, after: 0 },
          indent: { left: 360 },
        })
      );
    }
  }

  return children as Paragraph[];
}
