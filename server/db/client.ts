import { runtime } from "../runtime";
import * as schema from "./schema";
import { resolve } from "path";
import { runMigrations } from "./migrations";

let _sqlite: any;
let _db: any;
let _initialized = false;

function ensureInit() {
  if (_initialized) return;
  _initialized = true;

  const dbPath = resolve(runtime.getDataDir(), "data.db");
  console.log("[db] Opening database at:", dbPath);
  _sqlite = runtime.createDatabase(dbPath);
  _sqlite.exec("PRAGMA journal_mode = WAL;");
  _sqlite.exec("PRAGMA foreign_keys = ON;");

  runMigrations(_sqlite);

  _db = runtime.createDrizzle(_sqlite, schema);
}

export const sqlite = new Proxy({} as any, {
  get(_target, prop) {
    ensureInit();
    const val = _sqlite[prop];
    if (typeof val === "function") return val.bind(_sqlite);
    return val;
  },
});

export const db = new Proxy({} as any, {
  get(_target, prop) {
    ensureInit();
    const val = _db[prop];
    if (typeof val === "function") return val.bind(_db);
    return val;
  },
}) as ReturnType<typeof import("drizzle-orm/bun-sqlite").drizzle>;

export { schema };
