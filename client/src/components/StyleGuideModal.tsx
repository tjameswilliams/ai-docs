import { useState, useEffect, useRef } from "react";
import { useStore } from "../store";
import { api } from "../api/client";

interface StyleSource {
  id: string;
  type: string;
  name: string;
  wordCount: number;
  url?: string;
  createdAt: string;
}

export function StyleGuideModal() {
  const project = useStore((s) => s.project);
  const documents = useStore((s) => s.documents);
  const setShowStyleGuide = useStore((s) => s.setShowStyleGuide);

  const [sources, setSources] = useState<StyleSource[]>([]);
  const [guide, setGuide] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editGuide, setEditGuide] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"guide" | "sources">("sources");

  // Add source form state
  const [addMode, setAddMode] = useState<"none" | "url" | "paste" | "file" | "document">("none");
  const [urlInput, setUrlInput] = useState("");
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteContent, setPasteContent] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pid = project?.id;

  useEffect(() => {
    if (!pid) return;
    setIsLoading(true);
    Promise.all([
      api.listStyleSources(pid),
      api.getStyleProfile(pid),
    ]).then(([s, p]) => {
      setSources(s);
      setGuide(p.guide);
      setEditGuide(p.guide || "");
      // Show guide tab if profile exists, sources tab if not
      if (p.guide) setTab("guide");
    }).finally(() => setIsLoading(false));
  }, [pid]);

  const refreshSources = async () => {
    if (!pid) return;
    const s = await api.listStyleSources(pid);
    setSources(s);
  };

  const handleAddUrl = async () => {
    if (!pid || !urlInput.trim()) return;
    setIsAdding(true);
    setError(null);
    try {
      await api.addStyleSourceUrl(pid, urlInput.trim());
      setUrlInput("");
      setAddMode("none");
      await refreshSources();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsAdding(false);
    }
  };

  const handleAddPaste = async () => {
    if (!pid || !pasteContent.trim()) return;
    setIsAdding(true);
    setError(null);
    try {
      await api.addStyleSourceText(pid, {
        name: pasteTitle.trim() || "Pasted Sample",
        content: pasteContent.trim(),
      });
      setPasteTitle("");
      setPasteContent("");
      setAddMode("none");
      await refreshSources();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsAdding(false);
    }
  };

  const handleAddFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!pid || !e.target.files?.[0]) return;
    setIsAdding(true);
    setError(null);
    try {
      await api.uploadStyleSource(pid, e.target.files[0]);
      setAddMode("none");
      await refreshSources();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsAdding(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAddDocument = async (docId: string) => {
    if (!pid) return;
    setIsAdding(true);
    setError(null);
    try {
      await api.addStyleSourceDocument(pid, docId);
      setAddMode("none");
      await refreshSources();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteSource = async (id: string) => {
    await api.deleteStyleSource(id);
    await refreshSources();
  };

  const handleGenerate = async () => {
    if (!pid) return;
    setIsGenerating(true);
    setError(null);
    try {
      const result = await api.generateStyleProfile(pid);
      setGuide(result.guide);
      setEditGuide(result.guide);
      setTab("guide");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!pid) return;
    await api.updateStyleProfile(pid, editGuide);
    setGuide(editGuide);
    setIsEditing(false);
  };

  const totalWords = sources.reduce((sum, s) => sum + (s.wordCount || 0), 0);

  // Docs not already added as sources
  const existingDocIds = new Set(sources.filter((s) => s.type === "document").map((s) => (s as any).documentId));
  const availableDocs = documents.filter((d) => !existingDocIds.has(d.id) && (d.wordCount ?? 0) > 50);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowStyleGuide(false)}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg w-[600px] max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 pt-5 pb-3">
          <h2 className="text-lg font-semibold">Writing Style Guide</h2>
          <p className="text-xs text-zinc-500 mt-1">
            Add writing samples to teach the AI your voice and style.
          </p>
        </div>

        {/* Tabs */}
        <div className="px-6 flex gap-4 border-b border-zinc-800">
          <button
            onClick={() => setTab("sources")}
            className={`pb-2 text-sm border-b-2 transition-colors ${tab === "sources" ? "border-blue-500 text-zinc-200" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}
          >
            Sources ({sources.length})
          </button>
          <button
            onClick={() => setTab("guide")}
            className={`pb-2 text-sm border-b-2 transition-colors ${tab === "guide" ? "border-blue-500 text-zinc-200" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}
          >
            Generated Guide
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {isLoading ? (
            <div className="text-center text-zinc-500 text-sm py-8">Loading...</div>
          ) : tab === "sources" ? (
            <div className="space-y-3">
              {/* Source list */}
              {sources.length > 0 && (
                <div className="space-y-1">
                  {sources.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 px-3 py-2 rounded bg-zinc-800/50 text-sm">
                      <span className="text-zinc-500 text-xs shrink-0">
                        {s.type === "url" ? "🔗" : s.type === "document" ? "📄" : "📝"}
                      </span>
                      <span className="truncate text-zinc-300 flex-1">{s.name}</span>
                      <span className="text-[10px] text-zinc-600 shrink-0">{s.wordCount?.toLocaleString()} words</span>
                      <button
                        onClick={() => handleDeleteSource(s.id)}
                        className="text-zinc-600 hover:text-red-400 text-xs shrink-0 px-1"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <div className="text-[11px] text-zinc-600 pt-1">
                    {sources.length} source{sources.length !== 1 ? "s" : ""} · {totalWords.toLocaleString()} total words
                  </div>
                </div>
              )}

              {sources.length === 0 && addMode === "none" && (
                <div className="text-center py-6 text-zinc-500 text-sm">
                  No writing samples yet. Add some to generate your style guide.
                </div>
              )}

              {/* Add source buttons */}
              {addMode === "none" && (
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => setAddMode("url")} className="text-xs px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
                    + From URL
                  </button>
                  <button onClick={() => setAddMode("paste")} className="text-xs px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
                    + Paste Text
                  </button>
                  <button onClick={() => setAddMode("file")} className="text-xs px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
                    + Upload File
                  </button>
                  {availableDocs.length > 0 && (
                    <button onClick={() => setAddMode("document")} className="text-xs px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
                      + From Project Doc
                    </button>
                  )}
                </div>
              )}

              {/* URL input */}
              {addMode === "url" && (
                <div className="space-y-2">
                  <input
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddUrl()}
                    placeholder="https://example.com/your-article"
                    autoFocus
                    className="w-full px-3 py-2 text-sm rounded bg-zinc-800 border border-zinc-700 focus:border-blue-500 focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <button onClick={handleAddUrl} disabled={isAdding} className="text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50">
                      {isAdding ? "Fetching..." : "Add URL"}
                    </button>
                    <button onClick={() => setAddMode("none")} className="text-xs px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400">Cancel</button>
                  </div>
                </div>
              )}

              {/* Paste input */}
              {addMode === "paste" && (
                <div className="space-y-2">
                  <input
                    value={pasteTitle}
                    onChange={(e) => setPasteTitle(e.target.value)}
                    placeholder="Sample name (optional)"
                    autoFocus
                    className="w-full px-3 py-1.5 text-sm rounded bg-zinc-800 border border-zinc-700 focus:border-blue-500 focus:outline-none"
                  />
                  <textarea
                    value={pasteContent}
                    onChange={(e) => setPasteContent(e.target.value)}
                    placeholder="Paste your writing sample here..."
                    rows={6}
                    className="w-full px-3 py-2 text-sm rounded bg-zinc-800 border border-zinc-700 focus:border-blue-500 focus:outline-none resize-none"
                  />
                  <div className="flex gap-2">
                    <button onClick={handleAddPaste} disabled={isAdding} className="text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50">
                      {isAdding ? "Adding..." : "Add Sample"}
                    </button>
                    <button onClick={() => setAddMode("none")} className="text-xs px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400">Cancel</button>
                  </div>
                </div>
              )}

              {/* File upload */}
              {addMode === "file" && (
                <div className="space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md,.markdown,.doc,.docx,.rtf"
                    onChange={handleAddFile}
                    className="text-sm text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:bg-zinc-800 file:text-zinc-300 hover:file:bg-zinc-700"
                  />
                  <button onClick={() => setAddMode("none")} className="text-xs px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400">Cancel</button>
                </div>
              )}

              {/* Document picker */}
              {addMode === "document" && (
                <div className="space-y-1">
                  <p className="text-xs text-zinc-500 mb-2">Select a project document:</p>
                  {availableDocs.map((doc) => (
                    <button
                      key={doc.id}
                      onClick={() => handleAddDocument(doc.id)}
                      disabled={isAdding}
                      className="w-full text-left flex items-center gap-2 px-3 py-1.5 rounded text-sm hover:bg-zinc-800 text-zinc-300 disabled:opacity-50"
                    >
                      <span className="truncate flex-1">{doc.title}</span>
                      <span className="text-[10px] text-zinc-600 shrink-0">{doc.wordCount} words</span>
                    </button>
                  ))}
                  <button onClick={() => setAddMode("none")} className="text-xs px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 mt-2">Cancel</button>
                </div>
              )}

              {error && (
                <div className="text-xs text-red-400 bg-red-900/20 rounded px-3 py-2">{error}</div>
              )}
            </div>
          ) : (
            /* Guide tab */
            <div className="space-y-3">
              {guide ? (
                isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      value={editGuide}
                      onChange={(e) => setEditGuide(e.target.value)}
                      rows={20}
                      className="w-full px-3 py-2 text-sm rounded bg-zinc-800 border border-zinc-700 focus:border-blue-500 focus:outline-none resize-none font-mono leading-relaxed"
                    />
                    <div className="flex gap-2">
                      <button onClick={handleSaveEdit} className="text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500">Save</button>
                      <button onClick={() => { setIsEditing(false); setEditGuide(guide); }} className="text-xs px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="chat-markdown text-sm leading-relaxed whitespace-pre-wrap bg-zinc-800/30 rounded-lg px-4 py-3 max-h-[50vh] overflow-auto">
                      {guide}
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => setIsEditing(true)} className="text-xs px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300">Edit</button>
                      <button onClick={handleGenerate} disabled={isGenerating || sources.length === 0} className="text-xs px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-50">
                        {isGenerating ? "Regenerating..." : "Regenerate"}
                      </button>
                    </div>
                  </div>
                )
              ) : (
                <div className="text-center py-8">
                  <p className="text-zinc-500 text-sm mb-3">
                    {sources.length === 0
                      ? "Add writing samples first, then generate your style guide."
                      : `Ready to analyze ${sources.length} source${sources.length !== 1 ? "s" : ""} (${totalWords.toLocaleString()} words).`}
                  </p>
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating || sources.length === 0}
                    className="text-sm px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
                  >
                    {isGenerating ? "Analyzing writing style..." : "Generate Style Guide"}
                  </button>
                </div>
              )}

              {error && (
                <div className="text-xs text-red-400 bg-red-900/20 rounded px-3 py-2">{error}</div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-zinc-800 flex items-center justify-between">
          {tab === "sources" && sources.length > 0 && (
            <button
              onClick={handleGenerate}
              disabled={isGenerating || sources.length === 0}
              className="text-xs px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
            >
              {isGenerating ? "Analyzing..." : guide ? "Regenerate Style Guide" : "Generate Style Guide"}
            </button>
          )}
          {tab !== "sources" && <div />}
          <button onClick={() => setShowStyleGuide(false)} className="text-xs px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
