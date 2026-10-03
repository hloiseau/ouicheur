import { pollPriceWatches } from "./price-history.ts";
import {
  readdirSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  chmodSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { DatabaseSync } from "node:sqlite";
import { create as createTar } from "tar";
import { chromium } from "playwright-core";
import { atomic, audit, dataDir } from "./db.ts";
import { backupInstance } from "./backup.ts";
import { getSettings } from "./settings.ts";
import {
  deliverNotifications,
  enqueueNotification,
  scheduleReminders,
} from "./notifications.ts";
import { AppError, dateNow } from "./validation.ts";
import { storageStats } from "./storage.ts";

export const backupDir = () => resolve(process.env.BACKUP_DIR || "backups");
export function backupHistory(db: DatabaseSync) {
  return db
    .prepare("SELECT * FROM backup_jobs ORDER BY created_at DESC LIMIT 100")
    .all();
}
export async function createBackup(
  db: DatabaseSync,
  source = dataDir(),
  root = backupDir(),
) {
  const id = randomUUID();
  atomic(db, () => {
    db.prepare(
      "UPDATE backup_jobs SET state='failed' WHERE state='running' AND created_at<?",
    ).run(new Date(Date.now() - 3600000).toISOString());
    if (db.prepare("SELECT 1 FROM backup_jobs WHERE state='running'").get())
      throw new AppError("Une sauvegarde est déjà en cours.", 409);
    db.prepare(
      "INSERT INTO backup_jobs(id,state,created_at) VALUES (?,'running',?)",
    ).run(id, dateNow());
  });
  const folder = join(root, id);
  const archive = join(root, id + ".tar.gz");
  try {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    backupInstance(db, source, folder);
    await createTar(
      { cwd: folder, file: archive, gzip: true, portable: true },
      ["manifest.json", "wishlist.sqlite", "images"],
    );
    chmodSync(archive, 0o600);
    db.prepare("UPDATE backup_jobs SET state='done',bytes=? WHERE id=?").run(
      statSync(archive).size,
      id,
    );
    rmSync(folder, { recursive: true, force: true });
    // Only successful, managed backups are pruned, and only after a new successful backup.
    const stale = db
      .prepare(
        "SELECT id FROM backup_jobs WHERE state='done' ORDER BY created_at DESC,id DESC LIMIT -1 OFFSET ?",
      )
      .all(getSettings(db).backup_keep);
    for (const row of stale) {
      rmSync(join(root, String(row.id) + ".tar.gz"), { force: true });
      db.prepare("DELETE FROM backup_jobs WHERE id=?").run(row.id);
    }
    audit(db, "backup.create", id);
    return id;
  } catch {
    db.prepare("UPDATE backup_jobs SET state='failed' WHERE id=?").run(id);
    enqueueNotification(db, "backup_failed", id);
    rmSync(folder, { recursive: true, force: true });
    rmSync(archive, { force: true });
    throw new AppError(
      "La sauvegarde a échoué. Vérifiez l’espace libre et les permissions du dossier de sauvegarde.",
      500,
    );
  }
}
export function downloadBackup(
  db: DatabaseSync,
  id: string,
  root = backupDir(),
) {
  if (
    !/^[a-f0-9-]{36}$/.test(id) ||
    !db.prepare("SELECT 1 FROM backup_jobs WHERE id=? AND state='done'").get(id)
  )
    throw new AppError("Sauvegarde introuvable.", 404);
  const path = join(root, id + ".tar.gz");
  if (!existsSync(path)) throw new AppError("Sauvegarde introuvable.", 404);
  return new Response(
    Readable.toWeb(createReadStream(path)) as ReadableStream,
    {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="ouicheur-${id}.tar.gz"`,
        "Content-Length": String(statSync(path).size),
        "Cache-Control": "private, no-store",
      },
    },
  );
}
export function diagnostics(db: DatabaseSync, folder = dataDir()) {
  let version = "unknown";
  try {
    version = JSON.parse(readFileSync(resolve("package.json"), "utf8")).version;
  } catch {}
  const counts: Record<string, number> = {};
  for (const table of ["gifts", "lists", "reservations", "imports"])
    counts[table] = Number(
      db.prepare(`SELECT COUNT(*) n FROM ${table}`).get()!.n,
    );
  return {
    version,
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    sqlite: String(
      db.prepare("SELECT sqlite_version() version").get()!.version,
    ),
    chromium:
      existsSync(chromium.executablePath()) ||
      (() => {
        const root =
          process.env.PLAYWRIGHT_BROWSERS_PATH || resolve(".local/pw-browsers");
        return (
          existsSync(root) &&
          readdirSync(root).some(
            (n) =>
              n.startsWith("chromium_headless_shell-") &&
              [
                "chrome-headless-shell-linux64/chrome-headless-shell",
                "chrome-headless-shell-linux-arm64/chrome-headless-shell",
                "chrome-linux/headless_shell",
                "chrome-linux64/headless_shell",
                "chrome-linux-arm64/headless_shell",
              ].some((p) => existsSync(join(root, n, p))),
          )
        );
      })(),
    storage: storageStats(folder),
    counts,
    ntfy_configured: !!process.env.NTFY_URL,
    last_backup:
      db
        .prepare(
          "SELECT state,created_at,bytes FROM backup_jobs ORDER BY created_at DESC LIMIT 1",
        )
        .get() || null,
    notification_counts: db
      .prepare(
        "SELECT state,COUNT(*) count FROM notification_jobs GROUP BY state",
      )
      .all(),
  };
}
export async function runMaintenance(db: DatabaseSync) {
  if (!db.prepare("SELECT 1 FROM owner").get()) return;
  const settings = getSettings(db);
  if (settings.backup_hours) {
    const last = db
      .prepare(
        "SELECT created_at FROM backup_jobs ORDER BY created_at DESC LIMIT 1",
      )
      .get();
    // Failures retry after an hour; successful schedules use their configured interval.
    const lastState = db
      .prepare("SELECT state FROM backup_jobs ORDER BY created_at DESC LIMIT 1")
      .get();
    const interval =
      lastState?.state === "failed" ? 3600000 : settings.backup_hours * 3600000;
    if (!last || Date.parse(String(last.created_at)) + interval < Date.now())
      await createBackup(db).catch(() => {});
  }
  await pollPriceWatches(db);
  scheduleReminders(db);
  await deliverNotifications(db);
}
