import { useEffect, useRef, useState, useCallback } from "react";
import { useStore } from "./store";
import { SidebarPane } from "./components/sidebar/SidebarPane";
import { EditorPane } from "./components/editor/EditorPane";
import { ChatPane } from "./components/chat/ChatPane";
import { SettingsModal } from "./components/SettingsModal";
import { ExportModal } from "./components/editor/ExportModal";
import { Avatar, IconButton, Pill, Icon } from "./components/ui";

function TopBar() {
  const project = useStore((s) => s.project);
  const activeDocument = useStore((s) => s.activeDocument);
  const saveStatus = useStore((s) => s.saveStatus);
  const canUndo = useStore((s) => s.canUndo);
  const canRedo = useStore((s) => s.canRedo);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const setShowExport = useStore((s) => s.setShowExport);
  const setShowSettings = useStore((s) => s.setShowSettings);

  return (
    <div
      className="flex items-center px-3 shrink-0 gap-2"
      style={{
        height: 44,
        background: "var(--gradient-topbar)",
        borderBottom: "1px solid #27272a",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.02), 0 1px 0 rgba(0,0,0,0.4)",
      }}
    >
      {/* Logo tile (placeholder — swap for real artwork when available) */}
      <Avatar kind="logo" size={22} />

      {/* Breadcrumb: project / document */}
      <div className="flex items-center gap-1.5 min-w-0 ml-1">
        {project ? (
          <>
            <Icon name="folder" size={12} className="text-zinc-500 shrink-0" />
            <span
              className="truncate"
              style={{ fontSize: 12, color: "#a1a1aa", maxWidth: 200 }}
              title={project.name}
            >
              {project.name}
            </span>
            {activeDocument && (
              <>
                <span style={{ fontSize: 12, color: "#3f3f46" }}>/</span>
                <span
                  className="truncate"
                  style={{ fontSize: 12, fontWeight: 500, color: "#e4e4e7", maxWidth: 280 }}
                  title={activeDocument.title}
                >
                  {activeDocument.title || "Untitled"}
                </span>
              </>
            )}
          </>
        ) : (
          <span style={{ fontSize: 12, color: "#71717a" }}>AI Docs</span>
        )}
      </div>

      {/* Save status pill */}
      {activeDocument && (
        <Pill
          tone={saveStatus === "dirty" || saveStatus === "saving" ? "dirty" : "saved"}
          dot
        >
          {saveStatus === "saving" ? "Saving" : saveStatus === "dirty" ? "Unsaved" : "Saved"}
        </Pill>
      )}

      <div className="flex-1" />

      {/* Right-side actions */}
      <IconButton
        icon="undo"
        size="sm"
        tooltip="Undo (⌘Z)"
        disabled={!canUndo}
        onClick={() => undo()}
      />
      <IconButton
        icon="redo"
        size="sm"
        tooltip="Redo (⌘⇧Z)"
        disabled={!canRedo}
        onClick={() => redo()}
      />
      <div className="w-px h-5 mx-0.5" style={{ background: "#27272a" }} />
      <IconButton
        icon="export"
        size="sm"
        tooltip="Export"
        disabled={!activeDocument}
        onClick={() => setShowExport(true)}
      />
      <div className="w-px h-5 mx-0.5" style={{ background: "#27272a" }} />
      <IconButton
        icon="settings"
        size="sm"
        tooltip="Settings"
        onClick={() => setShowSettings(true)}
      />
    </div>
  );
}

export default function App() {
  const project = useStore((s) => s.project);
  const loadProjects = useStore((s) => s.loadProjects);
  const projects = useStore((s) => s.projects);
  const loadProject = useStore((s) => s.loadProject);
  const showSettings = useStore((s) => s.showSettings);
  const showExport = useStore((s) => s.showExport);
  const setShowExport = useStore((s) => s.setShowExport);
  const activeDocument = useStore((s) => s.activeDocument);
  const loadSettings = useStore((s) => s.loadSettings);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const initializedRef = useRef(false);

  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [chatWidth, setChatWidth] = useState(380);
  const dragging = useRef<{ target: "sidebar" | "chat"; startX: number; startW: number } | null>(null);

  useEffect(() => {
    loadProjects();
    loadSettings();
  }, []);

  useEffect(() => {
    if (initializedRef.current || projects.length === 0) return;
    initializedRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const urlProjectId = params.get("project");
    const targetId = urlProjectId && projects.find(p => p.id === urlProjectId)
      ? urlProjectId
      : projects[0].id;
    loadProject(targetId);
  }, [projects]);

  useEffect(() => {
    if (!project) return;
    const url = new URL(window.location.href);
    url.searchParams.set("project", project.id);
    window.history.replaceState({}, "", url.toString());
  }, [project]);

  // Global undo/redo keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== "z") return;
      // Don't intercept if user is typing in the editor (TipTap handles its own undo)
      const active = document.activeElement;
      if (active?.closest(".tiptap") || active?.tagName === "TEXTAREA" || active?.tagName === "INPUT") return;
      e.preventDefault();
      if (e.shiftKey) {
        redo();
      } else {
        undo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);

  const onMouseDown = useCallback((target: "sidebar" | "chat", e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = {
      target,
      startX: e.clientX,
      startW: target === "sidebar" ? sidebarWidth : chatWidth,
    };
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const dx = ev.clientX - dragging.current.startX;
      if (dragging.current.target === "sidebar") {
        setSidebarWidth(Math.max(160, Math.min(400, dragging.current.startW + dx)));
      } else {
        setChatWidth(Math.max(280, Math.min(600, dragging.current.startW - dx)));
      }
    };
    const onUp = () => {
      dragging.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [sidebarWidth, chatWidth]);

  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden">
      <TopBar />

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <div style={{ width: sidebarWidth }} className="shrink-0">
          <SidebarPane />
        </div>

        {/* Sidebar resize handle (4px wide, transparent → blue tint on hover) */}
        <div
          className="w-1 cursor-col-resize hover:bg-blue-500/30 active:bg-blue-500/50 shrink-0 transition-colors"
          onMouseDown={(e) => onMouseDown("sidebar", e)}
        />

        {/* Editor (main area) */}
        <div className="flex-1 min-w-0">
          <EditorPane />
        </div>

        {/* Chat resize handle */}
        <div
          className="w-1 cursor-col-resize hover:bg-blue-500/30 active:bg-blue-500/50 shrink-0 transition-colors"
          onMouseDown={(e) => onMouseDown("chat", e)}
        />

        {/* Chat */}
        <div style={{ width: chatWidth }} className="shrink-0">
          <ChatPane />
        </div>
      </div>

      {showSettings && <SettingsModal />}
      {showExport && activeDocument && (
        <ExportModal
          documentId={activeDocument.id}
          documentTitle={activeDocument.title}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}
