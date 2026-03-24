import type { SqliteDatabase } from "../runtime/types";

const migrations: string[] = [
  // ── Migration 1: Initial schema ──
  `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id TEXT,
  name TEXT NOT NULL,
  "order" INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  folder_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled',
  content TEXT DEFAULT '',
  "order" INTEGER DEFAULT 0,
  word_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS document_embeddings (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  thinking TEXT,
  tool_calls TEXT,
  segments TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  batch_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  source TEXT NOT NULL DEFAULT 'ui',
  description TEXT DEFAULT '',
  undone INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  command TEXT NOT NULL,
  args TEXT DEFAULT '[]',
  env TEXT DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
  `,

  // ── Migration 2: Writing style guide ──
  `
CREATE TABLE IF NOT EXISTS style_sources (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  url TEXT,
  document_id TEXT,
  word_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS style_profiles (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  guide TEXT NOT NULL,
  examples TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
  `,
];

export function runMigrations(sqlite: SqliteDatabase): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const row = sqlite.query("SELECT value FROM _schema_meta WHERE key = 'version'").get() as
    | { value: string }
    | null;
  let currentVersion = row ? parseInt(row.value, 10) : 0;

  if (currentVersion === 0) {
    const tableCheck = sqlite
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'")
      .get();
    if (tableCheck) {
      currentVersion = 1;
      sqlite.exec(
        `INSERT OR REPLACE INTO _schema_meta (key, value) VALUES ('version', '1')`
      );
      console.log("[db] Existing database detected, marked as schema version 1");
    }
  }

  if (currentVersion >= migrations.length) return;

  console.log(
    `[db] Running migrations ${currentVersion + 1}..${migrations.length}`
  );

  for (let i = currentVersion; i < migrations.length; i++) {
    const version = i + 1;
    try {
      sqlite.exec("BEGIN");
      sqlite.exec(migrations[i]);
      sqlite.exec(
        `INSERT OR REPLACE INTO _schema_meta (key, value) VALUES ('version', '${version}')`
      );
      sqlite.exec("COMMIT");
      console.log(`[db] Migration ${version} applied`);
    } catch (err) {
      sqlite.exec("ROLLBACK");
      console.error(`[db] Migration ${version} failed:`, err);
      throw err;
    }
  }
}
