import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";

// Initialize MathJax once
const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

const tex = new TeX({ packages: AllPackages });
const svg = new SVG({ fontCache: "local" });
const mjDocument = mathjax.document("", { InputJax: tex, OutputJax: svg });

export interface MathRenderOptions {
  latex: string;
  theme: "light" | "dark";
  fontSize?: number; // default 22
}

/**
 * Render a LaTeX expression to a self-contained SVG string.
 * Uses MathJax's pure SVG output with embedded glyph paths —
 * no HTML, no fonts, no external references.
 */
export function renderMathSvg(opts: MathRenderOptions): string {
  const { latex, theme, fontSize = 22 } = opts;
  const fg = theme === "light" ? "#1a1a1a" : "#f0f0f0";
  const bg = theme === "light" ? "#ffffff" : "#1a1a1a";

  const node = mjDocument.convert(latex, { display: true });
  const innerSvg = adaptor.innerHTML(node);

  // MathJax SVG uses "ex" units. 1ex ≈ 0.44em at the given font size.
  const exSize = fontSize * 0.44;

  // Parse width/height in ex units from the inner SVG
  const wMatch = innerSvg.match(/width="([0-9.]+)ex"/);
  const hMatch = innerSvg.match(/height="([0-9.]+)ex"/);
  const vbMatch = innerSvg.match(/viewBox="([^"]+)"/);

  if (!wMatch || !hMatch || !vbMatch) {
    throw new Error("Failed to parse MathJax SVG output");
  }

  const contentW = parseFloat(wMatch[1]) * exSize;
  const contentH = parseFloat(hMatch[1]) * exSize;
  const viewBox = vbMatch[1];

  const padding = 28;
  const totalW = Math.ceil(contentW + padding * 2);
  const totalH = Math.ceil(contentH + padding * 2);

  // Extract everything inside the <svg>...</svg> (defs + paths)
  const svgContent = innerSvg
    .replace(/<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "");

  // Build outer SVG: background rect + positioned math content
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
    width="${totalW}" height="${totalH}">
  <rect width="${totalW}" height="${totalH}" rx="8" fill="${bg}"/>
  <svg x="${padding}" y="${padding}" width="${Math.ceil(contentW)}" height="${Math.ceil(contentH)}"
    viewBox="${viewBox}" fill="${fg}">
    ${svgContent}
  </svg>
</svg>`;
}
