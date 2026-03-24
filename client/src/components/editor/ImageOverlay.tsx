import { useState, useEffect, useCallback } from "react";

interface ImageAction {
  x: number;
  y: number;
  src: string;
}

export function ImageOverlay({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const [action, setAction] = useState<ImageAction | null>(null);
  const [copied, setCopied] = useState(false);

  const handleClick = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "IMG") {
      e.preventDefault();
      const img = target as HTMLImageElement;
      const rect = img.getBoundingClientRect();
      setAction({
        x: rect.right - 120,
        y: rect.top + 4,
        src: img.getAttribute("src") || "",
      });
    } else if (!target.closest(".image-overlay-menu")) {
      setAction(null);
    }
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("click", handleClick);
    return () => el.removeEventListener("click", handleClick);
  }, [containerRef, handleClick]);

  if (!action) return null;

  const fullUrl = action.src.startsWith("/") ? `${window.location.origin}${action.src}` : action.src;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = action.src;
    a.download = action.src.split("/").pop() || "image";
    a.click();
  };

  const handleOpen = () => {
    window.open(fullUrl, "_blank");
  };

  return (
    <div
      className="image-overlay-menu fixed z-50 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[130px]"
      style={{ left: action.x, top: action.y }}
    >
      <button
        onClick={handleCopy}
        className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 flex items-center gap-2"
      >
        {copied ? "Copied!" : "Copy URL"}
      </button>
      <button
        onClick={handleDownload}
        className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 flex items-center gap-2"
      >
        Download
      </button>
      <button
        onClick={handleOpen}
        className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 flex items-center gap-2"
      >
        Open in Browser
      </button>
      <hr className="border-zinc-700 my-1" />
      <div className="px-3 py-1 text-[10px] text-zinc-500 font-mono truncate max-w-[250px]">
        {action.src}
      </div>
    </div>
  );
}
