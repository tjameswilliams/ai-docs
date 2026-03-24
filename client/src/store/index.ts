import { create } from "zustand";
import { api } from "../api/client";
import { retryLastMessage as chatRetry, restartFromMessage as chatRestart } from "../lib/chatStream";
import type { Project, Folder, Document, ChatMessage } from "../types";

interface AppState {
  // Projects
  projects: Project[];
  project: Project | null;
  loadProjects: () => Promise<void>;
  loadProject: (id: string) => Promise<void>;
  createProject: (name: string) => Promise<void>;
  updateProject: (id: string, data: Record<string, unknown>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;

  // Folders
  folders: Folder[];
  loadFolders: () => Promise<void>;
  createFolder: (name: string, parentId?: string) => Promise<void>;
  updateFolder: (id: string, data: Record<string, unknown>) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;

  // Documents
  documents: Document[];
  activeDocument: Document | null;
  loadDocuments: () => Promise<void>;
  setActiveDocument: (doc: Document | null) => void;
  createDocument: (title?: string, folderId?: string) => Promise<void>;
  updateDocument: (id: string, data: Record<string, unknown>) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;

  // Editor context (cursor, selection, surrounding text)
  editorContext: {
    cursorLine: number;
    cursorPos: number;
    selectedText: string;
    beforeCursor: string;  // ~500 chars before cursor
    afterCursor: string;   // ~500 chars after cursor
    headingPath: string[];  // heading breadcrumb e.g. ["Chapter 1", "Introduction"]
  } | null;
  setEditorContext: (ctx: AppState["editorContext"]) => void;

  // Chat
  messages: ChatMessage[];
  isStreaming: boolean;
  contextStatus: { used: number; total: number } | null;
  isSummarizing: boolean;
  loadMessages: () => Promise<void>;
  clearMessages: () => Promise<void>;
  summarizeChat: () => Promise<void>;
  retryLastMessage: () => void;
  restartFromMessage: (messageId: string) => void;

  // Settings
  settings: Record<string, string>;
  loadSettings: () => Promise<void>;
  updateSettings: (data: Record<string, string>) => Promise<void>;
  showSettings: boolean;
  setShowSettings: (v: boolean) => void;
  showStyleGuide: boolean;
  setShowStyleGuide: (v: boolean) => void;
}

export const useStore = create<AppState>((set, get) => ({
  // Projects
  projects: [],
  project: null,
  loadProjects: async () => {
    const projects = await api.listProjects();
    set({ projects });
  },
  loadProject: async (id) => {
    const project = await api.getProject(id);
    set({ project, activeDocument: null });
    await Promise.all([get().loadFolders(), get().loadDocuments(), get().loadMessages()]);
  },
  createProject: async (name) => {
    const project = await api.createProject({ name });
    set((s) => ({ projects: [...s.projects, project], project }));
    await Promise.all([get().loadFolders(), get().loadDocuments()]);
  },
  updateProject: async (id, data) => {
    const updated = await api.updateProject(id, data);
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? updated : p)),
      project: s.project?.id === id ? updated : s.project,
    }));
  },
  deleteProject: async (id) => {
    await api.deleteProject(id);
    const projects = get().projects.filter((p) => p.id !== id);
    set({ projects });
    if (get().project?.id === id) {
      if (projects.length > 0) {
        await get().loadProject(projects[0].id);
      } else {
        set({ project: null, folders: [], documents: [], activeDocument: null, messages: [] });
      }
    }
  },

  // Folders
  folders: [],
  loadFolders: async () => {
    const project = get().project;
    if (!project) return;
    const folders = await api.listFolders(project.id);
    set({ folders });
  },
  createFolder: async (name, parentId) => {
    const project = get().project;
    if (!project) return;
    await api.createFolder(project.id, { name, parentId });
    await get().loadFolders();
  },
  updateFolder: async (id, data) => {
    await api.updateFolder(id, data);
    await get().loadFolders();
  },
  deleteFolder: async (id) => {
    await api.deleteFolder(id);
    await Promise.all([get().loadFolders(), get().loadDocuments()]);
  },

  // Documents
  documents: [],
  activeDocument: null,
  loadDocuments: async () => {
    const project = get().project;
    if (!project) return;
    const documents = await api.listDocuments(project.id);
    set({ documents });
    // Refresh active document if it still exists
    const active = get().activeDocument;
    if (active) {
      const updated = documents.find((d) => d.id === active.id);
      if (updated) set({ activeDocument: updated });
      else set({ activeDocument: null });
    }
  },
  setActiveDocument: (doc) => set({ activeDocument: doc }),
  createDocument: async (title, folderId) => {
    const project = get().project;
    if (!project) return;
    const doc = await api.createDocument(project.id, { title, folderId });
    await get().loadDocuments();
    set({ activeDocument: doc });
  },
  updateDocument: async (id, data) => {
    await api.updateDocument(id, data);
    await get().loadDocuments();
  },
  deleteDocument: async (id) => {
    await api.deleteDocument(id);
    if (get().activeDocument?.id === id) {
      set({ activeDocument: null });
    }
    await get().loadDocuments();
  },

  // Editor context
  editorContext: null,
  setEditorContext: (ctx) => set({ editorContext: ctx }),

  // Chat
  messages: [],
  isStreaming: false,
  contextStatus: null,
  isSummarizing: false,
  loadMessages: async () => {
    const project = get().project;
    if (!project) return;
    try {
      const rows = await api.listMessages(project.id);
      const messages: ChatMessage[] = rows.map((r: any) => ({
        id: r.id,
        role: r.role,
        content: r.content,
        thinking: r.thinking || undefined,
        toolCalls: r.toolCalls ? (typeof r.toolCalls === "string" ? JSON.parse(r.toolCalls) : r.toolCalls) : undefined,
        segments: r.segments ? (typeof r.segments === "string" ? JSON.parse(r.segments) : r.segments) : undefined,
        timestamp: r.createdAt,
      }));
      set({ messages });
    } catch {
      set({ messages: [] });
    }
  },
  clearMessages: async () => {
    const p = get().project;
    if (p) {
      api.clearMessages(p.id).catch((e) => console.error("[store] clear messages failed", e));
    }
    set({ messages: [], contextStatus: null });
  },
  summarizeChat: async () => {
    const pid = get().project?.id;
    if (!pid || get().isSummarizing || get().isStreaming) return;
    set({ isSummarizing: true });
    try {
      const { summary, messageId } = await api.summarizeMessages(pid);
      const summaryMsg: ChatMessage = {
        id: messageId,
        role: "system",
        content: summary,
        timestamp: new Date().toISOString(),
      };
      set({ messages: [summaryMsg] });
    } finally {
      set({ isSummarizing: false });
    }
  },
  retryLastMessage: () => chatRetry(),
  restartFromMessage: (messageId) => chatRestart(messageId),

  // Settings
  settings: {},
  loadSettings: async () => {
    const settings = await api.getSettings();
    set({ settings });
  },
  updateSettings: async (data) => {
    const settings = await api.updateSettings(data);
    set({ settings });
  },
  showSettings: false,
  setShowSettings: (v) => set({ showSettings: v }),
  showStyleGuide: false,
  setShowStyleGuide: (v) => set({ showStyleGuide: v }),
}));
