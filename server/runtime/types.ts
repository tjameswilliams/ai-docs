export interface SqliteDatabase {
  exec(sql: string): void;
  query(
    sql: string
  ): { get(...args: unknown[]): unknown; all(...args: unknown[]): unknown[] };
  prepare(sql: string): {
    get(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
    run(...args: unknown[]): void;
  };
  close(): void;
}

export interface RuntimeAdapter {
  createDatabase(path: string): SqliteDatabase;
  createDrizzle(
    db: SqliteDatabase,
    schema: Record<string, unknown>
  ): unknown;
  writeFile(path: string, data: ArrayBuffer | Uint8Array): Promise<void>;
  readFileBuffer(path: string): Promise<ArrayBuffer>;
  readFileText(path: string): Promise<string>;
  fileExists(path: string): Promise<boolean>;
  getMimeType(path: string): string;
  getDataDir(): string;
  getServerDir(): string;
}
