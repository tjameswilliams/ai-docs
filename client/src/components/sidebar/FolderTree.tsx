import { useState, useRef } from "react";
import { useStore } from "../../store";
import type { Folder, Document } from "../../types";

export function FolderTree() {
  const folders = useStore((s) => s.folders);
  const documents = useStore((s) => s.documents);
  const activeDocument = useStore((s) => s.activeDocument);
  const setActiveDocument = useStore((s) => s.setActiveDocument);
  const createFolder = useStore((s) => s.createFolder);
  const createDocument = useStore((s) => s.createDocument);
  const deleteFolder = useStore((s) => s.deleteFolder);
  const deleteDocument = useStore((s) => s.deleteDocument);
  const updateFolder = useStore((s) => s.updateFolder);
  const updateDocument = useStore((s) => s.updateDocument);

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: "folder" | "document" | "root"; id?: string } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; type: "folder" | "document"; name: string } | null>(null);
  const [dragItem, setDragItem] = useState<{ id: string; type: "folder" | "document" } | null>(null);

  const toggleFolder = (id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const rootFolders = folders.filter((f) => !f.parentId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const rootDocuments = documents.filter((d) => !d.folderId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const getChildFolders = (parentId: string) =>
    folders.filter((f) => f.parentId === parentId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const getChildDocuments = (folderId: string) =>
    documents.filter((d) => d.folderId === folderId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const handleContextMenu = (e: React.MouseEvent, type: "folder" | "document" | "root", id?: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, type, id });
  };

  const closeContextMenu = () => setContextMenu(null);

  const handleRename = async () => {
    if (!renaming || !renaming.name.trim()) { setRenaming(null); return; }
    if (renaming.type === "folder") {
      await updateFolder(renaming.id, { name: renaming.name.trim() });
    } else {
      await updateDocument(renaming.id, { title: renaming.name.trim() });
    }
    setRenaming(null);
  };

  const handleDrop = async (targetFolderId: string | null, e: React.DragEvent) => {
    e.preventDefault();
    if (!dragItem) return;
    if (dragItem.type === "document") {
      await updateDocument(dragItem.id, { folderId: targetFolderId });
    } else if (dragItem.type === "folder") {
      if (dragItem.id !== targetFolderId) {
        await updateFolder(dragItem.id, { parentId: targetFolderId });
      }
    }
    setDragItem(null);
  };

  const renderFolder = (folder: Folder, depth: number = 0) => {
    const isExpanded = expandedFolders.has(folder.id);
    const childFolders = getChildFolders(folder.id);
    const childDocs = getChildDocuments(folder.id);

    return (
      <div key={folder.id}>
        <div
          className="flex items-center gap-1 px-2 py-0.5 text-xs hover:bg-zinc-800 cursor-pointer rounded group"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => toggleFolder(folder.id)}
          onContextMenu={(e) => handleContextMenu(e, "folder", folder.id)}
          draggable
          onDragStart={() => setDragItem({ id: folder.id, type: "folder" })}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDrop(folder.id, e)}
        >
          <span className="text-zinc-500 w-3 text-center shrink-0">{isExpanded ? "v" : ">"}</span>
          <span className="text-zinc-400 shrink-0">📁</span>
          {renaming?.id === folder.id ? (
            <input
              value={renaming.name}
              onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
              onBlur={handleRename}
              onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setRenaming(null); }}
              autoFocus
              className="flex-1 bg-zinc-800 text-xs px-1 rounded outline-none border border-blue-500"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="truncate text-zinc-300">{folder.name}</span>
          )}
        </div>
        {isExpanded && (
          <>
            {childFolders.map((cf) => renderFolder(cf, depth + 1))}
            {childDocs.map((doc) => renderDocument(doc, depth + 1))}
          </>
        )}
      </div>
    );
  };

  const renderDocument = (doc: Document, depth: number = 0) => {
    const isActive = activeDocument?.id === doc.id;
    return (
      <div
        key={doc.id}
        className={`flex items-center gap-1 px-2 py-0.5 text-xs cursor-pointer rounded ${isActive ? "bg-blue-600/20 text-blue-300" : "hover:bg-zinc-800 text-zinc-300"}`}
        style={{ paddingLeft: `${depth * 12 + 20}px` }}
        onClick={() => setActiveDocument(doc)}
        onContextMenu={(e) => handleContextMenu(e, "document", doc.id)}
        draggable
        onDragStart={() => setDragItem({ id: doc.id, type: "document" })}
      >
        <span className="text-zinc-500 shrink-0">📄</span>
        {renaming?.id === doc.id ? (
          <input
            value={renaming.name}
            onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
            onBlur={handleRename}
            onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setRenaming(null); }}
            autoFocus
            className="flex-1 bg-zinc-800 text-xs px-1 rounded outline-none border border-blue-500"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="truncate">{doc.title}</span>
        )}
      </div>
    );
  };

  return (
    <div
      className="flex-1 overflow-auto py-1"
      onContextMenu={(e) => handleContextMenu(e, "root")}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => handleDrop(null, e)}
    >
      {rootFolders.map((f) => renderFolder(f))}
      {rootDocuments.map((d) => renderDocument(d))}

      {folders.length === 0 && documents.length === 0 && (
        <div className="text-xs text-zinc-600 text-center mt-8 px-4">
          Right-click to create a folder or document
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeContextMenu} />
          <div
            className="fixed z-50 bg-zinc-800 border border-zinc-700 rounded shadow-lg py-1 min-w-[140px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="w-full text-left px-3 py-1 text-xs hover:bg-zinc-700"
              onClick={() => { createDocument(undefined, contextMenu.type === "folder" ? contextMenu.id : undefined); closeContextMenu(); }}
            >
              New Document
            </button>
            <button
              className="w-full text-left px-3 py-1 text-xs hover:bg-zinc-700"
              onClick={() => { createFolder("New Folder", contextMenu.type === "folder" ? contextMenu.id : undefined); closeContextMenu(); }}
            >
              New Folder
            </button>
            {contextMenu.type === "folder" && contextMenu.id && (
              <>
                <hr className="border-zinc-700 my-1" />
                <button
                  className="w-full text-left px-3 py-1 text-xs hover:bg-zinc-700"
                  onClick={() => {
                    const folder = folders.find((f) => f.id === contextMenu.id);
                    if (folder) setRenaming({ id: folder.id, type: "folder", name: folder.name });
                    closeContextMenu();
                  }}
                >
                  Rename
                </button>
                <button
                  className="w-full text-left px-3 py-1 text-xs text-red-400 hover:bg-zinc-700"
                  onClick={() => { if (contextMenu.id && confirm("Delete folder and all its documents?")) deleteFolder(contextMenu.id); closeContextMenu(); }}
                >
                  Delete Folder
                </button>
              </>
            )}
            {contextMenu.type === "document" && contextMenu.id && (
              <>
                <hr className="border-zinc-700 my-1" />
                <button
                  className="w-full text-left px-3 py-1 text-xs hover:bg-zinc-700"
                  onClick={() => {
                    const doc = documents.find((d) => d.id === contextMenu.id);
                    if (doc) setRenaming({ id: doc.id, type: "document", name: doc.title });
                    closeContextMenu();
                  }}
                >
                  Rename
                </button>
                <button
                  className="w-full text-left px-3 py-1 text-xs text-red-400 hover:bg-zinc-700"
                  onClick={() => { if (contextMenu.id) deleteDocument(contextMenu.id); closeContextMenu(); }}
                >
                  Delete Document
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
