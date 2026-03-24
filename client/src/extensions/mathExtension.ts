import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import katex from "katex";
import { useState, useCallback, useRef, useEffect } from "react";
import React from "react";

// ── Inline Math ($...$) ──

export const MathInline = Node.create({
  name: "mathInline",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      latex: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="math-inline"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-type": "math-inline" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathInlineView);
  },

  addInputRules() {
    return [
      {
        find: /(?<!\$)\$([^$\n]+)\$(?!\$)/,
        handler: ({ state, range, match }) => {
          const latex = match[1];
          const { tr } = state;
          tr.replaceWith(range.from, range.to, this.type.create({ latex }));
        },
      },
    ];
  },
});

// ── Block Math ($$...$$) ──

export const MathBlock = Node.create({
  name: "mathBlock",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      latex: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="math-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "math-block" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathBlockView);
  },

  addInputRules() {
    return [
      {
        find: /^\$\$([^$]+)\$\$$/,
        handler: ({ state, range, match }) => {
          const latex = match[1];
          const { tr } = state;
          tr.replaceWith(range.from, range.to, this.type.create({ latex }));
        },
      },
    ];
  },
});

// ── Render helpers ──

function renderKatex(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      output: "html",
      strict: false,
    });
  } catch {
    return `<span class="math-error" style="color: #f87171;">${latex}</span>`;
  }
}

// ── Export math as PNG image ──

/**
 * Render LaTeX to PNG by requesting a pure SVG from the server (MathJax,
 * no foreignObject, no external resources) and drawing it to a canvas.
 * Pure SVG → canvas does NOT taint the canvas.
 */
async function exportMathAsPng(
  latex: string,
  theme: "light" | "dark",
  scale: number = 3
): Promise<Blob> {
  // 1. Get pure SVG from server (MathJax vector output, fully self-contained)
  const resp = await fetch("/api/math/render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ latex, theme, fontSize: 22 }),
  });

  if (!resp.ok) {
    throw new Error(`Server render failed: ${resp.statusText}`);
  }

  const svgText = await resp.text();

  // 2. Parse SVG dimensions
  const wMatch = svgText.match(/width="(\d+)"/);
  const hMatch = svgText.match(/height="(\d+)"/);
  const w = wMatch ? parseInt(wMatch[1]) : 400;
  const h = hMatch ? parseInt(hMatch[1]) : 200;

  // 3. Load SVG as an image (pure SVG = no taint)
  const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);
  const img = new Image();

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = svgUrl;
  });

  // 4. Draw to canvas at high resolution
  const canvas = document.createElement("canvas");
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(svgUrl);

  return new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b!), "image/png");
  });
}

// ── Inline Math Node View ──

function MathInlineView(props: any) {
  const { node, updateAttributes, selected } = props;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(node.attrs.latex);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = useCallback(() => {
    updateAttributes({ latex: value });
    setEditing(false);
  }, [value, updateAttributes]);

  if (editing) {
    return React.createElement(
      NodeViewWrapper,
      { as: "span", className: "math-inline-edit" },
      React.createElement("input", {
        ref: inputRef,
        value,
        onChange: (e: any) => setValue(e.target.value),
        onKeyDown: (e: any) => {
          if (e.key === "Enter") handleSave();
          if (e.key === "Escape") { setValue(node.attrs.latex); setEditing(false); }
        },
        onBlur: handleSave,
        className: "bg-zinc-800 border border-blue-500 rounded px-1.5 py-0.5 text-xs font-mono text-zinc-200 outline-none",
        style: { minWidth: "60px", width: `${Math.max(60, value.length * 8)}px` },
        spellCheck: false,
      })
    );
  }

  const html = renderKatex(node.attrs.latex, false);
  return React.createElement(
    NodeViewWrapper,
    {
      as: "span",
      className: `math-inline-rendered cursor-pointer ${selected ? "ring-1 ring-blue-500 rounded" : ""}`,
      onDoubleClick: () => setEditing(true),
      title: "Double-click to edit: " + node.attrs.latex,
    },
    React.createElement("span", { dangerouslySetInnerHTML: { __html: html } })
  );
}

// ── Block Math Node View ──

