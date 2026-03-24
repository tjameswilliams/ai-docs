export interface TableCell {
  text: string;
  isHeader: boolean;
}

export interface TableRenderOptions {
  rows: TableCell[][];
  theme: "light" | "dark";
  fontSize?: number;
}

/**
 * Render a table as a self-contained SVG.
 * All text is rendered as <text> elements — no fonts, no external refs.
 */
export function renderTableSvg(opts: TableRenderOptions): string {
  const { rows, theme, fontSize = 14 } = opts;
  if (!rows.length) throw new Error("Empty table");

  const fg = theme === "light" ? "#1a1a1a" : "#f0f0f0";
  const bg = theme === "light" ? "#ffffff" : "#1a1a1a";
  const headerBg = theme === "light" ? "#f0f0f0" : "#2a2a2a";
  const borderColor = theme === "light" ? "#d4d4d8" : "#3f3f46";
  const headerFg = fg;

  const paddingX = 16;
  const paddingY = 10;
  const cellPadX = 12;
  const cellPadY = 8;
  const charWidth = fontSize * 0.6; // Approximate monospace-ish width
  const rowHeight = fontSize + cellPadY * 2;

  // Calculate column count
  const colCount = Math.max(...rows.map((r) => r.length));

  // Calculate column widths based on content
  const colWidths: number[] = [];
  for (let c = 0; c < colCount; c++) {
    let maxLen = 0;
    for (const row of rows) {
      const cell = row[c];
      if (cell) {
        maxLen = Math.max(maxLen, cell.text.length);
      }
    }
    colWidths.push(Math.max(60, maxLen * charWidth + cellPadX * 2));
  }

  const tableW = colWidths.reduce((a, b) => a + b, 0);
  const tableH = rows.length * rowHeight;
  const totalW = Math.ceil(tableW + paddingX * 2);
  const totalH = Math.ceil(tableH + paddingY * 2);

  const elements: string[] = [];

  // Background
  elements.push(`<rect width="${totalW}" height="${totalH}" rx="8" fill="${bg}"/>`);

  // Rows and cells
  let y = paddingY;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const isHeaderRow = row.some((c) => c.isHeader);
    let x = paddingX;

    // Header row background
    if (isHeaderRow) {
      const ry = r === 0 ? 4 : 0;
      elements.push(
        `<rect x="${paddingX}" y="${y}" width="${tableW}" height="${rowHeight}" rx="${ry}" fill="${headerBg}"/>`
      );
    }

    for (let c = 0; c < colCount; c++) {
      const cell = row[c];
      const w = colWidths[c];
      const text = cell?.text || "";
      const isHeader = cell?.isHeader || false;

      // Cell border (right)
      if (c < colCount - 1) {
        elements.push(
          `<line x1="${x + w}" y1="${y}" x2="${x + w}" y2="${y + rowHeight}" stroke="${borderColor}" stroke-width="1"/>`
        );
      }

      // Cell text
      if (text) {
        const textX = x + cellPadX;
        const textY = y + rowHeight / 2;
        const weight = isHeader ? "bold" : "normal";
        const escapedText = escSvg(text);
        elements.push(
          `<text x="${textX}" y="${textY}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="${fontSize}" font-weight="${weight}" fill="${isHeader ? headerFg : fg}" dominant-baseline="central">${escapedText}</text>`
        );
      }

      x += w;
    }

    // Row border (bottom)
    if (r < rows.length - 1) {
      const strokeW = rows[r].some((c) => c.isHeader) ? 2 : 1;
      elements.push(
        `<line x1="${paddingX}" y1="${y + rowHeight}" x2="${paddingX + tableW}" y2="${y + rowHeight}" stroke="${borderColor}" stroke-width="${strokeW}"/>`
      );
    }

    y += rowHeight;
  }

  // Outer table border
  elements.push(
    `<rect x="${paddingX}" y="${paddingY}" width="${tableW}" height="${tableH}" rx="4" fill="none" stroke="${borderColor}" stroke-width="1"/>`
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}">
${elements.join("\n")}
</svg>`;
}

function escSvg(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
