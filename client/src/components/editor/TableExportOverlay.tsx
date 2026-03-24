import { useState, useEffect, useCallback, useRef } from "react";

interface TablePosition {
  tableEl: HTMLTableElement;
  top: number;
  right: number;
}

interface ExportDropdown {
  top: number;
  right: number;
  rows: { text: string; isHeader: boolean }[][];
}

export function TableExportOverlay({
  containerRef,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [hovered, setHovered] = useState<TablePosition | null>(null);
  const [dropdown, setDropdown] = useState<ExportDropdown | null>(null);
  const [exporting, setExporting] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  // Track mouse over tables — listen on document so we catch the
  // export button (which is positioned outside the table element)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Hovering inside the export controls — keep showing
      if (target.closest(".table-export-controls")) {
        clearTimeout(hideTimer.current);
        return;
      }

      const tableEl = target.closest("table") as HTMLTableElement | null;

      if (tableEl && el.contains(tableEl)) {
        clearTimeout(hideTimer.current);
        const rect = tableEl.getBoundingClientRect();
        setHovered({ tableEl, top: rect.top, right: rect.right });
      } else {
        // Longer delay so user can move to the button
        hideTimer.current = setTimeout(() => setHovered(null), 400);
      }
    };

    document.addEventListener("mousemove", onMove);
    return () => document.removeEventListener("mousemove", onMove);
  }, [containerRef]);

  const extractTableData = useCallback(
    (tableEl: HTMLTableElement): { text: string; isHeader: boolean }[][] => {
      const rows: { text: string; isHeader: boolean }[][] = [];
      for (const tr of tableEl.querySelectorAll("tr")) {
        const cells: { text: string; isHeader: boolean }[] = [];
        for (const cell of tr.querySelectorAll("th, td")) {
          cells.push({
            text: (cell.textContent || "").trim(),
            isHeader: cell.tagName === "TH",
          });
        }
        if (cells.length) rows.push(cells);
      }
      return rows;
    },
    []
  );

  const handleExport = useCallback(
    async (
      rows: { text: string; isHeader: boolean }[][],
      theme: "light" | "dark",
      action: "download" | "copy"
    ) => {
      setExporting(true);
      try {
        const resp = await fetch("/api/table/render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows, theme, fontSize: 14 }),
        });
        if (!resp.ok) throw new Error(resp.statusText);

        const svgText = await resp.text();

        // Parse dimensions
        const wMatch = svgText.match(/width="(\d+)"/);
        const hMatch = svgText.match(/height="(\d+)"/);
        const w = wMatch ? parseInt(wMatch[1]) : 400;
        const h = hMatch ? parseInt(hMatch[1]) : 200;

        // SVG → canvas → PNG (pure SVG, no taint)
        const scale = 3;
        const svgBlob = new Blob([svgText], {
          type: "image/svg+xml;charset=utf-8",
        });
        const svgUrl = URL.createObjectURL(svgBlob);
        const img = new Image();

        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = reject;
          img.src = svgUrl;
        });

        const canvas = document.createElement("canvas");
        canvas.width = w * scale;
        canvas.height = h * scale;
        const ctx = canvas.getContext("2d")!;
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(svgUrl);

        const blob = await new Promise<Blob>((resolve) =>
          canvas.toBlob((b) => resolve(b!), "image/png")
        );

        if (action === "download") {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `table-${theme}.png`;
          a.click();
          URL.revokeObjectURL(url);
        } else {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
          ]);
        }
      } catch (err) {
        console.error("Table export failed:", err);
      } finally {
        setExporting(false);
      }
    },
    []
  );

  const showDropdown = useCallback(() => {
    if (!hovered) return;
    const rows = extractTableData(hovered.tableEl);
    setDropdown({ top: hovered.top, right: hovered.right, rows });
  }, [hovered, extractTableData]);

  // Render the hover button
  if (!hovered && !dropdown) return null;

  return (
    <>
      {/* Export button — inside the table's top-right corner so the mouse
           doesn't leave the table to reach it */}
      {hovered && !dropdown && (
        <button
          className="table-export-controls fixed z-40 text-[10px] px-2 py-1 rounded bg-zinc-800/90 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 border border-zinc-700 backdrop-blur-sm shadow-lg"
          style={{ top: hovered.top + 4, left: hovered.right - 56 }}
          onMouseEnter={() => clearTimeout(hideTimer.current)}
          onClick={showDropdown}
          title="Export table as image"
        >
          Export
        </button>
      )}

      {/* Export dropdown */}
      {dropdown && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setDropdown(null)}
          />
          <div
            className="table-export-controls fixed z-50 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl p-3 text-left min-w-[200px]"
            style={{ top: dropdown.top - 4, left: dropdown.right + 8 }}
          >
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">
              Export Table as PNG
            </div>

            {/* Light theme */}
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-5 h-5 rounded border border-zinc-600 bg-white flex items-center justify-center">
                <svg
                  width="11"
                  height="9"
                  viewBox="0 0 11 9"
                  fill="none"
                  stroke="#333"
                  strokeWidth="1"
                >
                  <rect x="0.5" y="0.5" width="10" height="8" rx="1" />
                  <line x1="4" y1="0.5" x2="4" y2="8.5" />
                  <line x1="0.5" y1="3" x2="10.5" y2="3" />
                </svg>
              </div>
              <span className="text-xs text-zinc-300 flex-1">Light</span>
              <button
                onClick={() => handleExport(dropdown.rows, "light", "copy")}
                disabled={exporting}
                className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 disabled:opacity-50"
              >
                Copy
              </button>
              <button
                onClick={() =>
                  handleExport(dropdown.rows, "light", "download")
                }
                disabled={exporting}
                className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 disabled:opacity-50"
              >
                Save
              </button>
            </div>

            {/* Dark theme */}
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded border border-zinc-600 bg-zinc-900 flex items-center justify-center">
                <svg
                  width="11"
                  height="9"
                  viewBox="0 0 11 9"
                  fill="none"
                  stroke="#888"
                  strokeWidth="1"
                >
                  <rect x="0.5" y="0.5" width="10" height="8" rx="1" />
                  <line x1="4" y1="0.5" x2="4" y2="8.5" />
                  <line x1="0.5" y1="3" x2="10.5" y2="3" />
                </svg>
              </div>
              <span className="text-xs text-zinc-300 flex-1">Dark</span>
              <button
                onClick={() => handleExport(dropdown.rows, "dark", "copy")}
                disabled={exporting}
                className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 disabled:opacity-50"
              >
                Copy
              </button>
              <button
                onClick={() =>
                  handleExport(dropdown.rows, "dark", "download")
                }
                disabled={exporting}
                className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 disabled:opacity-50"
              >
                Save
              </button>
            </div>

            <div className="text-[10px] text-zinc-600 mt-2">
              {exporting ? "Exporting..." : "3× resolution for crisp output"}
            </div>

            <button
              onClick={() => setDropdown(null)}
              className="absolute top-1 right-1 text-zinc-600 hover:text-zinc-300 text-xs px-1"
            >
              ×
            </button>
          </div>
        </>
      )}
    </>
  );
}
