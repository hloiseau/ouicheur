import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { atomic } from "./db.ts";
import { getSettings } from "./settings.ts";
import { dateNow, webUrl } from "./validation.ts";
import { reservationNotificationHidden } from "./surprise.ts";

// Only event types leave the instance: no gift names, amounts, people or private links.
const messages: Record<string, string> = {
  declaration: "Ouicheur: a contribution needs your review.",
  reservation: "Ouicheur: a gift has been reserved.",
  suggestion: "Ouicheur: a suggestion needs your review.",
  import_failed: "Ouicheur: an import needs your attention.",
  test: "Ouicheur: notifications are working.",
};
export function enqueueNotification(
  db: DatabaseSync,
  kind: string,
  key: string,
) {
  if (!messages[kind] || !getSettings(db).notifications) return;
  if (kind === "reservation" && reservationNotificationHidden(db, key)) return;
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
  db.prepare(
    "INSERT OR IGNORE INTO notification_jobs(id,event_key,kind,created_at) VALUES (?,?,?,?)",
  ).run(randomUUID(), `${kind}:${key}`, kind, dateNow());
}
export async function sendNotification(kind: string) {
  const url = webUrl(process.env.NTFY_URL || "");
  if (url.hash || url.search || !url.pathname.slice(1))
    throw new Error("Invalid ntfy endpoint");
  // NTFY_URL is operator-controlled, allowing a LAN server; redirects are never followed.
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
    body: messages[kind] || messages.test,
  });
  await response.body?.cancel();
  if (!response.ok) throw new Error("Notification delivery failed");
}
export async function deliverNotifications(
  db: DatabaseSync,
  send: (kind: string) => Promise<void> = sendNotification,
) {
  if (!getSettings(db).notifications) return;
  for (let i = 0; i < 10; i++) {
    const job = atomic(db, () => {
      const row = db
        .prepare(
          "SELECT id,event_key,kind,attempts FROM notification_jobs WHERE state='pending' AND next_attempt<=? ORDER BY created_at LIMIT 1",
        )
        .get(Date.now());
      if (row)
        db.prepare(
          "UPDATE notification_jobs SET next_attempt=? WHERE id=?",
        ).run(Date.now() + 60000, row.id);
      return row;
    });
    if (!job) break;
    if (
      (job.kind === "reservation" &&
        reservationNotificationHidden(
          db,
          String(job.event_key).slice("reservation:".length),
        )) ||
      (job.kind === "suggestion" &&
        !db
          .prepare("SELECT 1 FROM suggestions WHERE id=? AND state='pending'")
          .get(String(job.event_key).slice("suggestion:".length)))
    ) {
      db.prepare("DELETE FROM notification_jobs WHERE id=?").run(job.id);
      continue;
    }
    try {
      await send(String(job.kind));
      db.prepare(
        "UPDATE notification_jobs SET state='sent',attempts=attempts+1 WHERE id=?",
      ).run(job.id);
    } catch {
      const attempts = Number(job.attempts) + 1;
      db.prepare(
        "UPDATE notification_jobs SET attempts=?,state=?,next_attempt=? WHERE id=?",
      ).run(
        attempts,
        attempts >= 5 ? "failed" : "pending",
        Date.now() + Math.min(3600000, 60000 * 2 ** attempts),
        job.id,
      );
    }
  }
}
