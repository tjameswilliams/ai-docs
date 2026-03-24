import {
  writeFile as fsWriteFile,
  readFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
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

const _nodeFile = fileURLToPath(import.meta.url);
const _nodeDir = dirname(_nodeFile);
const serverDir = resolve(_nodeDir, ".."); // server/runtime/ -> server/
const fallbackRoot = resolve(serverDir, "..");

// Store raw better-sqlite3 instances so drizzle can access native methods
const rawDbMap = new WeakMap<object, any>();

const adapter: RuntimeAdapter = {
  createDatabase(path: string): SqliteDatabase {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const BetterSqlite3 = require("better-sqlite3") as new (filename: string) => any;
    const raw = new BetterSqlite3(path);

    const wrapped: SqliteDatabase = {
      exec(sql: string) {
        raw.exec(sql);
      },
      query(sql: string) {
        const stmt = raw.prepare(sql);
        return {
          get(...args: unknown[]) {
            return stmt.get(...args);
          },
          all(...args: unknown[]) {
            return stmt.all(...args);
          },
        };
      },
      prepare(sql: string) {
        const stmt = raw.prepare(sql);
        return {
          get(...args: unknown[]) {
            return stmt.get(...args);
          },
          all(...args: unknown[]) {
            return stmt.all(...args);
          },
          run(...args: unknown[]) {
            stmt.run(...args);
          },
        };
      },
      close() {
        raw.close();
      },
    };

    rawDbMap.set(wrapped, raw);
    return wrapped;
  },

  createDrizzle(db: SqliteDatabase, schema: Record<string, unknown>) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { drizzle } = require("drizzle-orm/better-sqlite3") as { drizzle: any };
    const raw = rawDbMap.get(db);
    if (!raw) throw new Error("Database was not created via runtime adapter");
    return drizzle(raw, { schema });
  },

  async writeFile(
    path: string,
    data: ArrayBuffer | Uint8Array
  ): Promise<void> {
    await fsWriteFile(path, new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer));
  },

  async readFileBuffer(path: string): Promise<ArrayBuffer> {
    const buf = await readFile(path);
    return buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength
    ) as ArrayBuffer;
  },

  async readFileText(path: string): Promise<string> {
    return readFile(path, "utf-8");
  },

  async fileExists(path: string): Promise<boolean> {
    return existsSync(path);
  },

  getMimeType(path: string): string {
    const ext = extname(path).toLowerCase();
    return MIME_MAP[ext] || "application/octet-stream";
  },

  getDataDir(): string {
    return process.env.AI_DOCS_DATA_DIR || fallbackRoot;
  },

  getServerDir(): string {
    return serverDir;
  },
};

export default adapter;
