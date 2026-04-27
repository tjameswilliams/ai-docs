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
import { api } from "../../api/client";
import "katex/dist/katex.min.css";
import { useStore } from "../../store";
import { useAutoSave } from "../../hooks/useAutoSave";
import { EditorToolbar } from "./EditorToolbar";
import { FindReplaceBar } from "./FindReplaceBar";
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
  const setSaveStatus = useStore((s) => s.setSaveStatus);
  const saveStatus = useStore((s) => s.saveStatus);
  const cursorLine = useStore((s) => s.editorContext?.cursorLine ?? 1);
  const [mode, setMode] = useState<"wysiwyg" | "source">("wysiwyg");
  const [showFindReplace, setShowFindReplace] = useState(false);
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
        setSaveStatus("saving");
        try {
          await updateDocument(activeDocument.id, data);
          // Update our timestamp ref so we don't reload from our own save
          const fresh = useStore.getState().activeDocument;
          if (fresh) lastUpdatedAtRef.current = fresh.updatedAt;
          setSaveStatus("saved");
        } catch (err) {
          setSaveStatus("dirty");
          throw err;
        }
      }
    }, [activeDocument?.id, updateDocument, setSaveStatus]),
    800
  );

  // Mark dirty whenever a save is queued (covers title + content changes)
  const queueSave = useCallback((data: Record<string, unknown>) => {
    setSaveStatus("dirty");
    save(data);
  }, [save, setSaveStatus]);

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
        class: "outline-none min-h-[200px]",
      },
      handleDrop(view, event, _slice, moved) {
        if (moved || !event.dataTransfer?.files.length) return false;
        const images = Array.from(event.dataTransfer.files).filter((f) =>
          f.type.startsWith("image/")
        );
        if (images.length === 0) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
        for (const file of images) {
          api.upload(file).then(({ url }) => {
            const node = view.state.schema.nodes.image.create({ src: url });
            const tr = view.state.tr.insert(pos?.pos ?? view.state.selection.from, node);
            view.dispatch(tr);
          });
        }
        return true;
      },
      handlePaste(view, event) {
        const items = event.clipboardData?.items;
        if (!items) return false;
        const images = Array.from(items).filter((item) =>
          item.type.startsWith("image/")
        );
        if (images.length === 0) return false;
        event.preventDefault();
        for (const item of images) {
          const file = item.getAsFile();
          if (!file) continue;
          api.upload(file).then(({ url }) => {
            const node = view.state.schema.nodes.image.create({ src: url });
            const tr = view.state.tr.replaceSelectionWith(node);
            view.dispatch(tr);
          });
        }
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      if (isUpdatingRef.current) return;
      let markdown = (editor.storage.markdown as any)?.getMarkdown?.() ?? editor.getText();
      markdown = mathHtmlToMarkdown(markdown);
      queueSave({ content: markdown });
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
    queueSave({ title: newTitle });
  };

  const handleSourceChange = (content: string) => {
    setSourceContent(content);
    queueSave({ content });
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
      <div
        className="h-full flex items-center justify-center text-sm"
        style={{ background: "var(--gradient-canvas)", color: "#71717a" }}
      >
        Select or create a document to start editing
      </div>
    );
  }

  const wordCount = activeDocument.wordCount ?? 0;

  return (
    <div className="h-full flex flex-col" style={{ background: "var(--gradient-canvas)" }}>
      {/* Toolbar (44px) — also where the Visual/Source segmented toggle lives */}
      {mode === "wysiwyg" && <EditorToolbar editor={editor} />}

      {showFindReplace && mode === "wysiwyg" && (
        <FindReplaceBar editor={editor} onClose={() => setShowFindReplace(false)} />
      )}

      {/* Document body */}
      {mode === "wysiwyg" ? (
        <div className="flex-1 overflow-auto" ref={editorContainerRef}>
          <div className="max-w-3xl mx-auto px-12 pt-10 pb-16">
            <input
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="w-full bg-transparent outline-none placeholder-zinc-700 mb-6"
              placeholder="Document title"
              style={{
                fontSize: 32,
                fontWeight: 600,
                letterSpacing: "-0.02em",
                color: "#fafafa",
                lineHeight: 1.15,
              }}
            />
            <EditorContent editor={editor} />
          </div>
          <ImageOverlay containerRef={editorContainerRef} />
          <TableExportOverlay containerRef={editorContainerRef} />
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="max-w-3xl mx-auto px-12 pt-10 pb-16">
            <input
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="w-full bg-transparent outline-none placeholder-zinc-700 mb-6"
              placeholder="Document title"
              style={{
                fontSize: 32,
                fontWeight: 600,
                letterSpacing: "-0.02em",
                color: "#fafafa",
                lineHeight: 1.15,
              }}
            />
          </div>
          <SourceEditor content={sourceContent} onChange={handleSourceChange} />
        </div>
      )}

      {/* Status bar (22px) */}
      <div
        className="flex items-center px-3 gap-3 shrink-0 font-mono"
        style={{
          height: 22,
          background: "#0a0a0c",
          borderTop: "1px solid #27272a",
          fontSize: 10,
          color: "#52525b",
        }}
      >
        <span>{wordCount} words</span>
        <span style={{ color: "#3f3f46" }}>·</span>
        <span>ln {cursorLine}</span>
        <span style={{ color: "#3f3f46" }}>·</span>
        <span style={{ color: saveStatus === "saved" ? "#10b981" : "#f59e0b" }}>
          {saveStatus === "saving" ? "saving…" : saveStatus === "dirty" ? "unsaved" : "saved"}
        </span>
        <span className="flex-1" />
        <div
          className="inline-flex items-center"
          style={{ background: "#0f0f12", border: "1px solid #27272a", borderRadius: 4, padding: 1 }}
        >
          <button
            onClick={() => handleModeSwitch("wysiwyg")}
            className="transition-colors"
            style={{
              padding: "1px 7px",
              borderRadius: 3,
              fontSize: 9.5,
              color: mode === "wysiwyg" ? "#fafafa" : "#71717a",
              background: mode === "wysiwyg" ? "linear-gradient(180deg, #2d2d33 0%, #232328 100%)" : "transparent",
              border: mode === "wysiwyg" ? "1px solid #3f3f46" : "1px solid transparent",
            }}
          >
            Visual
          </button>
          <button
            onClick={() => handleModeSwitch("source")}
            className="transition-colors"
            style={{
              padding: "1px 7px",
              borderRadius: 3,
              fontSize: 9.5,
              color: mode === "source" ? "#fafafa" : "#71717a",
              background: mode === "source" ? "linear-gradient(180deg, #2d2d33 0%, #232328 100%)" : "transparent",
              border: mode === "source" ? "1px solid #3f3f46" : "1px solid transparent",
            }}
          >
            Source
          </button>
        </div>
      </div>
    </div>
  );
}
