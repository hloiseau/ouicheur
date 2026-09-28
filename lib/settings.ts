import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { atomic, audit } from "./db.ts";

export const settingsSchema = z.object({
  notifications: z.boolean().default(false),
  backup_hours: z
    .union([z.literal(0), z.literal(24), z.literal(168)])
    .default(0),
  backup_keep: z.number().int().min(1).max(30).default(7),
  image_limit_mb: z.number().int().min(100).max(100000).default(2048),
});
export function getSettings(db: DatabaseSync) {
  const row = db
    .prepare("SELECT value FROM settings WHERE key='operations'")
    .get();
  return settingsSchema.parse(row ? JSON.parse(String(row.value)) : {});
}
export function saveSettings(db: DatabaseSync, input: unknown) {
  const value = settingsSchema.parse(input);
  atomic(db, () => {
    db.prepare(
      "INSERT INTO settings VALUES ('operations',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    ).run(JSON.stringify(value));
    audit(db, "settings.update", "operations", value);
  });
  return value;
}
