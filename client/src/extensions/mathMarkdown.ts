/**
 * Pre/post-process markdown to handle $...$ and $$...$$ math syntax.
 *
 * Since tiptap-markdown doesn't natively understand LaTeX delimiters,
 * we convert them to/from HTML node representations that our TipTap
 * math extensions can parse.
 */

/**
 * Convert $...$ and $$...$$ in markdown to HTML tags before loading into TipTap.
 */
export function mathMarkdownToHtml(markdown: string): string {
  // Step 1: Handle block math ($$...$$) — may span multiple lines
  let result = processBlockMath(markdown);

  // Step 2: Handle inline math ($...$) — single line only, careful not to match inside words
  result = processInlineMath(result);

  return result;
}

function processBlockMath(text: string): string {
  const output: string[] = [];
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check for $$ opening
    if (trimmed.startsWith("$$")) {
      const afterOpen = trimmed.slice(2).trim();

      // Single-line: $$...$$
      if (afterOpen.endsWith("$$") && afterOpen.length > 2) {
        const latex = afterOpen.slice(0, -2).trim();
        output.push(`<div data-type="math-block" latex="${escapeAttr(latex)}"></div>`);
        i++;
        continue;
      }

      // Multi-line: collect until closing $$
      const mathLines: string[] = [];
      if (afterOpen) mathLines.push(afterOpen);
      i++;
      let closed = false;
      while (i < lines.length) {
        const mLine = lines[i].trim();
        if (mLine === "$$" || mLine.endsWith("$$")) {
          const lastContent = mLine === "$$" ? "" : mLine.slice(0, -2);
          if (lastContent) mathLines.push(lastContent);
          closed = true;
          i++;
          break;
        }
        mathLines.push(lines[i]);
        i++;
      }
      const latex = mathLines.join("\n").trim();
      if (latex) {
        output.push(`<div data-type="math-block" latex="${escapeAttr(latex)}"></div>`);
      }
      if (!closed) {
        // Unclosed $$ — output as-is
        output.push("$$" + latex);
      }
      continue;
    }

    output.push(line);
    i++;
  }

  return output.join("\n");
}

function processInlineMath(text: string): string {
  // Process line by line to avoid matching across line breaks
  return text.split("\n").map(processInlineMathLine).join("\n");
}

function processInlineMathLine(line: string): string {
  // Skip lines that are already HTML math blocks
  if (line.includes('data-type="math-block"') || line.includes('data-type="math-inline"')) {
    return line;
  }

  // Skip code blocks / fenced lines
  if (line.trim().startsWith("```") || line.trim().startsWith("    ")) {
    return line;
  }

  // Find $...$ pairs, scanning character by character to handle escapes
  const parts: string[] = [];
  let i = 0;

  while (i < line.length) {
    // Skip escaped dollar signs
    if (line[i] === "\\" && i + 1 < line.length && line[i + 1] === "$") {
      parts.push("\\$");
      i += 2;
      continue;
    }

    // Skip $$ (handled by block math)
    if (line[i] === "$" && i + 1 < line.length && line[i + 1] === "$") {
      parts.push("$$");
      i += 2;
      continue;
    }

    // Start of potential inline math
    if (line[i] === "$") {
      // Don't match if preceded by alphanumeric (e.g., "costs $5")
      if (i > 0 && /\w/.test(line[i - 1])) {
        parts.push("$");
        i++;
        continue;
      }

      // Find the closing $
      let j = i + 1;
      let found = false;
      while (j < line.length) {
        if (line[j] === "\\" && j + 1 < line.length) {
          j += 2; // skip escaped characters
          continue;
        }
        if (line[j] === "$") {
          // Don't match if followed by alphanumeric
          if (j + 1 < line.length && /\w/.test(line[j + 1])) {
            j++;
            continue;
          }
          // Must have at least 1 char of content
          if (j > i + 1) {
            found = true;
            break;
          }
        }
        j++;
      }

      if (found) {
        const latex = line.slice(i + 1, j);
        parts.push(`<span data-type="math-inline" latex="${escapeAttr(latex)}"></span>`);
        i = j + 1;
        continue;
      }
    }

    parts.push(line[i]);
    i++;
  }

  return parts.join("");
}

/**
 * Convert math HTML nodes back to $...$ and $$...$$ in markdown output.
 */
export function mathHtmlToMarkdown(html: string): string {
  let result = html;

  // Block math
  result = result.replace(
    /<div data-type="math-block"[^>]*latex="([^"]*)"[^>]*>(?:<\/div>)?/g,
    (_match, latex) => `$$\n${unescapeAttr(latex)}\n$$`
  );

  // Inline math
  result = result.replace(
    /<span data-type="math-inline"[^>]*latex="([^"]*)"[^>]*>(?:<\/span>)?/g,
    (_match, latex) => `$${unescapeAttr(latex)}$`
  );

  return result;
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function unescapeAttr(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
