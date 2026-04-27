import { useState } from "react";
import { useStore } from "../../store";
import type { Folder, Document } from "../../types";
import { Icon } from "../ui";

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

  // Sidebar row used for both folders and documents.
  // active = blue tint gradient + 1px blue border + 2px glowing left rail.
  // hover  = rgba(63,63,70,0.4) bg.
  const rowClass = "flex items-center gap-1.5 px-2.5 text-xs cursor-pointer relative transition-all duration-[120ms] group";
  const rowStyle = (active: boolean, depth: number) => ({
    paddingLeft: `${depth * 12 + 10}px`,
    height: 26,
    borderRadius: 5,
    color: active ? "#fafafa" : "#a1a1aa",
    background: active ? "var(--gradient-row-active)" : "transparent",
    border: active ? "1px solid rgba(59,130,246,0.25)" : "1px solid transparent",
  });

  const renderFolder = (folder: Folder, depth: number = 0) => {
    const isExpanded = expandedFolders.has(folder.id);
    const childFolders = getChildFolders(folder.id);
    const childDocs = getChildDocuments(folder.id);

    return (
      <div key={folder.id}>
        <div
          className={rowClass + " hover:bg-[rgba(63,63,70,0.4)]"}
          style={rowStyle(false, depth)}
          onClick={() => toggleFolder(folder.id)}
          onContextMenu={(e) => handleContextMenu(e, "folder", folder.id)}
          draggable
          onDragStart={() => setDragItem({ id: folder.id, type: "folder" })}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDrop(folder.id, e)}
        >
          <Icon
            name={isExpanded ? "caret-d" : "caret-r"}
            size={11}
            className="text-zinc-500 shrink-0"
          />
          <Icon
            name={isExpanded ? "folder-open" : "folder"}
            size={13}
            className="text-zinc-400 shrink-0"
          />
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
            <span className="truncate">{folder.name}</span>
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
        className={rowClass + " hover:bg-[rgba(63,63,70,0.4)]"}
        style={rowStyle(isActive, depth)}
        onClick={() => setActiveDocument(doc)}
        onContextMenu={(e) => handleContextMenu(e, "document", doc.id)}
        draggable
        onDragStart={() => setDragItem({ id: doc.id, type: "document" })}
      >
        {/* Glowing left rail when active */}
        {isActive && (
          <div
            className="absolute"
            style={{
              left: -1,
              top: 6,
              bottom: 6,
              width: 2,
              background: "#3b82f6",
              borderRadius: "0 2px 2px 0",
              boxShadow: "0 0 8px #3b82f6",
            }}
          />
        )}
        {/* Spacer where folder caret would be */}
        <span style={{ width: 11 }} />
        <Icon name="file-text" size={13} className={isActive ? "text-blue-400 shrink-0" : "text-zinc-500 shrink-0"} />
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
      className="flex-1 overflow-auto py-1 px-1.5"
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
            className="fixed z-50 py-1 min-w-[160px]"
            style={{
              left: contextMenu.x,
              top: contextMenu.y,
              background: "#1f1f23",
              border: "1px solid #3f3f46",
              borderRadius: 6,
              boxShadow: "var(--shadow-popover)",
            }}
          >
            <button
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-800 text-zinc-300 flex items-center gap-2"
              onClick={() => { createDocument(undefined, contextMenu.type === "folder" ? contextMenu.id : undefined); closeContextMenu(); }}
            >
              <Icon name="file-plus" size={12} />
              New Document
            </button>
            <button
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-800 text-zinc-300 flex items-center gap-2"
              onClick={() => { createFolder("New Folder", contextMenu.type === "folder" ? contextMenu.id : undefined); closeContextMenu(); }}
            >
              <Icon name="folder-plus" size={12} />
              New Folder
            </button>
            {contextMenu.type === "folder" && contextMenu.id && (
              <>
                <hr className="my-1" style={{ borderColor: "#27272a" }} />
                <button
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-800 text-zinc-300 flex items-center gap-2"
                  onClick={() => {
                    const folder = folders.find((f) => f.id === contextMenu.id);
                    if (folder) setRenaming({ id: folder.id, type: "folder", name: folder.name });
                    closeContextMenu();
                  }}
                >
                  <Icon name="pencil" size={12} />
                  Rename
                </button>
                <button
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-800 text-red-400 flex items-center gap-2"
                  onClick={() => { if (contextMenu.id && confirm("Delete folder and all its documents?")) deleteFolder(contextMenu.id); closeContextMenu(); }}
                >
                  <Icon name="trash" size={12} />
                  Delete Folder
                </button>
              </>
            )}
            {contextMenu.type === "document" && contextMenu.id && (
              <>
                <hr className="my-1" style={{ borderColor: "#27272a" }} />
                <button
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-800 text-zinc-300 flex items-center gap-2"
                  onClick={() => {
                    const doc = documents.find((d) => d.id === contextMenu.id);
                    if (doc) setRenaming({ id: doc.id, type: "document", name: doc.title });
                    closeContextMenu();
                  }}
                >
                  <Icon name="pencil" size={12} />
                  Rename
                </button>
                <button
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-800 text-red-400 flex items-center gap-2"
                  onClick={() => { if (contextMenu.id) deleteDocument(contextMenu.id); closeContextMenu(); }}
                >
                  <Icon name="trash" size={12} />
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
