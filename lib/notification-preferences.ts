import { randomInt, randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { hashToken, rateLimit } from "./auth.ts";
import { atomic } from "./db.ts";
import { getSettings } from "./settings.ts";
import { listLists, type Access } from "./lists.ts";
import { validTimezone } from "./event-dates.ts";
import { AppError, text } from "./validation.ts";
import {
  notificationKinds,
  type NotificationPreferences,
} from "./notification-labels.ts";
import { emailAddress, sendMail, smtpConfigured } from "./mail.ts";
export const accountId = (access: Access) =>
  access.owner ? "owner" : access.memberId || "";
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const preferenceSchema = z
  .object({
    enabled: z.boolean().default(false),
    timezone: text(80).refine(validTimezone).default("Europe/Paris"),
    quiet_start: time.default("22:00"),
    quiet_end: time.default("08:00"),
    rules: z
      .array(
        z
          .object({
            kind: z.enum(
              Object.keys(notificationKinds) as [
                keyof typeof notificationKinds,
                ...(keyof typeof notificationKinds)[],
              ],
            ),
            list_id: text(64).default(""),
            channel: z.enum(["ntfy", "email"]),
            frequency: z.enum(["instant", "daily"]),
            days: z.number().int().min(0).max(60).default(7),
          })
          .strict(),
      )
      .max(64)
      .default([]),
  })
  .strict();
export function readNotificationPreferences(db: DatabaseSync, access: Access) {
  const id = accountId(access);
  if (!id) throw new AppError("Connexion requise.", 401);
  const row = db
    .prepare("SELECT * FROM notification_preferences WHERE account_id=?")
    .get(id);
  const preferences = preferenceSchema.parse(
    row
      ? {
          enabled: !!row.enabled,
          timezone: row.timezone,
          quiet_start: row.quiet_start,
          quiet_end: row.quiet_end,
          rules: JSON.parse(String(row.rules)),
        }
      : {
          enabled: access.owner && getSettings(db).notifications,
          rules:
            access.owner && getSettings(db).notifications
              ? [
                  "declaration",
                  "reservation",
                  "suggestion",
                  "import_failed",
                ].map((kind) => ({
                  kind,
                  list_id: "",
                  channel: "ntfy",
                  frequency: "instant",
                  days: 7,
                }))
              : [],
        },
  );
  const contact = db
    .prepare("SELECT email,verified FROM account_email WHERE account_id=?")
    .get(id);
  return {
    owner: access.owner,
    preferences,
    email: contact?.email || "",
    verified: !!contact?.verified,
    ntfy_available: access.owner && !!process.env.NTFY_URL,
    smtp_available: smtpConfigured(),
    owner_email_configured:
      access.owner && !!process.env.SMTP_TO && smtpConfigured(),
    lists: listLists(db, access)
      .filter((l) => access.owner || access.managedLists?.includes(l.id))
      .map((l) => ({ id: l.id, name: l.name })),
  };
}
export function saveNotificationPreferences(
  db: DatabaseSync,
  input: unknown,
  access: Access,
) {
  const id = accountId(access);
  if (!id) throw new AppError("Connexion requise.", 401);
  const v = preferenceSchema.parse(input),
    data = readNotificationPreferences(db, access);
  const unique = new Set<string>();
  for (const r of v.rules) {
    if (r.kind === "exchange_reminder" && r.list_id)
      throw new AppError(
        "Les rappels d’échange utilisent le réglage Toutes les listes.",
      );
    if (r.list_id && !data.lists.some((l) => l.id === r.list_id))
      throw new AppError("Liste introuvable.", 404);
    if (r.channel === "ntfy" && !access.owner)
      throw new AppError("Ce canal est réservé au propriétaire.", 403);
    if (
      !access.owner &&
      ["import_failed", "backup_failed", "declaration"].includes(r.kind)
    )
      throw new AppError("Ce type de rappel est réservé au propriétaire.", 403);
    const key = `${r.kind}:${r.list_id}:${r.channel}`;
    if (unique.has(key)) throw new AppError("Un rappel identique existe déjà.");
    unique.add(key);
    if (
      v.enabled &&
      ((r.channel === "ntfy" && !data.ntfy_available) ||
        (r.channel === "email" &&
          (!data.smtp_available ||
            (!data.verified && !data.owner_email_configured))))
    )
      throw new AppError(
        "Configurez le canal et vérifiez votre adresse avant d’activer les rappels.",
      );
  }
  atomic(db, () => {
    db.prepare(
      "INSERT INTO notification_preferences VALUES (?,?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET enabled=excluded.enabled,timezone=excluded.timezone,quiet_start=excluded.quiet_start,quiet_end=excluded.quiet_end,rules=excluded.rules",
    ).run(
      id,
      Number(v.enabled),
      v.timezone,
      v.quiet_start,
      v.quiet_end,
      JSON.stringify(v.rules),
    );
    // A new consent configuration never inherits previously queued deliveries.
    db.prepare(
      "DELETE FROM notification_jobs WHERE account_id=? AND state='pending'",
    ).run(id);
  });
  return v;
}
export async function requestAccountEmail(
  db: DatabaseSync,
  input: unknown,
  access: Access,
  send = sendMail,
) {
  const id = accountId(access);
  if (!id) throw new AppError("Connexion requise.", 401);
  const v = z
    .object({ email: emailAddress, consent: z.literal(true) })
    .strict()
    .parse(input);
  if (send === sendMail && !smtpConfigured())
    throw new AppError(
      "Le courriel n’est pas configuré sur cette instance.",
      409,
    );
  rateLimit(db, `email:${id}`, 3, 3600000);
  const code = String(randomInt(0, 1000000)).padStart(6, "0"),
    salt = randomBytes(16).toString("hex");
  db.prepare(
    "INSERT INTO account_email VALUES (?,?,0,?,?,0) ON CONFLICT(account_id) DO UPDATE SET email=excluded.email,verified=0,challenge_hash=excluded.challenge_hash,expires=excluded.expires,attempts=0",
  ).run(
    id,
    v.email,
    `${salt}:${hashToken(`${salt}:${code}`)}`,
    Date.now() + 15 * 60000,
  );
  try {
    await send(
      v.email,
      "Ouicheur — verification",
      `Ouicheur verification code: ${code}\nExpires in 15 minutes. If you did not request this code, ignore this message.`,
    );
  } catch {
    db.prepare(
      "UPDATE account_email SET challenge_hash=NULL WHERE account_id=?",
    ).run(id);
    throw new AppError(
      "Le courriel n’a pas pu être envoyé. Vérifiez la configuration SMTP.",
      503,
    );
  }
}
export function confirmAccountEmail(
  db: DatabaseSync,
  input: unknown,
  access: Access,
) {
  const id = accountId(access);
  if (!id) throw new AppError("Connexion requise.", 401);
  const v = z
    .object({ code: z.string().regex(/^\d{6}$/) })
    .strict()
    .parse(input);
  const row = db
    .prepare("SELECT * FROM account_email WHERE account_id=?")
    .get(id);
  const [salt, hash] = String(row?.challenge_hash || "").split(":");
  if (
    !row ||
    Number(row.attempts) >= 5 ||
    Number(row.expires) <= Date.now() ||
    !salt ||
    hashToken(`${salt}:${v.code}`) !== hash
  ) {
    if (row)
      db.prepare(
        "UPDATE account_email SET attempts=attempts+1 WHERE account_id=?",
      ).run(id);
    throw new AppError("Code invalide ou expiré.", 400);
  }
  db.prepare(
    "UPDATE account_email SET verified=1,challenge_hash=NULL,expires=0 WHERE account_id=?",
  ).run(id);
}
export function removeAccountEmail(db: DatabaseSync, access: Access) {
  const id = accountId(access);
  if (!id) throw new AppError("Connexion requise.", 401);
  atomic(db, () => {
    db.prepare("DELETE FROM account_email WHERE account_id=?").run(id);
    db.prepare(
      "DELETE FROM notification_jobs WHERE account_id=? AND channel='email' AND state='pending'",
    ).run(id);
  });
}
export function quietNow(
  preferences: Pick<
    NotificationPreferences,
    "timezone" | "quiet_start" | "quiet_end"
  >,
  now: Date,
) {
  if (preferences.quiet_start === preferences.quiet_end) return false;
  const current = new Intl.DateTimeFormat("en-GB", {
    timeZone: preferences.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return preferences.quiet_start < preferences.quiet_end
    ? current >= preferences.quiet_start && current < preferences.quiet_end
    : current >= preferences.quiet_start || current < preferences.quiet_end;
}
