import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const folders = sqliteTable("folders", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  parentId: text("parent_id"),
  name: text("name").notNull(),
  order: integer("order").default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  folderId: text("folder_id").references(() => folders.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Untitled"),
  content: text("content").default(""),
  order: integer("order").default(0),
  wordCount: integer("word_count").default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const documentEmbeddings = sqliteTable("document_embeddings", {
  id: text("id").primaryKey(),
  documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  chunkText: text("chunk_text").notNull(),
  embedding: text("embedding").notNull(), // JSON array of floats
  createdAt: text("created_at").notNull(),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // system, user, assistant, tool
  content: text("content").notNull(),
  thinking: text("thinking"),
  toolCalls: text("tool_calls"), // JSON
  segments: text("segments"), // JSON
  createdAt: text("created_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  batchId: text("batch_id").notNull(),
  sequence: integer("sequence").notNull(),
  entityType: text("entity_type").notNull(), // folder, document
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(), // create, update, delete
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  source: text("source").notNull().default("ui"), // ui, chat, mcp
  description: text("description").default(""),
  undone: integer("undone").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const styleSources = sqliteTable("style_sources", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "upload", "url", "document" (reference to project doc)
  name: text("name").notNull(),
  content: text("content").notNull(), // extracted text content
  url: text("url"), // original URL if type=url
  documentId: text("document_id"), // reference if type=document
  wordCount: integer("word_count").default(0),
  createdAt: text("created_at").notNull(),
});

export const styleProfiles = sqliteTable("style_profiles", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  guide: text("guide").notNull(), // the generated style guide text
  examples: text("examples"), // JSON array of extracted example passages
  metadata: text("metadata"), // JSON with analysis stats
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const mcpServers = sqliteTable("mcp_servers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  command: text("command").notNull(),
  args: text("args").default("[]"),
  env: text("env").default("{}"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
