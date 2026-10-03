import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { atomic } from "./db.ts";
import { getSettings } from "./settings.ts";
import { webUrl } from "./validation.ts";
import { reservationNotificationHidden } from "./surprise.ts";
import { preferenceSchema, quietNow } from "./notification-preferences.ts";
import { localDate, nextOccurrence, daysUntil } from "./event-dates.ts";
import { sendMail, smtpConfigured } from "./mail.ts";
import type { Wishlist } from "./lists.ts";

// Only event types leave the instance, never names, amounts or private links.
export const notificationMessages: Record<string, string> = {
  declaration: "Ouicheur: a contribution needs your review.",
  reservation: "Ouicheur: a gift has been reserved.",
  suggestion: "Ouicheur: a suggestion needs your review.",
  import_failed: "Ouicheur: an import needs your attention.",
  test: "Ouicheur: notifications are working.",
  event_reminder: "Ouicheur: an occasion is coming up.",
  reservation_expiring: "Ouicheur: a reservation will expire soon.",
  offer_changed: "Ouicheur: a watched offer has an update.",
  backup_failed: "Ouicheur: a backup needs your attention.",
  exchange_reminder: "Ouicheur: a gift exchange is coming up.",
  digest: "Ouicheur: new updates are waiting in your account.",
};
function listForEvent(db: DatabaseSync, kind: string, key: string) {
  const query =
    kind === "declaration"
      ? "SELECT g.list_id FROM contributions c JOIN gifts g ON g.id=c.gift_id WHERE c.id=?"
      : ["reservation", "reservation_expiring"].includes(kind)
        ? "SELECT g.list_id FROM reservations r JOIN gifts g ON g.id=r.gift_id WHERE r.id=?"
        : kind === "offer_changed"
          ? "SELECT list_id FROM gifts WHERE id=? AND visibility<>'archived'"
          : kind === "suggestion"
            ? "SELECT list_id FROM suggestions WHERE id=?"
            : null;
  return query ? String(db.prepare(query).get(key)?.list_id || "") : "";
}
export function notificationAccountAllowed(
  db: DatabaseSync,
  account: string,
  listId: string,
  kind: string,
) {
  if (kind === "exchange_reminder")
    return !!db
      .prepare(
        "SELECT 1 FROM exchange_participants p JOIN gift_exchanges e ON e.id=p.exchange_id WHERE p.exchange_id=? AND p.account_id=? AND p.accepted=1 AND p.reminders=1 AND e.state='drawn' AND (p.account_id='owner' OR EXISTS(SELECT 1 FROM members m WHERE m.id=p.account_id AND m.enabled=1))",
      )
      .get(listId, account);
  if (account !== "owner") {
    if (
      !db.prepare("SELECT 1 FROM members WHERE id=? AND enabled=1").get(account)
    )
      return false;
    if (
      !listId ||
      !db
        .prepare("SELECT 1 FROM member_lists WHERE member_id=? AND list_id=?")
        .get(account, listId)
    )
      return false;
    if (["declaration", "import_failed", "backup_failed"].includes(kind))
      return false;
  }
  if (["reservation", "reservation_expiring"].includes(kind) && listId) {
    const row = db
      .prepare(
        "SELECT l.surprise_mode,COALESCE(p.recipient,'owner') recipient FROM lists l LEFT JOIN family_profiles p ON p.id=l.profile_id WHERE l.id=?",
      )
      .get(listId);
    if (!row || (row.surprise_mode && row.recipient === account)) return false;
  }
  return true;
}
function emailTarget(db: DatabaseSync, account: string) {
  return String(
    db
      .prepare(
        "SELECT email FROM account_email WHERE account_id=? AND verified=1",
      )
      .get(account)?.email ||
      (account === "owner" ? process.env.SMTP_TO || "" : ""),
  );
}
export function enqueueNotification(
  db: DatabaseSync,
  kind: string,
  key: string,
  context: {
    listId?: string;
    sourceKey?: string;
    days?: number;
    now?: Date;
  } = {},
) {
  if (!notificationMessages[kind]) return;
  const now = context.now || new Date(),
    source = context.sourceKey || key,
    listId = context.listId ?? listForEvent(db, kind, source);
  if (
    Number(
      db
        .prepare(
          "SELECT COUNT(*) n FROM notification_jobs WHERE state='pending'",
        )
        .get()!.n,
    ) >= 1000
  )
    return;
  const rows = db
    .prepare("SELECT * FROM notification_preferences WHERE enabled=1")
    .all();
  for (const row of rows) {
    const account = String(row.account_id);
    if (!notificationAccountAllowed(db, account, listId, kind)) continue;
    const prefs = preferenceSchema.parse({
      enabled: true,
      timezone: row.timezone,
      quiet_start: row.quiet_start,
      quiet_end: row.quiet_end,
      rules: JSON.parse(String(row.rules)),
    });
    for (const channel of ["ntfy", "email"] as const) {
      const rules = prefs.rules.filter(
        (r) =>
          (kind === "test" || r.kind === kind) &&
          r.channel === channel &&
          (!r.list_id || r.list_id === listId),
      );
      const rule =
        rules.find((r) => r.list_id === listId && !!listId) ||
        rules.find((r) => !r.list_id);
      if (
        !rule ||
        (context.days !== undefined &&
          (context.days < 0 || context.days > rule.days))
      )
        continue;
      if (
        channel === "ntfy"
          ? account !== "owner" || !process.env.NTFY_URL
          : !smtpConfigured() || !emailTarget(db, account)
      )
        continue;
      db.prepare(
        "INSERT OR IGNORE INTO notification_jobs(id,event_key,kind,created_at,account_id,channel,list_id,source_key,frequency) VALUES (?,?,?,?,?,?,?,?,?)",
      ).run(
        randomUUID(),
        `${kind}:${key}:${account}:${channel}`,
        kind,
        now.toISOString(),
        account,
        channel,
        listId,
        source,
        rule.frequency,
      );
    }
  }
  // Preserve explicitly enabled legacy ntfy until its owner saves granular preferences.
  if (
    ![
      "event_reminder",
      "reservation_expiring",
      "offer_changed",
      "backup_failed",
      "exchange_reminder",
    ].includes(kind) &&
    !db
      .prepare(
        "SELECT 1 FROM notification_preferences WHERE account_id='owner'",
      )
      .get() &&
    getSettings(db).notifications &&
    !(kind === "reservation" && reservationNotificationHidden(db, source))
  ) {
    db.prepare(
      "INSERT OR IGNORE INTO notification_jobs(id,event_key,kind,created_at,list_id,source_key) VALUES (?,?,?,?,?,?)",
    ).run(
      randomUUID(),
      `${kind}:${key}`,
      kind,
      now.toISOString(),
      listId,
      source,
    );
  }
}
export async function sendNotification(
  kind: string,
  channel = "ntfy",
  target = "",
) {
  if (channel === "email")
    return sendMail(
      target,
      "Ouicheur",
      notificationMessages[kind] || notificationMessages.digest,
    );
  const url = webUrl(process.env.NTFY_URL || "");
  if (url.hash || url.search || !url.pathname.slice(1))
    throw new Error("Invalid ntfy endpoint");
  const response = await fetch(url, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(10000),
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      ...(process.env.NTFY_TOKEN
        ? { Authorization: `Bearer ${process.env.NTFY_TOKEN}` }
        : {}),
    },
    body: notificationMessages[kind] || notificationMessages.test,
  });
  await response.body?.cancel();
  if (!response.ok) throw new Error("Notification delivery failed");
}
export async function deliverNotifications(
  db: DatabaseSync,
  send: (
    kind: string,
    channel?: string,
    target?: string,
  ) => Promise<void> = sendNotification,
  now = new Date(),
) {
  for (let i = 0; i < 10; i++) {
    const job = atomic(db, () => {
      const row = db
        .prepare(
          "SELECT * FROM notification_jobs WHERE state='pending' AND next_attempt<=? ORDER BY created_at,id LIMIT 1",
        )
        .get(now.getTime());
      if (row)
        db.prepare(
          "UPDATE notification_jobs SET next_attempt=? WHERE id=?",
        ).run(now.getTime() + 60000, row.id);
      return row;
    });
    if (!job) break;
    const account = String(job.account_id),
      listId = String(job.list_id),
      kind = String(job.kind),
      source = String(job.source_key),
      channel = String(job.channel);
    const prefRow = db
      .prepare("SELECT * FROM notification_preferences WHERE account_id=?")
      .get(account);
    const pref = prefRow
      ? preferenceSchema.parse({
          enabled: !!prefRow.enabled,
          timezone: prefRow.timezone,
          quiet_start: prefRow.quiet_start,
          quiet_end: prefRow.quiet_end,
          rules: JSON.parse(String(prefRow.rules)),
        })
      : null;
    const rules = pref?.rules.filter(
      (r) =>
        (kind === "test" || r.kind === kind) &&
        r.channel === channel &&
        (!r.list_id || r.list_id === listId),
    );
    const currentList = [
      "reservation",
      "reservation_expiring",
      "declaration",
      "suggestion",
      "offer_changed",
    ].includes(kind)
      ? listForEvent(db, kind, source)
      : listId;
    const event =
      kind === "event_reminder"
        ? (db
            .prepare("SELECT * FROM lists WHERE id=? AND archived=0")
            .get(listId) as unknown as Wishlist | undefined)
        : undefined;
    const stale =
      (kind === "exchange_reminder" &&
        db
          .prepare("SELECT event_date FROM gift_exchanges WHERE id=?")
          .get(listId)?.event_date !== source) ||
      currentList !== listId ||
      (kind === "event_reminder" &&
        (!event || nextOccurrence(event, now) !== source)) ||
      !notificationAccountAllowed(db, account, listId, kind) ||
      (pref
        ? !pref.enabled || !rules?.length
        : !getSettings(db).notifications) ||
      (kind === "reservation" &&
        !pref &&
        reservationNotificationHidden(db, source)) ||
      (kind === "suggestion" &&
        !db
          .prepare("SELECT 1 FROM suggestions WHERE id=? AND state='pending'")
          .get(source)) ||
      (kind === "reservation_expiring" &&
        !db
          .prepare(
            "SELECT 1 FROM reservations WHERE id=? AND state='reserved' AND expires_at>?",
          )
          .get(source, now.toISOString())) ||
      Date.parse(String(job.created_at)) < now.getTime() - 7 * 86400000;
    if (stale) {
      db.prepare("DELETE FROM notification_jobs WHERE id=?").run(job.id);
      continue;
    }
    if (pref && quietNow(pref, now)) continue;
    const day = localDate(now, pref?.timezone || "Europe/Paris");
    if (
      job.frequency === "daily" &&
      db
        .prepare(
          "SELECT 1 FROM notification_delivery WHERE account_id=? AND channel=? AND day=?",
        )
        .get(account, channel, day)
    )
      continue;
    const target = channel === "email" ? emailTarget(db, account) : "";
    if (
      send === sendNotification &&
      (channel === "email"
        ? !smtpConfigured() || !target
        : !process.env.NTFY_URL)
    )
      continue;
    try {
      await send(job.frequency === "daily" ? "digest" : kind, channel, target);
      atomic(db, () => {
        db.prepare(
          "UPDATE notification_jobs SET state='sent',attempts=attempts+1 WHERE id=?",
        ).run(job.id);
        if (job.frequency === "daily") {
          db.prepare(
            "INSERT OR IGNORE INTO notification_delivery VALUES (?,?,?)",
          ).run(account, channel, day);
          db.prepare(
            "UPDATE notification_jobs SET state='sent',attempts=attempts+1 WHERE account_id=? AND channel=? AND frequency='daily' AND state='pending' AND created_at<=?",
          ).run(account, channel, now.toISOString());
        }
      });
    } catch {
      const attempts = Number(job.attempts) + 1;
      db.prepare(
        "UPDATE notification_jobs SET attempts=?,state=?,next_attempt=? WHERE id=?",
      ).run(
        attempts,
        attempts >= 5 ? "failed" : "pending",
        now.getTime() + Math.min(3600000, 60000 * 2 ** attempts),
        job.id,
      );
    }
  }
}
export function scheduleReminders(db: DatabaseSync, now = new Date()) {
  if (
    !db.prepare("SELECT 1 FROM notification_preferences WHERE enabled=1").get()
  )
    return;
  for (const e of db
    .prepare(
      "SELECT id,event_date,timezone FROM gift_exchanges WHERE state='drawn'",
    )
    .all()) {
    enqueueNotification(db, "exchange_reminder", `${e.id}:${e.event_date}`, {
      listId: String(e.id),
      sourceKey: String(e.event_date),
      days: daysUntil(String(e.event_date), now, String(e.timezone)),
      now,
    });
  }
  const lists = db
    .prepare("SELECT * FROM lists WHERE archived=0 AND event_date<>''")
    .all() as unknown as Wishlist[];
  for (const list of lists) {
    const day = nextOccurrence(list, now);
    if (!day) continue;
    enqueueNotification(db, "event_reminder", `${list.id}:${day}`, {
      listId: list.id,
      sourceKey: day,
      days: daysUntil(day, now, list.event_timezone || "Europe/Paris"),
      now,
    });
  }
  const end = new Date(now.getTime() + 86400000).toISOString();
  for (const row of db
    .prepare(
      "SELECT r.id,r.expires_at,g.list_id FROM reservations r JOIN gifts g ON g.id=r.gift_id JOIN lists l ON l.id=g.list_id WHERE r.state='reserved' AND r.expires_at>? AND r.expires_at<=? AND l.archived=0",
    )
    .all(now.toISOString(), end))
    enqueueNotification(
      db,
      "reservation_expiring",
      `${row.id}:${row.expires_at}`,
      { listId: String(row.list_id), sourceKey: String(row.id), now },
    );
  db.prepare(
    "DELETE FROM notification_jobs WHERE state<>'pending' AND created_at<?",
  ).run(new Date(now.getTime() - 180 * 86400000).toISOString());
  db.prepare("DELETE FROM notification_delivery WHERE day<?").run(
    localDate(new Date(now.getTime() - 30 * 86400000)),
  );
}
