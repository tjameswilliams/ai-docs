import { useState, useEffect } from "react";
import { useStore } from "../../store";
import { FolderTree } from "./FolderTree";
import { SearchPanel } from "./SearchPanel";

export function SidebarPane() {
  const projects = useStore((s) => s.projects);
  const project = useStore((s) => s.project);
  const loadProject = useStore((s) => s.loadProject);
  const createProject = useStore((s) => s.createProject);
  const updateProject = useStore((s) => s.updateProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  // Cmd+Shift+F to toggle search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "f") {
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
    <div className="h-full flex flex-col">
      {/* Project selector */}
      <div className="p-2 border-b border-zinc-800">
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
            className="w-full px-2 py-1 text-xs rounded bg-zinc-800 border border-blue-500 focus:outline-none"
          />
        ) : (
          <select
            value={project?.id || ""}
            onChange={(e) => e.target.value && loadProject(e.target.value)}
            className="w-full px-2 py-1 text-xs rounded bg-zinc-800 border border-zinc-700 focus:border-blue-500 focus:outline-none"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
        <div className="flex gap-1 mt-1">
          <button
            onClick={() => setShowNewProject(true)}
            className="flex-1 text-xs text-zinc-400 hover:text-zinc-200 py-1 rounded hover:bg-zinc-800"
          >
            + New
          </button>
          {project && !editingName && (
            <button
              onClick={startRename}
              className="text-xs text-zinc-500 hover:text-zinc-200 px-2 py-1 rounded hover:bg-zinc-800"
            >
              Rename
            </button>
          )}
          <button
            onClick={() => setShowSearch((v) => !v)}
            className={`text-xs px-2 py-1 rounded hover:bg-zinc-800 ${showSearch ? "text-blue-400" : "text-zinc-500 hover:text-zinc-200"}`}
            title="Search documents (Cmd+Shift+F)"
          >
            Search
          </button>
          {project && (
            <button
              onClick={() => {
                if (confirm(`Delete "${project.name}"?`)) deleteProject(project.id);
              }}
              className="text-xs text-zinc-500 hover:text-red-400 px-2 py-1 rounded hover:bg-zinc-800"
            >
              Del
            </button>
          )}
        </div>
        {showNewProject && (
          <div className="mt-1 flex gap-1">
            <input
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
              placeholder="Project name"
              autoFocus
              className="flex-1 px-2 py-1 text-xs rounded bg-zinc-800 border border-zinc-700 focus:border-blue-500 focus:outline-none"
            />
            <button onClick={handleCreateProject} className="text-xs text-blue-400 px-2">OK</button>
            <button onClick={() => setShowNewProject(false)} className="text-xs text-zinc-500 px-1">X</button>
          </div>
        )}
      </div>

      {/* Search panel */}
      {showSearch && project && (
        <SearchPanel
          projectId={project.id}
          onClose={() => setShowSearch(false)}
        />
      )}

      {/* Folder tree */}
      <FolderTree />
    </div>
  );
}
