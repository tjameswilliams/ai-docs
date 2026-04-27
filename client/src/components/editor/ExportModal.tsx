import { useState, useRef, useEffect } from "react";
import { Button, IconButton } from "../ui";

interface ExportModalProps {
  documentId: string;
  documentTitle: string;
  onClose: () => void;
}

type PageSize = "letter" | "a4" | "legal";
type Orientation = "portrait" | "landscape";

export function ExportModal({ documentId, documentTitle, onClose }: ExportModalProps) {
  const [pageSize, setPageSize] = useState<PageSize>("letter");
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [fontSize, setFontSize] = useState("11");
  const [margins, setMargins] = useState("1");
  const [includeTitle, setIncludeTitle] = useState(true);
  const [loading, setLoading] = useState(true);
  const [htmlContent, setHtmlContent] = useState("");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Load the HTML content
  useEffect(() => {
    fetch(`/api/documents/${documentId}/export/html`)
      .then((res) => res.text())
      .then((html) => {
        setHtmlContent(html);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [documentId]);

  // Update preview when settings change
  useEffect(() => {
    if (!htmlContent || !iframeRef.current) return;
    const modified = applySettings(htmlContent, { pageSize, orientation, fontSize, margins, includeTitle, documentTitle });
    const iframe = iframeRef.current;
    const doc = iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(modified);
      doc.close();
    }
  }, [htmlContent, pageSize, orientation, fontSize, margins, includeTitle, documentTitle]);

  const handlePrintPdf = () => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    // Wait for all images to load before triggering print
    const images = iframe.contentDocument?.querySelectorAll("img") || [];
    const unloaded = Array.from(images).filter((img) => !img.complete);
    if (unloaded.length > 0) {
      let remaining = unloaded.length;
      const onReady = () => {
        remaining--;
        if (remaining <= 0) iframe.contentWindow!.print();
      };
      unloaded.forEach((img) => {
        img.addEventListener("load", onReady);
        img.addEventListener("error", onReady);
      });
      // Fallback: print after 3s regardless
      setTimeout(() => iframe.contentWindow!.print(), 3000);
    } else {
      iframe.contentWindow.print();
    }
  };

  const handleDownloadPdf = () => {
    window.open(`/api/documents/${documentId}/export/pdf`, "_blank");
  };

  const handleDownloadHtml = () => {
    const modified = applySettings(htmlContent, { pageSize, orientation, fontSize, margins, includeTitle, documentTitle });
    const blob = new Blob([modified], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${documentTitle}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadMarkdown = () => {
    window.open(`/api/documents/${documentId}/export/markdown`, "_blank");
  };

  const handleDownloadDocx = () => {
    window.open(`/api/documents/${documentId}/export/docx`, "_blank");
  };

  const handleCopyHtml = async () => {
    const modified = applySettings(htmlContent, { pageSize, orientation, fontSize, margins, includeTitle, documentTitle });
    // Extract just the article content
    const match = modified.match(/<article>([\s\S]*)<\/article>/);
    if (match) {
      await navigator.clipboard.writeText(match[1].trim());
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="w-[900px] max-w-[95vw] h-[85vh] flex flex-col overflow-hidden"
        style={{
          background: "#1f1f23",
          border: "1px solid #3f3f46",
          borderRadius: 8,
          boxShadow: "var(--shadow-modal)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 shrink-0"
          style={{ height: 44, borderBottom: "1px solid #27272a" }}
        >
          <h2 style={{ fontSize: 13, fontWeight: 500, color: "#fafafa" }}>Export Document</h2>
          <IconButton icon="x" size="sm" tooltip="Close" onClick={onClose} />
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Settings panel */}
          <div className="w-[220px] shrink-0 border-r border-zinc-800 p-4 space-y-4 overflow-auto">
            <Section title="Page Size">
              <select value={pageSize} onChange={(e) => setPageSize(e.target.value as PageSize)} className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="letter">US Letter (8.5 × 11)</option>
                <option value="a4">A4 (210 × 297mm)</option>
                <option value="legal">US Legal (8.5 × 14)</option>
              </select>
            </Section>

            <Section title="Orientation">
              <div className="flex gap-2">
                <button
                  onClick={() => setOrientation("portrait")}
                  className={`flex-1 py-1.5 text-xs rounded ${orientation === "portrait" ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}
                >
                  Portrait
                </button>
                <button
                  onClick={() => setOrientation("landscape")}
                  className={`flex-1 py-1.5 text-xs rounded ${orientation === "landscape" ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}
                >
                  Landscape
                </button>
              </div>
            </Section>

            <Section title="Font Size">
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="8"
                  max="16"
                  value={fontSize}
                  onChange={(e) => setFontSize(e.target.value)}
                  className="flex-1 accent-blue-500"
                />
                <span className="text-xs text-zinc-400 w-8 text-right">{fontSize}pt</span>
              </div>
            </Section>

            <Section title="Margins">
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0.25"
                  max="1.5"
                  step="0.25"
                  value={margins}
                  onChange={(e) => setMargins(e.target.value)}
                  className="flex-1 accent-blue-500"
                />
                <span className="text-xs text-zinc-400 w-8 text-right">{margins}in</span>
              </div>
            </Section>

            <Section title="Options">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeTitle}
                  onChange={(e) => setIncludeTitle(e.target.checked)}
                  className="accent-blue-500"
                />
                <span className="text-xs text-zinc-300">Include title</span>
              </label>
            </Section>

            <div className="pt-3 space-y-1.5" style={{ borderTop: "1px solid #27272a" }}>
              <Button variant="primary" size="sm" icon="download" onClick={handleDownloadPdf} className="w-full">Download PDF</Button>
              <Button variant="panel" size="sm" onClick={handleDownloadDocx} className="w-full">Download Word (.docx)</Button>
              <Button variant="panel" size="sm" onClick={handleDownloadHtml} className="w-full">Download HTML</Button>
              <Button variant="panel" size="sm" onClick={handlePrintPdf} className="w-full">Print</Button>
              <Button variant="panel" size="sm" onClick={handleDownloadMarkdown} className="w-full">Download Markdown</Button>
              <Button variant="ghost" size="sm" icon="copy" onClick={handleCopyHtml} className="w-full">Copy HTML</Button>
            </div>
          </div>

          {/* Preview */}
          <div className="flex-1 bg-zinc-950 overflow-auto flex items-start justify-center p-6">
            {loading ? (
              <div className="text-zinc-500 text-sm mt-20">Loading preview...</div>
            ) : (
              <div
                className="bg-white rounded shadow-2xl overflow-hidden"
                style={{
                  width: getPreviewWidth(pageSize, orientation),
                  minHeight: getPreviewHeight(pageSize, orientation),
                }}
              >
                <iframe
                  ref={iframeRef}
                  className="w-full h-full border-0"
                  style={{ minHeight: getPreviewHeight(pageSize, orientation) }}
                  title="Export Preview"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1.5">{title}</label>
      {children}
    </div>
  );
}

function getPreviewWidth(size: PageSize, orientation: Orientation): number {
  const sizes = { letter: [612, 792], a4: [595, 842], legal: [612, 1008] };
  const [w, h] = sizes[size];
  return orientation === "portrait" ? Math.round(w * 0.85) : Math.round(h * 0.65);
}

function getPreviewHeight(size: PageSize, orientation: Orientation): number {
  const sizes = { letter: [612, 792], a4: [595, 842], legal: [612, 1008] };
  const [w, h] = sizes[size];
  return orientation === "portrait" ? Math.round(h * 0.85) : Math.round(w * 0.85);
}

function applySettings(
  html: string,
  opts: {
    pageSize: PageSize;
    orientation: Orientation;
    fontSize: string;
    margins: string;
    includeTitle: boolean;
    documentTitle: string;
  }
): string {
  let result = html;

  // Replace @page rules
  const pageSizeCSS = opts.pageSize === "a4" ? "A4" : opts.pageSize === "legal" ? "legal" : "letter";
  result = result.replace(
    /@page\s*\{[^}]*\}/,
    `@page { margin: ${opts.margins}in; size: ${pageSizeCSS} ${opts.orientation}; }`
  );

  // Replace font size
  result = result.replace(
    /body\s*\{([^}]*?)font-size:\s*[\d.]+pt/,
    `body {$1font-size: ${opts.fontSize}pt`
  );

  // Add or remove title
  if (opts.includeTitle) {
    // Add title before article content if not already there
    if (!result.includes('<h1 class="doc-title">')) {
      result = result.replace(
        "<article>",
        `<article>\n<h1 class="doc-title" style="font-size: ${Math.round(parseInt(opts.fontSize) * 2.2)}pt; margin-bottom: 16pt; border-bottom: 2px solid #333; padding-bottom: 8pt;">${escapeHtml(opts.documentTitle)}</h1>`
      );
    }
  } else {
    // Remove the injected title
    result = result.replace(/<h1 class="doc-title"[^>]*>.*?<\/h1>\n?/, "");
  }

  return result;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
