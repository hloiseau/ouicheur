import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

export const dataDir = () => resolve(process.env.DATA_DIR || "data");
export function openDatabase(path = join(dataDir(), "wishlist.sqlite")) {
  if (path !== ":memory:") mkdirSync(resolve(path, ".."), { recursive: true });
  const db = new DatabaseSync(path, { timeout: 5000 });
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
  );
  db.exec(
    "CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY) STRICT",
  );
  for (const name of readdirSync(resolve("migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    atomic(db, () => {
      if (!db.prepare("SELECT 1 FROM migrations WHERE name=?").get(name)) {
        db.exec(readFileSync(resolve("migrations", name), "utf8"));
        db.prepare("INSERT INTO migrations VALUES (?)").run(name);
      }
    });
  }
  return db;
}
let connection: DatabaseSync | undefined;
export const database = () => (connection ??= openDatabase());
export function atomic<T>(db: DatabaseSync, work: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const value = work();
    db.exec("COMMIT");
    return value;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
export function audit(
  db: DatabaseSync,
  action: string,
  entity: string,
  detail: unknown = {},
) {
  db.prepare(
    "INSERT INTO audit(action,entity_id,detail,created_at) VALUES (?,?,?,?)",
  ).run(action, entity, JSON.stringify(detail), new Date().toISOString());
}
