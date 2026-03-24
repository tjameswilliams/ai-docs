export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface Folder {
  id: string;
  projectId: string;
  parentId: string | null;
  name: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface Document {
  id: string;
  projectId: string;
  folderId: string | null;
  title: string;
  content: string;
  order: number;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  thinking?: string;
  toolCalls?: ToolCall[];
  segments?: MessageSegment[];
  attachments?: ChatAttachment[];
  timestamp?: string;
  createdAt?: string;
}

export interface MessageSegment {
  type: "text" | "thinking" | "tool_call";
  content?: string;
  toolCall?: ToolCall;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments?: Record<string, unknown>;
  result?: unknown;
  status: "pending" | "executed" | "rejected";
}

export interface ToolCallResult {
  toolCallId: string;
  name: string;
  args: Record<string, unknown>;
  result: unknown;
  success: boolean;
}

export interface ChatAttachment {
  url: string;
  name: string;
  type: string;
}

export interface LLMSettings {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  temperature: string;
  maxOutputTokens: string;
  contextWindow: string;
  embeddingApiBaseUrl: string;
  embeddingApiKey: string;
  embeddingModel: string;
}

export interface UndoRedoResult {
  success: boolean;
  label?: string;
  canUndo: boolean;
  canRedo: boolean;
}

export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
}

export interface McpServerConfig {
  id: string;
  name: string;
  command: string;
  args: string;
  env: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
