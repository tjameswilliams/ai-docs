import { useState, useRef, useEffect, useCallback } from "react";
import type { Editor } from "@tiptap/react";
import { IconButton } from "../ui";

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

  const inputStyle = {
    background: "#1c1c20",
    border: "1px solid #27272a",
    color: "#e4e4e7",
    fontSize: 12,
    height: 26,
  };

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 shrink-0"
      style={{
        background: "#1f1f23",
        borderBottom: "1px solid #27272a",
        boxShadow: "var(--shadow-popover)",
      }}
    >
      <div className="flex items-center gap-1 flex-1 min-w-0">
        <div className="relative flex-1 min-w-0">
          <input
            ref={findInputRef}
            value={findText}
            onChange={(e) => setFindText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Find"
            className="w-full pl-2 pr-16 rounded-[5px] outline-none focus:border-[#3b82f6] placeholder-zinc-600"
            style={inputStyle}
          />
          {findText && (
            <span
              className="absolute right-2 top-1/2 -translate-y-1/2 font-mono"
              style={{ fontSize: 9.5, color: "#71717a" }}
            >
              {matchCount > 0 ? `${currentMatch}/${matchCount}` : "0"}
            </span>
          )}
        </div>
        <IconButton icon="caret-u" size="sm" tooltip="Previous (⇧↵)" disabled={matchCount === 0} onClick={goToPrev} />
        <IconButton icon="caret-d" size="sm" tooltip="Next (↵)" disabled={matchCount === 0} onClick={goToNext} />
        <button
          onClick={() => setCaseSensitive(!caseSensitive)}
          className="rounded-[5px] transition-colors"
          title="Case sensitive"
          style={{
            height: 24, width: 24,
            fontSize: 10,
            fontWeight: 500,
            color: caseSensitive ? "#60a5fa" : "#71717a",
            background: caseSensitive ? "rgba(59,130,246,0.15)" : "transparent",
            border: caseSensitive ? "1px solid rgba(59,130,246,0.3)" : "1px solid transparent",
          }}
        >
          Aa
        </button>
      </div>

      {showReplace && (
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <input
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Replace"
            className="flex-1 min-w-0 px-2 rounded-[5px] outline-none focus:border-[#3b82f6] placeholder-zinc-600"
            style={inputStyle}
          />
          <button
            onClick={replaceCurrent}
            disabled={matchCount === 0}
            className="px-2 rounded-[5px] transition-colors disabled:opacity-40"
            style={{ height: 24, fontSize: 10.5, color: "#a1a1aa", background: "#27272a" }}
            title="Replace"
          >
            Replace
          </button>
          <button
            onClick={replaceAll}
            disabled={matchCount === 0}
            className="px-2 rounded-[5px] transition-colors disabled:opacity-40"
            style={{ height: 24, fontSize: 10.5, color: "#a1a1aa", background: "#27272a" }}
            title="Replace all"
          >
            All
          </button>
        </div>
      )}

      <IconButton
        icon={showReplace ? "minus" : "plus"}
        size="sm"
        tooltip={showReplace ? "Hide replace" : "Show replace"}
        onClick={() => setShowReplace(!showReplace)}
      />
      <IconButton icon="x" size="sm" tooltip="Close (Esc)" onClick={onClose} />
    </div>
  );
}
