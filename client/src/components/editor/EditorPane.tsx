import { useState, useRef, useCallback, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extension-placeholder";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { Link } from "@tiptap/extension-link";
import { Image } from "@tiptap/extension-image";
import { Markdown } from "tiptap-markdown";
import { MathInline, MathBlock } from "../../extensions/mathExtension";
import { mathMarkdownToHtml, mathHtmlToMarkdown } from "../../extensions/mathMarkdown";
import "katex/dist/katex.min.css";
import { useStore } from "../../store";
import { useAutoSave } from "../../hooks/useAutoSave";
import { EditorToolbar } from "./EditorToolbar";
import { FindReplaceBar } from "./FindReplaceBar";
import { ExportModal } from "./ExportModal";
import { ImageOverlay } from "./ImageOverlay";
import { TableExportOverlay } from "./TableExportOverlay";
import { SourceEditor } from "./SourceEditor";
import type { Editor } from "@tiptap/react";

const CONTEXT_WINDOW = 500; // chars before/after cursor to capture

/** Extract surrounding context from the editor at current cursor position */
function extractEditorContext(editor: Editor) {
  const { state } = editor;
  const { from, to, empty } = state.selection;

  // Get full document text and selected text
  const fullText = editor.getText();
  const selectedText = empty ? "" : state.doc.textBetween(from, to, "\n");

  // Map ProseMirror position to plain text offset (approximate)
  const textBefore = state.doc.textBetween(0, from, "\n");
  const textAfter = state.doc.textBetween(to, state.doc.content.size, "\n");

  // Calculate line number from text before cursor
  const cursorLine = textBefore.split("\n").length;

  // Get heading breadcrumb: walk up from cursor to find containing headings
  const headingPath: string[] = [];
  const markdown = (editor.storage.markdown as any)?.getMarkdown?.() ?? fullText;
  const lines = markdown.split("\n");
  const cursorLineInMd = textBefore.split("\n").length - 1;
  for (let i = Math.min(cursorLineInMd, lines.length - 1); i >= 0; i--) {
    const match = lines[i].match(/^(#{1,3})\s+(.+)/);
    if (match) {
      const level = match[1].length;
      // Only add if we haven't seen a heading of this level or lower yet
      if (headingPath.length === 0 || headingPath.length < level) {
        headingPath.unshift(match[2].trim());
      }
      if (level === 1) break;
    }
  }

  return {
    cursorLine,
    cursorPos: from,
    selectedText,
    beforeCursor: textBefore.slice(-CONTEXT_WINDOW),
    afterCursor: textAfter.slice(0, CONTEXT_WINDOW),
    headingPath,
  };
}

export function EditorPane() {
  const activeDocument = useStore((s) => s.activeDocument);
  const updateDocument = useStore((s) => s.updateDocument);
  const setEditorContext = useStore((s) => s.setEditorContext);
  const [mode, setMode] = useState<"wysiwyg" | "source">("wysiwyg");
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [title, setTitle] = useState("");
  const [sourceContent, setSourceContent] = useState("");
  const isUpdatingRef = useRef(false);
  const docIdRef = useRef<string | null>(null);
  const lastUpdatedAtRef = useRef<string | null>(null);
  const contextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);

  const { save } = useAutoSave(
    useCallback(async (data: Record<string, unknown>) => {
      if (activeDocument) {
        await updateDocument(activeDocument.id, data);
        // Update our timestamp ref so we don't reload from our own save
        const fresh = useStore.getState().activeDocument;
        if (fresh) lastUpdatedAtRef.current = fresh.updatedAt;
      }
    }, [activeDocument?.id, updateDocument]),
    800
  );

  // Debounced context update to avoid hammering the store on every keystroke
  const updateEditorContext = useCallback((editor: Editor) => {
    if (contextTimerRef.current) clearTimeout(contextTimerRef.current);
    contextTimerRef.current = setTimeout(() => {
      const ctx = extractEditorContext(editor);
      setEditorContext(ctx);
    }, 150);
  }, [setEditorContext]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: "Start writing...",
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Link.configure({ openOnClick: false }),
      Image,
      Markdown,
      MathInline,
      MathBlock,
    ],
    editorProps: {
      attributes: {
        class: "outline-none min-h-full px-12 py-8 max-w-3xl mx-auto",
      },
    },
    onUpdate: ({ editor }) => {
      if (isUpdatingRef.current) return;
      let markdown = (editor.storage.markdown as any)?.getMarkdown?.() ?? editor.getText();
      markdown = mathHtmlToMarkdown(markdown);
      save({ content: markdown });
      updateEditorContext(editor);
    },
    onSelectionUpdate: ({ editor }) => {
      updateEditorContext(editor);
    },
  });

  // Keyboard shortcut: Cmd+H / Ctrl+H for find & replace, Cmd+F / Ctrl+F for find
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "h" || e.key === "f")) {
        e.preventDefault();
        setShowFindReplace(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Clear editor context when no document is active
  useEffect(() => {
    if (!activeDocument) {
      setEditorContext(null);
    }
  }, [activeDocument, setEditorContext]);

  // Update editor content when active document changes or is updated by a tool
  useEffect(() => {
    if (!activeDocument) {
      docIdRef.current = null;
      lastUpdatedAtRef.current = null;
      setTitle("");
      setSourceContent("");
      return;
    }

    const isNewDoc = docIdRef.current !== activeDocument.id;
    const isServerUpdate =
      !isNewDoc &&
      activeDocument.updatedAt !== lastUpdatedAtRef.current &&
      lastUpdatedAtRef.current !== null;

    if (!isNewDoc && !isServerUpdate) return;

    docIdRef.current = activeDocument.id;
    lastUpdatedAtRef.current = activeDocument.updatedAt;
    setTitle(activeDocument.title);
    setSourceContent(activeDocument.content || "");

    if (editor) {
      isUpdatingRef.current = true;
      // Pre-process math syntax before loading into editor
      const contentWithMath = mathMarkdownToHtml(activeDocument.content || "");
      editor.commands.setContent(contentWithMath);
      isUpdatingRef.current = false;
      setTimeout(() => updateEditorContext(editor), 50);
    }
  }, [activeDocument?.id, activeDocument?.updatedAt, editor]);

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    save({ title: newTitle });
  };

  const handleSourceChange = (content: string) => {
    setSourceContent(content);
    save({ content });
  };

  const handleModeSwitch = (newMode: "wysiwyg" | "source") => {
    if (newMode === "source" && editor) {
      let markdown = (editor.storage.markdown as any)?.getMarkdown?.() ?? editor.getText();
      markdown = mathHtmlToMarkdown(markdown);
      setSourceContent(markdown);
    } else if (newMode === "wysiwyg" && editor) {
      isUpdatingRef.current = true;
      const contentWithMath = mathMarkdownToHtml(sourceContent);
      editor.commands.setContent(contentWithMath);
      isUpdatingRef.current = false;
    }
    setMode(newMode);
  };

  if (!activeDocument) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
        Select or create a document to start editing
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-zinc-950">
      {/* Title bar */}
      <div className="flex items-center px-6 py-2 border-b border-zinc-800 bg-zinc-900">
        <input
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          className="flex-1 bg-transparent text-lg font-semibold outline-none text-zinc-100 placeholder-zinc-600"
          placeholder="Document title"
        />
        <div className="flex items-center gap-2 ml-4">
          <span className="text-xs text-zinc-500">
            {activeDocument.wordCount ?? 0} words
          </span>
          <button
            onClick={() => setShowExport(true)}
            className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-0.5 rounded hover:bg-zinc-800"
          >
            Export
          </button>
          <div className="flex bg-zinc-800 rounded overflow-hidden">
            <button
              onClick={() => handleModeSwitch("wysiwyg")}
              className={`px-2 py-0.5 text-xs ${mode === "wysiwyg" ? "bg-zinc-600 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              Visual
            </button>
            <button
              onClick={() => handleModeSwitch("source")}
              className={`px-2 py-0.5 text-xs ${mode === "source" ? "bg-zinc-600 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              Source
            </button>
          </div>
        </div>
      </div>

      {showFindReplace && mode === "wysiwyg" && (
        <FindReplaceBar editor={editor} onClose={() => setShowFindReplace(false)} />
      )}

      {mode === "wysiwyg" ? (
        <>
          <EditorToolbar editor={editor} />
          <div className="flex-1 overflow-auto" ref={editorContainerRef}>
            <EditorContent editor={editor} className="min-h-full" />
            <ImageOverlay containerRef={editorContainerRef} />
            <TableExportOverlay containerRef={editorContainerRef} />
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-auto">
          <SourceEditor content={sourceContent} onChange={handleSourceChange} />
        </div>
      )}

      {showExport && (
        <ExportModal
          documentId={activeDocument.id}
          documentTitle={activeDocument.title}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}
