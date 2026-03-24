import { useEffect, useRef, useState, useCallback } from "react";
import { useStore } from "./store";
import { SidebarPane } from "./components/sidebar/SidebarPane";
import { EditorPane } from "./components/editor/EditorPane";
import { ChatPane } from "./components/chat/ChatPane";
import { SettingsModal } from "./components/SettingsModal";
import { StyleGuideModal } from "./components/StyleGuideModal";

export default function App() {
  const project = useStore((s) => s.project);
  const loadProjects = useStore((s) => s.loadProjects);
  const projects = useStore((s) => s.projects);
  const loadProject = useStore((s) => s.loadProject);
  const showSettings = useStore((s) => s.showSettings);
  const showStyleGuide = useStore((s) => s.showStyleGuide);
  const loadSettings = useStore((s) => s.loadSettings);
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
      {/* Top bar */}
      <div className="h-10 flex items-center px-4 border-b border-zinc-800 bg-zinc-900 shrink-0">
        <span className="text-sm font-semibold tracking-wide text-zinc-300">AI Docs</span>
        {project && (
          <span className="ml-3 text-xs text-zinc-500">/ {project.name}</span>
        )}
        <div className="flex-1" />
        <button
          onClick={() => useStore.getState().setShowStyleGuide(true)}
          className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded hover:bg-zinc-800"
        >
          Style Guide
        </button>
        <button
          onClick={() => useStore.getState().setShowSettings(true)}
          className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded hover:bg-zinc-800"
        >
          Settings
        </button>
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <div style={{ width: sidebarWidth }} className="shrink-0 border-r border-zinc-800 bg-zinc-900">
          <SidebarPane />
        </div>

        {/* Sidebar resize handle */}
        <div
          className="w-1 cursor-col-resize hover:bg-blue-500/30 active:bg-blue-500/50 shrink-0"
          onMouseDown={(e) => onMouseDown("sidebar", e)}
        />

        {/* Editor (main area) */}
        <div className="flex-1 min-w-0">
          <EditorPane />
        </div>

        {/* Chat resize handle */}
        <div
          className="w-1 cursor-col-resize hover:bg-blue-500/30 active:bg-blue-500/50 shrink-0"
          onMouseDown={(e) => onMouseDown("chat", e)}
        />

        {/* Chat */}
        <div style={{ width: chatWidth }} className="shrink-0 border-l border-zinc-800 bg-zinc-900">
          <ChatPane />
        </div>
      </div>

      {showSettings && <SettingsModal />}
      {showStyleGuide && <StyleGuideModal />}
    </div>
  );
}
