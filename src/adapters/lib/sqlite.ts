// node:sqlite is experimental and only exists on Node >= 22.5 — load it lazily and
// tolerate its absence entirely rather than crashing the whole CLI on older Node.
export interface SqliteRow {
  [key: string]: unknown;
}
export interface SqliteDatabase {
  prepare(sql: string): { all(...params: unknown[]): SqliteRow[]; get(...params: unknown[]): SqliteRow | undefined };
  close(): void;
}

export async function openDb(path: string): Promise<SqliteDatabase | undefined> {
  try {
    // Built as a non-literal specifier so bundlers (esbuild/tsup) don't rewrite
    // "node:sqlite" to the bare, non-existent "sqlite" module at build time.
    const specifier = ["node", "sqlite"].join(":");
    const mod = (await import(specifier)) as { DatabaseSync: new (p: string, opts: object) => SqliteDatabase };
    return new mod.DatabaseSync(path, { readOnly: true });
  } catch {
    return undefined; // node:sqlite unavailable (Node < 22.5) or the db file is locked/corrupt
  }
}
