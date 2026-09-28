import {
  existsSync,
  readdirSync,
  statSync,
  statfsSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { atomic, audit, dataDir } from "./db.ts";
import { getSettings } from "./settings.ts";
import { AppError } from "./validation.ts";

export function imageFiles(folder = dataDir()) {
  const root = join(folder, "images");
  return !existsSync(root)
    ? []
    : readdirSync(root)
        .filter((n) => /^[a-f0-9]{64}\.webp$/.test(n))
        .map((name) => ({ name, ...statSync(join(root, name)) }));
}
export function storageStats(folder = dataDir()) {
  const images = imageFiles(folder);
  let free: number | null = null;
  try {
    const s = statfsSync(folder);
    free = Number(s.bavail) * Number(s.bsize);
  } catch {
    /* Some filesystems do not expose free space. */
  }
  return {
    image_count: images.length,
    image_bytes: images.reduce((n, f) => n + f.size, 0),
    free_bytes: free,
  };
}
export function assertImageSpace(
  db: DatabaseSync,
  bytes: number,
  folder = dataDir(),
) {
  const stats = storageStats(folder);
  if (
    stats.image_bytes + bytes > getSettings(db).image_limit_mb * 1024 * 1024 ||
    (stats.free_bytes !== null && stats.free_bytes < bytes + 32 * 1024 * 1024)
  )
    throw new AppError(
      "Stockage d’images insuffisant. Libérez de l’espace ou augmentez la limite.",
      409,
    );
}
export function cleanupPreview(db: DatabaseSync, folder = dataDir()) {
  const referenced = new Set(
    db
      .prepare(
        "SELECT image path FROM gifts UNION SELECT image FROM categories UNION SELECT avatar FROM owner UNION SELECT banner FROM owner UNION SELECT background FROM owner UNION SELECT json_extract(item.value,'$.image') FROM imports,json_each(imports.items) item",
      )
      .all()
      .map((r) => String(r.path).slice(7)),
  );
  // A one-day grace period protects unsaved forms and uploads. Running imports block image removal.
  const importing =
    !!db.prepare("SELECT 1 FROM imports WHERE state='running'").get() ||
    !!db.prepare("SELECT 1 FROM backup_jobs WHERE state='running'").get();
  const images = importing
    ? []
    : imageFiles(folder).filter(
        (f) => !referenced.has(f.name) && f.mtimeMs < Date.now() - 86400000,
      );
  const before = new Date(Date.now() - 90 * 86400000).toISOString();
  const imports = Number(
    db
      .prepare(
        "SELECT COUNT(*) n FROM imports WHERE state IN ('done','failed') AND created_at<?",
      )
      .get(before)!.n,
  );
  const intents = Number(
    db
      .prepare(
        "SELECT COUNT(*) n FROM contributions c WHERE state IN ('intent','expired') AND expires_at<? AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.contribution_id=c.id)",
      )
      .get(before)!.n,
  );
  return {
    images: images.length,
    image_bytes: images.reduce((n, f) => n + f.size, 0),
    imports,
    intents,
    importing,
    files: images.map((f) => f.name),
    before,
  };
}
export function cleanup(db: DatabaseSync, folder = dataDir()) {
  return atomic(db, () => {
    const plan = cleanupPreview(db, folder);
    for (const name of plan.files) unlinkSync(join(folder, "images", name));
    db.prepare(
      "DELETE FROM imports WHERE state IN ('done','failed') AND created_at<?",
    ).run(plan.before);
    db.prepare(
      "DELETE FROM contributions WHERE state IN ('intent','expired') AND expires_at<? AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.contribution_id=contributions.id)",
    ).run(plan.before);
    db.prepare("DELETE FROM rate_limits WHERE until<?").run(Date.now());
    db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
    db.prepare(
      "DELETE FROM notification_jobs WHERE state<>'pending' AND created_at<?",
    ).run(plan.before);
    const { files, before, ...summary } = plan;
    audit(db, "storage.cleanup", "instance", summary);
    return summary;
  });
}
