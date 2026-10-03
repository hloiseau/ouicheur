import {
  mkdirSync,
  copyFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { AppError } from "./validation.ts";

const digest = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
export function backupInstance(
  db: DatabaseSync,
  source: string,
  destination: string,
) {
  const folder = resolve(destination);
  if (existsSync(folder))
    throw new AppError(
      "Choisissez un dossier de sauvegarde qui n’existe pas encore.",
    );
  mkdirSync(join(folder, "images"), { recursive: true, mode: 0o700 });
  const snapshotPath = join(folder, "wishlist.sqlite");
  // VACUUM INTO obtains a coherent SQLite snapshot including committed WAL pages.
  db.prepare("VACUUM INTO ?").run(snapshotPath);
  const snapshot = new DatabaseSync(snapshotPath, { readOnly: true });
  try {
    const names = new Set<string>();
    const rows = snapshot
      .prepare(
        "SELECT image path FROM gifts UNION SELECT image FROM categories UNION SELECT avatar FROM owner UNION SELECT banner FROM owner UNION SELECT background FROM owner UNION SELECT json_extract(item.value, '$.image') FROM imports, json_each(imports.items) item",
      )
      .all();
    for (const row of rows) {
      const path = String(row.path);
      if (/^\/media\/[a-f0-9]{64}\.webp$/.test(path)) names.add(path.slice(7));
    }
    for (const name of names)
      copyFileSync(join(source, "images", name), join(folder, "images", name));
    const files = [
      "wishlist.sqlite",
      ...[...names].map((name) => `images/${name}`),
    ];
    writeFileSync(
      join(folder, "manifest.json"),
      JSON.stringify(
        {
          version: 1,
          created_at: new Date().toISOString(),
          files: Object.fromEntries(
            files.map((name) => [name, digest(join(folder, name))]),
          ),
          config: {
            APP_ORIGIN: process.env.APP_ORIGIN || "http://localhost:3000",
            TRUST_PROXY: process.env.TRUST_PROXY || "0",
          },
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
  } finally {
    snapshot.close();
  }
  return folder;
}
export function restoreInstance(source: string, destination: string) {
  const folder = resolve(source);
  const target = resolve(destination);
  if (existsSync(join(target, "wishlist.sqlite")))
    throw new AppError(
      "La restauration exige une destination sans base existante. Arrêtez l’application et utilisez un nouveau DATA_DIR.",
    );
  const manifest = JSON.parse(
    readFileSync(join(folder, "manifest.json"), "utf8"),
  ) as {
    version: number;
    files: Record<string, string>;
    config: Record<string, string>;
  };
  if (manifest.version !== 1 || !manifest.files["wishlist.sqlite"])
    throw new AppError("Sauvegarde non reconnue.");
  for (const [name, hash] of Object.entries(manifest.files)) {
    if (
      !(
        name === "wishlist.sqlite" || /^images\/[a-f0-9]{64}\.webp$/.test(name)
      ) ||
      digest(join(folder, name)) !== hash
    )
      throw new AppError("Sauvegarde corrompue ou nom de fichier invalide.");
  }
  const check = new DatabaseSync(join(folder, "wishlist.sqlite"), {
    readOnly: true,
  });
  try {
    if (check.prepare("PRAGMA integrity_check").get()?.integrity_check !== "ok")
      throw new AppError("La base sauvegardée est corrompue.");
  } finally {
    check.close();
  }
  mkdirSync(join(target, "images"), { recursive: true, mode: 0o700 });
  for (const name of Object.keys(manifest.files))
    copyFileSync(join(folder, name), join(target, name));
  const restored = new DatabaseSync(join(target, "wishlist.sqlite"));
  if (
    restored
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='gift_exchanges'",
      )
      .get()
  ) {
    restored.exec(
      "UPDATE gift_exchanges SET state='cancelled'; DELETE FROM exchange_assignments; DELETE FROM exchange_questions; UPDATE exchange_participants SET reminders=0;",
    );
  }
  if (
    restored
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='price_watches'",
      )
      .get()
  )
    restored.exec(
      "UPDATE price_watches SET automatic=0,paused='restored'; DELETE FROM price_poll_usage;",
    );
  if (
    restored
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='calendar_feeds'",
      )
      .get()
  )
    restored.exec("DELETE FROM calendar_feeds");
  if (
    restored
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='secret_suggestions'",
      )
      .get()
  )
    restored.exec("UPDATE secret_suggestions SET token_hash=NULL");
  if (
    restored
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='account_email'",
      )
      .get()
  ) {
    restored.exec(
      "UPDATE account_email SET verified=0,challenge_hash=NULL,expires=0; UPDATE notification_preferences SET enabled=0; DELETE FROM notification_jobs; DELETE FROM notification_delivery; UPDATE settings SET value=json_set(value,'$.notifications',json('false')) WHERE key='operations';",
    );
  }
  restored.exec("DELETE FROM sessions; DELETE FROM rate_limits;");
  if (
    restored
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='member_invitations'",
      )
      .get()
  )
    restored.exec("DELETE FROM member_invitations");
  if (
    restored
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='suggestions'",
      )
      .get()
  )
    restored.exec("UPDATE suggestions SET token_hash=NULL");
  if (
    restored
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='lists'",
      )
      .get()
  )
    restored.exec("UPDATE lists SET share_hash=NULL");
  if (
    restored
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='backup_jobs'",
      )
      .get()
  )
    restored.exec(
      "UPDATE backup_jobs SET state='failed' WHERE state='running'",
    );
  restored.close();
  writeFileSync(
    join(target, "restored-config.json"),
    JSON.stringify(manifest.config, null, 2),
  );
  return target;
}