function MathBlockView(props: any) {
  const { node, updateAttributes, selected } = props;
  const [editing, setEditing] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [value, setValue] = useState(node.attrs.latex);
  const [exporting, setExporting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [editing]);

  const handleSave = useCallback(() => {
    updateAttributes({ latex: value });
    setEditing(false);
  }, [value, updateAttributes]);

  const handleExport = useCallback(async (theme: "light" | "dark", action: "download" | "copy") => {
    setExporting(true);
    try {
      const blob = await exportMathAsPng(node.attrs.latex, theme);
      if (action === "download") {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `equation-${theme}.png`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
      }
    } catch (err) {
      console.error("Math export failed:", err);
    } finally {
      setExporting(false);
    }
  }, [node.attrs.latex]);

  if (editing) {
    return React.createElement(
      NodeViewWrapper,
      { className: "math-block-edit my-3" },
      React.createElement("textarea", {
        ref: textareaRef,
        value,
        onChange: (e: any) => setValue(e.target.value),
        onKeyDown: (e: any) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSave();
          if (e.key === "Escape") { setValue(node.attrs.latex); setEditing(false); }
        },
        className: "w-full bg-zinc-800 border border-blue-500 rounded-md px-3 py-2 text-sm font-mono text-zinc-200 outline-none resize-y",
        rows: Math.max(2, value.split("\n").length),
        spellCheck: false,
        placeholder: "LaTeX expression...",
      }),
      React.createElement(
        "div",
        { className: "flex justify-end gap-2 mt-1" },
        React.createElement("span", { className: "text-[10px] text-zinc-600 mr-auto mt-1" }, "Cmd+Enter to save, Esc to cancel"),
        React.createElement("button", {
          onClick: () => { setValue(node.attrs.latex); setEditing(false); },
          className: "text-xs text-zinc-500 px-2 py-1 rounded hover:bg-zinc-700",
        }, "Cancel"),
        React.createElement("button", {
          onClick: handleSave,
          className: "text-xs text-white bg-blue-600 px-2 py-1 rounded hover:bg-blue-500",
        }, "Save")
      )
    );
  }

  const html = renderKatex(node.attrs.latex, true);
  return React.createElement(
    NodeViewWrapper,
    {
      className: `math-block-rendered group/math my-3 py-2 text-center cursor-pointer rounded relative ${selected ? "ring-1 ring-blue-500" : "hover:bg-zinc-900/50"}`,
      onDoubleClick: () => setEditing(true),
    },
    // Rendered math
    React.createElement("div", { dangerouslySetInnerHTML: { __html: html } }),

    // Hover toolbar
    React.createElement(
      "div",
      {
        className: "absolute top-1 right-1 flex items-center gap-1 opacity-0 group-hover/math:opacity-100 transition-opacity",
      },
      React.createElement("button", {
        onClick: (e: any) => { e.stopPropagation(); setEditing(true); },
        className: "text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 border border-zinc-700",
        title: "Edit LaTeX",
      }, "Edit"),
      React.createElement("button", {
        onClick: (e: any) => { e.stopPropagation(); setShowExport(!showExport); },
        className: "text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 border border-zinc-700",
        title: "Export as image",
      }, "Export"),
    ),

    // Export dropdown
    showExport && React.createElement(
      "div",
      {
        className: "absolute top-8 right-1 z-50 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl p-3 text-left min-w-[200px]",
        onClick: (e: any) => e.stopPropagation(),
      },
      React.createElement("div", { className: "text-[10px] text-zinc-500 uppercase tracking-wider mb-2" }, "Export Equation as PNG"),

      // Light theme row
      React.createElement(
        "div",
        { className: "flex items-center gap-2 mb-1.5" },
        React.createElement("div", {
          className: "w-5 h-5 rounded border border-zinc-600 bg-white",
          style: { display: "flex", alignItems: "center", justifyContent: "center", fontSize: "8px", color: "#000" },
          dangerouslySetInnerHTML: { __html: "∑" },
        }),
        React.createElement("span", { className: "text-xs text-zinc-300 flex-1" }, "Light"),
        React.createElement("button", {
          onClick: () => handleExport("light", "copy"),
          disabled: exporting,
          className: "text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 disabled:opacity-50",
        }, "Copy"),
        React.createElement("button", {
          onClick: () => handleExport("light", "download"),
          disabled: exporting,
          className: "text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 disabled:opacity-50",
        }, "Save"),
      ),

      // Dark theme row
      React.createElement(
        "div",
        { className: "flex items-center gap-2" },
        React.createElement("div", {
          className: "w-5 h-5 rounded border border-zinc-600 bg-zinc-900",
          style: { display: "flex", alignItems: "center", justifyContent: "center", fontSize: "8px", color: "#f0f0f0" },
          dangerouslySetInnerHTML: { __html: "∑" },
        }),
        React.createElement("span", { className: "text-xs text-zinc-300 flex-1" }, "Dark"),
        React.createElement("button", {
          onClick: () => handleExport("dark", "copy"),
          disabled: exporting,
          className: "text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 disabled:opacity-50",
        }, "Copy"),
        React.createElement("button", {
          onClick: () => handleExport("dark", "download"),
          disabled: exporting,
          className: "text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 disabled:opacity-50",
        }, "Save"),
      ),

      React.createElement("div", { className: "text-[10px] text-zinc-600 mt-2" }, exporting ? "Exporting..." : "3× resolution for crisp output"),

      // Close
      React.createElement("button", {
        onClick: () => setShowExport(false),
        className: "absolute top-1 right-1 text-zinc-600 hover:text-zinc-300 text-xs px-1",
      }, "×"),
    ),

    // Click-away to close export
    showExport && React.createElement("div", {
      className: "fixed inset-0 z-40",
      onClick: () => setShowExport(false),
    }),
  );
}
