import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { resolve, dirname, extname } from "path";
import type { RuntimeAdapter, SqliteDatabase } from "./types";

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".md": "text/markdown",
  ".json": "application/json",
};

const serverDir = dirname(import.meta.dir); // server/runtime/ -> server/
const projectRoot = resolve(serverDir, "..");

const adapter: RuntimeAdapter = {
  createDatabase(path: string): SqliteDatabase {
    return new Database(path, { create: true }) as unknown as SqliteDatabase;
  },

  createDrizzle(db: SqliteDatabase, schema: Record<string, unknown>) {
    return drizzle(db as unknown as Database, { schema });
  },

  async writeFile(path: string, data: ArrayBuffer | Uint8Array): Promise<void> {
    await Bun.write(path, data);
  },

  async readFileBuffer(path: string): Promise<ArrayBuffer> {
    const file = Bun.file(path);
    return file.arrayBuffer();
  },

  async readFileText(path: string): Promise<string> {
    const file = Bun.file(path);
    return file.text();
  },

  async fileExists(path: string): Promise<boolean> {
    const file = Bun.file(path);
    return file.exists();
  },

  getMimeType(path: string): string {
    const ext = extname(path).toLowerCase();
    return MIME_MAP[ext] || "application/octet-stream";
  },

  getDataDir(): string {
    return projectRoot;
  },

  getServerDir(): string {
    return serverDir;
  },
};

export default adapter;
