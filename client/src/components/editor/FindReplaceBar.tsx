import { useState, useRef, useEffect, useCallback } from "react";
import type { Editor } from "@tiptap/react";

interface FindReplaceBarProps {
  editor: Editor | null;
  onClose: () => void;
}

export function FindReplaceBar({ editor, onClose }: FindReplaceBarProps) {
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatch, setCurrentMatch] = useState(0);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [showReplace, setShowReplace] = useState(true);
  const findInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    findInputRef.current?.focus();
  }, []);

  // Find all matches in the editor text
  const getMatches = useCallback((): Array<{ from: number; to: number }> => {
    if (!editor || !findText) return [];

    const doc = editor.state.doc;
    const text = doc.textBetween(0, doc.content.size, "\n");
    const search = caseSensitive ? findText : findText.toLowerCase();
    const haystack = caseSensitive ? text : text.toLowerCase();

    const matches: Array<{ from: number; to: number }> = [];
    let offset = 0;

    // Map text positions back to ProseMirror positions
    // We need to walk the doc to find actual positions
    const textContent: Array<{ text: string; pos: number }> = [];
    doc.descendants((node, pos) => {
      if (node.isText && node.text) {
        textContent.push({ text: node.text, pos });
      }
      return true;
    });

    // Build a flat text with position mapping
    let flatText = "";
    const posMap: number[] = []; // flatText index -> PM position

    for (const { text: t, pos } of textContent) {
      for (let i = 0; i < t.length; i++) {
        posMap.push(pos + i);
        flatText += t[i];
      }
      // Add newline between text blocks for matching across nodes
    }

    const flatSearch = caseSensitive ? findText : findText.toLowerCase();
    const flatHaystack = caseSensitive ? flatText : flatText.toLowerCase();

    let idx = 0;
    while (idx < flatHaystack.length) {
      const found = flatHaystack.indexOf(flatSearch, idx);
      if (found === -1) break;
      const from = posMap[found];
      const to = posMap[found + flatSearch.length - 1] + 1;
      matches.push({ from, to });
      idx = found + 1;
    }

    return matches;
  }, [editor, findText, caseSensitive]);

  // Update match count whenever find text changes
  useEffect(() => {
    const matches = getMatches();
    setMatchCount(matches.length);
    if (matches.length > 0) {
      setCurrentMatch(1);
      highlightMatch(matches[0]);
    } else {
      setCurrentMatch(0);
    }
  }, [findText, caseSensitive, getMatches]);

  const highlightMatch = (match: { from: number; to: number }) => {
    if (!editor) return;
    editor.chain().focus().setTextSelection(match).run();
    // Scroll the selection into view
    const view = editor.view;
    const coords = view.coordsAtPos(match.from);
    const editorEl = view.dom.closest(".overflow-auto");
    if (editorEl && coords) {
      const rect = editorEl.getBoundingClientRect();
      if (coords.top < rect.top || coords.top > rect.bottom - 40) {
        editorEl.scrollTop += coords.top - rect.top - rect.height / 3;
      }
    }
  };

  const goToNext = () => {
    const matches = getMatches();
    if (matches.length === 0) return;
    const next = currentMatch >= matches.length ? 1 : currentMatch + 1;
    setCurrentMatch(next);
    highlightMatch(matches[next - 1]);
  };

  const goToPrev = () => {
    const matches = getMatches();
    if (matches.length === 0) return;
    const prev = currentMatch <= 1 ? matches.length : currentMatch - 1;
    setCurrentMatch(prev);
    highlightMatch(matches[prev - 1]);
  };

  const replaceCurrent = () => {
    if (!editor || matchCount === 0) return;
    const matches = getMatches();
    if (currentMatch < 1 || currentMatch > matches.length) return;

    const match = matches[currentMatch - 1];
    editor.chain().focus().setTextSelection(match).insertContent(replaceText).run();

    // Recalculate after replacement
    setTimeout(() => {
      const newMatches = getMatches();
      setMatchCount(newMatches.length);
      if (newMatches.length > 0) {
        const newCurrent = Math.min(currentMatch, newMatches.length);
        setCurrentMatch(newCurrent);
        highlightMatch(newMatches[newCurrent - 1]);
      } else {
        setCurrentMatch(0);
      }
    }, 10);
  };

  const replaceAll = () => {
    if (!editor || matchCount === 0) return;
    const matches = getMatches();

    // Replace from end to start to preserve positions
    const reversed = [...matches].reverse();
    editor.chain().focus();

    for (const match of reversed) {
      editor.chain().setTextSelection(match).insertContent(replaceText).run();
    }

    setTimeout(() => {
      setMatchCount(0);
      setCurrentMatch(0);
    }, 10);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "Enter") {
      if (e.shiftKey) goToPrev();
      else goToNext();
    }
  };

  return (
    <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-900 flex items-center gap-2 text-xs">
      {/* Find input */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <div className="relative flex-1 min-w-0">
          <input
            ref={findInputRef}
            value={findText}
            onChange={(e) => setFindText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Find"
            className="w-full px-2 py-1 pr-16 rounded bg-zinc-800 border border-zinc-700 focus:border-blue-500 focus:outline-none text-zinc-200 placeholder-zinc-600"
          />
          {findText && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500 tabular-nums">
              {matchCount > 0 ? `${currentMatch}/${matchCount}` : "0 results"}
            </span>
          )}
        </div>
        <button onClick={goToPrev} disabled={matchCount === 0} className="px-1.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 disabled:opacity-30" title="Previous (Shift+Enter)">
          ↑
        </button>
        <button onClick={goToNext} disabled={matchCount === 0} className="px-1.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 disabled:opacity-30" title="Next (Enter)">
          ↓
        </button>
        <button
          onClick={() => setCaseSensitive(!caseSensitive)}
          className={`px-1.5 py-1 rounded text-[10px] font-medium ${caseSensitive ? "bg-blue-600/30 text-blue-400 border border-blue-500/30" : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700"}`}
          title="Case sensitive"
        >
          Aa
        </button>
      </div>

      {/* Replace input */}
      {showReplace && (
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <input
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Replace"
            className="flex-1 min-w-0 px-2 py-1 rounded bg-zinc-800 border border-zinc-700 focus:border-blue-500 focus:outline-none text-zinc-200 placeholder-zinc-600"
          />
          <button onClick={replaceCurrent} disabled={matchCount === 0} className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 disabled:opacity-30" title="Replace">
            Replace
          </button>
          <button onClick={replaceAll} disabled={matchCount === 0} className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 disabled:opacity-30" title="Replace all">
            All
          </button>
        </div>
      )}

      <button
        onClick={() => setShowReplace(!showReplace)}
        className="px-1.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-500 text-[10px]"
        title={showReplace ? "Hide replace" : "Show replace"}
      >
        {showReplace ? "−" : "+"}
      </button>

      <button onClick={onClose} className="px-1.5 py-1 rounded hover:bg-zinc-800 text-zinc-500" title="Close (Esc)">
        ×
      </button>
    </div>
  );
}
