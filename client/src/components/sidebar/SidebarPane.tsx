import { useState, useEffect, useRef } from "react";
import { useStore } from "../../store";
import { FolderTree } from "./FolderTree";
import { SearchPanel } from "./SearchPanel";
import { Icon, IconButton, Kbd, SectionLabel, Avatar } from "../ui";

function ProjectPicker() {
  const projects = useStore((s) => s.projects);
  const project = useStore((s) => s.project);
  const loadProject = useStore((s) => s.loadProject);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 transition-colors hover:bg-[rgba(63,63,70,0.4)]"
        style={{
          height: 30,
          background: "#1c1c20",
          border: "1px solid #27272a",
          borderRadius: 5,
          fontSize: 12,
          color: "#e4e4e7",
        }}
      >
        <Icon name="folder" size={12} className="text-zinc-500 shrink-0" />
        <span className="flex-1 truncate text-left">{project?.name || "No project"}</span>
        <Icon name="caret-d" size={11} className="text-zinc-500 shrink-0" />
      </button>
      {open && projects.length > 0 && (
        <div
          className="absolute left-0 right-0 mt-1 z-30 max-h-72 overflow-y-auto"
          style={{
            background: "#1f1f23",
            border: "1px solid #3f3f46",
            borderRadius: 6,
            boxShadow: "var(--shadow-popover)",
          }}
        >
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => { loadProject(p.id); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-800 flex items-center gap-2"
              style={{ color: p.id === project?.id ? "#fafafa" : "#a1a1aa" }}
            >
              <Icon name="folder" size={11} className="shrink-0" />
              <span className="truncate flex-1">{p.name}</span>
              {p.id === project?.id && <Icon name="check" size={11} className="text-blue-400" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SidebarPane() {
  const project = useStore((s) => s.project);
  const settings = useStore((s) => s.settings);
  const createProject = useStore((s) => s.createProject);
  const updateProject = useStore((s) => s.updateProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Cmd+K and Cmd+Shift+F both toggle search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const cmdK = (e.metaKey || e.ctrlKey) && e.key === "k";
      const cmdShiftF = (e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "f";
      if (cmdK || cmdShiftF) {
        e.preventDefault();
        setShowSearch((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    await createProject(newProjectName.trim());
    setNewProjectName("");
    setShowNewProject(false);
  };

  const handleRename = async () => {
    if (!project || !editName.trim() || editName.trim() === project.name) {
      setEditingName(false);
      return;
    }
    await updateProject(project.id, { name: editName.trim() });
    setEditingName(false);
  };

  const startRename = () => {
    if (!project) return;
    setEditName(project.name);
    setEditingName(true);
  };

  return (
    <div
      className="h-full flex flex-col"
      style={{
        background: "var(--gradient-sidebar)",
        borderRight: "1px solid #27272a",
      }}
    >
      {/* Top: search bar */}
      <div className="px-2.5 pt-2.5 pb-1.5 shrink-0">
        <div
          className="flex items-center gap-1.5 transition-colors focus-within:border-[#3b82f6]"
          style={{
            padding: "0 8px",
            height: 28,
            background: "#1c1c20",
            border: "1px solid #27272a",
            borderRadius: 5,
          }}
        >
          <Icon name="search" size={12} className="text-zinc-500 shrink-0" />
          <input
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (e.target.value && !showSearch) setShowSearch(true);
            }}
            onFocus={() => { if (searchQuery) setShowSearch(true); }}
            placeholder="Search documents"
            style={{
              flex: 1,
              background: "transparent",
              color: "#e4e4e7",
              fontSize: 11.5,
              border: "none",
              outline: "none",
            }}
          />
          <Kbd>⌘K</Kbd>
        </div>
      </div>

      {/* Project picker + actions row */}
      <div className="px-2.5 pb-2 shrink-0">
        {editingName ? (
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
              if (e.key === "Escape") setEditingName(false);
            }}
            onBlur={handleRename}
            autoFocus
            className="w-full px-2.5 outline-none"
            style={{
              height: 30,
              background: "#1c1c20",
              border: "1px solid #3b82f6",
              borderRadius: 5,
              fontSize: 12,
              color: "#fafafa",
            }}
          />
        ) : (
          <ProjectPicker />
        )}
        <div className="flex items-center gap-0.5 mt-1.5">
          <IconButton icon="folder-plus" size="sm" tooltip="New project" onClick={() => setShowNewProject(true)} />
          {project && !editingName && (
            <IconButton icon="pencil" size="sm" tooltip="Rename project" onClick={startRename} />
          )}
          {project && (
            <IconButton
              icon="trash"
              size="sm"
              tooltip="Delete project"
              onClick={() => { if (confirm(`Delete "${project.name}"?`)) deleteProject(project.id); }}
            />
          )}
          <div className="flex-1" />
          {project && (
            <IconButton
              icon="file-plus"
              size="sm"
              tooltip="New document"
              onClick={() => useStore.getState().createDocument()}
            />
          )}
        </div>
        {showNewProject && (
          <div className="mt-2 flex gap-1">
            <input
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateProject();
                if (e.key === "Escape") setShowNewProject(false);
              }}
              placeholder="Project name"
              autoFocus
              className="flex-1 px-2 outline-none"
              style={{
                height: 26,
                background: "#1c1c20",
                border: "1px solid #3b82f6",
                borderRadius: 5,
                fontSize: 11.5,
                color: "#e4e4e7",
              }}
            />
          </div>
        )}
      </div>

      {/* Search panel (when opened) */}
      {showSearch && project && (
        <SearchPanel
          projectId={project.id}
          onClose={() => { setShowSearch(false); setSearchQuery(""); }}
        />
      )}

      {!showSearch && (
        <>
          <div className="px-3 pt-2 pb-1 shrink-0">
            <SectionLabel>Documents</SectionLabel>
          </div>
          <FolderTree />
        </>
      )}

      {/* User row */}
      <div
        className="flex items-center gap-2 px-2.5 py-2 shrink-0"
        style={{
          background: "#0f0f12",
          borderTop: "1px solid #27272a",
        }}
      >
        <Avatar kind="user" size={26} initials={(settings.userInitials as string) || "U"} />
        <div className="flex-1 min-w-0">
          <div className="truncate" style={{ fontSize: 11.5, fontWeight: 500, color: "#e4e4e7" }}>
            {settings.userName || "Local"}
          </div>
          <div className="truncate" style={{ fontSize: 9.5, color: "#71717a" }}>
            {settings.model || "claude-sonnet"}
          </div>
        </div>
      </div>
    </div>
  );
}
