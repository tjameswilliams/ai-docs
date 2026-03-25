import type {
  Project,
  Folder,
  Document,
  ChatMessage,
} from "../types";

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

export const api = {
  // Projects
  listProjects: () => request<Project[]>("/projects"),
  getProject: (id: string) => request<Project>(`/projects/${id}`),
  createProject: (data: { name: string; description?: string }) =>
    request<Project>("/projects", { method: "POST", body: JSON.stringify(data) }),
  updateProject: (id: string, data: Record<string, unknown>) =>
    request<Project>(`/projects/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteProject: (id: string) =>
    request<{ success: boolean }>(`/projects/${id}`, { method: "DELETE" }),

  // Folders
  listFolders: (projectId: string) =>
    request<Folder[]>(`/projects/${projectId}/folders`),
  createFolder: (projectId: string, data: { name: string; parentId?: string }) =>
    request<Folder>(`/projects/${projectId}/folders`, { method: "POST", body: JSON.stringify(data) }),
  updateFolder: (id: string, data: Record<string, unknown>) =>
    request<Folder>(`/folders/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteFolder: (id: string) =>
    request<{ success: boolean }>(`/folders/${id}`, { method: "DELETE" }),

  // Documents
  listDocuments: (projectId: string) =>
    request<Document[]>(`/projects/${projectId}/documents`),
  getDocument: (id: string) => request<Document>(`/documents/${id}`),
  createDocument: (projectId: string, data: { title?: string; folderId?: string }) =>
    request<Document>(`/projects/${projectId}/documents`, { method: "POST", body: JSON.stringify(data) }),
  updateDocument: (id: string, data: Record<string, unknown>) =>
    request<Document>(`/documents/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteDocument: (id: string) =>
    request<{ success: boolean }>(`/documents/${id}`, { method: "DELETE" }),

  // Messages
  listMessages: (projectId: string) =>
    request<ChatMessage[]>(`/projects/${projectId}/messages`),
  saveMessage: (projectId: string, data: Record<string, unknown>) =>
    request<ChatMessage>(`/projects/${projectId}/messages`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  clearMessages: (projectId: string) =>
    request<{ success: boolean }>(`/projects/${projectId}/messages`, { method: "DELETE" }),
  deleteMessagesAfter: (projectId: string, messageId: string) =>
    request<{ success: boolean }>(`/projects/${projectId}/messages/${messageId}/after`, { method: "DELETE" }),
  summarizeMessages: (projectId: string) =>
    request<{ summary: string; messageId: string }>("/chat/summarize", {
      method: "POST",
      body: JSON.stringify({ projectId }),
    }),

  // File uploads (for chat attachments)
  upload: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/uploads", {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return res.json() as Promise<{ url: string }>;
  },

  // Undo/Redo
  undo: (projectId: string) =>
    request<{ success: boolean; label?: string; canUndo: boolean; canRedo: boolean }>(
      `/projects/${projectId}/undo`, { method: "POST" }
    ),
  redo: (projectId: string) =>
    request<{ success: boolean; label?: string; canUndo: boolean; canRedo: boolean }>(
      `/projects/${projectId}/redo`, { method: "POST" }
    ),
  getHistory: (projectId: string) =>
    request<{ canUndo: boolean; canRedo: boolean }>(
      `/projects/${projectId}/history`
    ),

  // Search
  searchDocuments: (projectId: string, query: string, topK = 10) =>
    request<Array<{
      documentId: string;
      documentTitle: string;
      folderId: string | null;
      chunkText: string;
      score: number;
    }>>(`/projects/${projectId}/search?q=${encodeURIComponent(query)}&topK=${topK}`),

  // Style Guide
  listStyleSources: (projectId: string) =>
    request<any[]>(`/projects/${projectId}/style/sources`),
  addStyleSourceText: (projectId: string, data: { name: string; content: string }) =>
    request<any>(`/projects/${projectId}/style/sources`, { method: "POST", body: JSON.stringify({ ...data, type: "upload" }) }),
  addStyleSourceUrl: (projectId: string, url: string) =>
    request<any>(`/projects/${projectId}/style/sources/url`, { method: "POST", body: JSON.stringify({ url }) }),
  addStyleSourceDocument: (projectId: string, documentId: string) =>
    request<any>(`/projects/${projectId}/style/sources/document`, { method: "POST", body: JSON.stringify({ documentId }) }),
  uploadStyleSource: async (projectId: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`/api/projects/${projectId}/style/sources/upload`, { method: "POST", body: formData });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return res.json();
  },
  deleteStyleSource: (id: string) =>
    request<{ success: boolean }>(`/style/sources/${id}`, { method: "DELETE" }),
  getStyleProfile: (projectId: string) =>
    request<{ guide: string | null; examples: string[]; metadata: any }>(`/projects/${projectId}/style/profile`),
  generateStyleProfile: (projectId: string) =>
    request<{ guide: string; examples: string[]; metadata: any }>(`/projects/${projectId}/style/generate`, { method: "POST" }),
  updateStyleProfile: (projectId: string, guide: string) =>
    request<{ success: boolean }>(`/projects/${projectId}/style/profile`, { method: "PUT", body: JSON.stringify({ guide }) }),

  // MCP Servers
  mcpServers: {
    list: () => request<any[]>("/mcp-servers"),
    create: (data: { name: string; command: string; args: string[]; env: Record<string, string> }) =>
      request<any>("/mcp-servers", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      request<any>(`/mcp-servers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/mcp-servers/${id}`, { method: "DELETE" }),
    test: (id: string) =>
      request<{ success: boolean; tools?: string[]; error?: string }>(`/mcp-servers/${id}/test`, { method: "POST" }),
    reconnect: (id: string) =>
      request<{ success: boolean }>(`/mcp-servers/${id}/reconnect`, { method: "POST" }),
    getConfig: () =>
      request<{ mcpServers: Record<string, any> }>("/mcp-servers/config"),
    putConfig: (config: { mcpServers: Record<string, any> }) =>
      request<{ success: boolean; servers: any[] }>("/mcp-servers/config", { method: "PUT", body: JSON.stringify(config) }),
  },

  // Settings
  getSettings: () => request<Record<string, string>>("/settings"),
  updateSettings: (data: Record<string, string>) =>
    request<Record<string, string>>("/settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
};
