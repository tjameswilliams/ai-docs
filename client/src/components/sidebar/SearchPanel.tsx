import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../../api/client";
import { useStore } from "../../store";

interface SearchResult {
  documentId: string;
  documentTitle: string;
  folderId: string | null;
  chunkText: string;
  score: number;
}

export function SearchPanel({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const documents = useStore((s) => s.documents);
  const setActiveDocument = useStore((s) => s.setActiveDocument);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setResults([]);
        setSearched(false);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await api.searchDocuments(projectId, q);
        setResults(res);
        setSearched(true);
      } catch (err) {
        const msg = (err as Error).message;
        if (msg.includes("Embedding API error") || msg.includes("fetch failed")) {
          setError("Embedding API not available. Configure it in Settings.");
        } else {
          setError(msg);
        }
        setResults([]);
        setSearched(true);
      } finally {
        setLoading(false);
      }
    },
    [projectId]
  );

  const handleChange = (value: string) => {
    setQuery(value);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(value), 300);
  };

  const handleResultClick = (result: SearchResult) => {
    const doc = documents.find((d) => d.id === result.documentId);
    if (doc) {
      setActiveDocument(doc);
    }
  };

  return (
    <div className="border-b border-zinc-800 flex flex-col max-h-[50%]">
      <div className="flex items-center gap-1 px-2 pt-2 pb-1">
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "Enter") doSearch(query);
            }}
            placeholder="Semantic search..."
            className="w-full pl-6 pr-2 py-1 text-xs rounded bg-zinc-800 border border-zinc-700 focus:border-blue-500 focus:outline-none"
          />
          <svg
            className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="8" strokeWidth="2" />
            <path d="M21 21l-4.35-4.35" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-300 text-xs px-1"
        >
          ×
        </button>
      </div>

      {/* Results */}
      <div className="overflow-y-auto px-1 pb-1">
        {loading && (
          <div className="text-[10px] text-zinc-500 px-2 py-2 text-center">
            Searching...
          </div>
        )}

        {error && (
          <div className="text-[10px] text-red-400 px-2 py-2">{error}</div>
        )}

        {!loading && !error && searched && results.length === 0 && (
          <div className="text-[10px] text-zinc-500 px-2 py-2 text-center">
            No results found
          </div>
        )}

        {!loading && !error && !searched && query === "" && (
          <div className="text-[10px] text-zinc-600 px-2 py-2 text-center">
            Search across all documents using AI embeddings
          </div>
        )}

        {results.map((r, i) => (
          <button
            key={`${r.documentId}-${i}`}
            onClick={() => handleResultClick(r)}
            className="w-full text-left px-2 py-1.5 rounded hover:bg-zinc-800 group"
          >
            <div className="flex items-center gap-1">
              <span className="text-xs text-zinc-200 font-medium truncate flex-1">
                {r.documentTitle}
              </span>
              <span className="text-[9px] text-zinc-600 tabular-nums shrink-0">
                {(r.score * 100).toFixed(0)}%
              </span>
            </div>
            <div className="text-[10px] text-zinc-500 truncate mt-0.5 leading-tight">
              {r.chunkText.length > 120
                ? r.chunkText.slice(0, 120) + "..."
                : r.chunkText}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
