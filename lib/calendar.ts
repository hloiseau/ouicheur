import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { hashToken } from "./auth.ts";
import { atomic, audit } from "./db.ts";
import { listLists, type Access, type Wishlist } from "./lists.ts";
import { AppError, dateNow, text, webUrl } from "./validation.ts";
import { nextOccurrence } from "./event-dates.ts";
const optionsSchema = z.object({
  include_name: z.boolean().default(false),
  include_description: z.boolean().default(false),
  include_link: z.boolean().default(false),
});
export type CalendarOptions = z.infer<typeof optionsSchema>;
function escapeIcs(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replace(/\r?\n|\r/g, "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}
// RFC 5545 folds at 75 octets without splitting UTF-8 code points.
export function foldCalendarLine(line: string) {
  const lines: string[] = [];
  let part = "",
    bytes = 0;
  for (const char of line) {
    const n = Buffer.byteLength(char);
    if (bytes + n > 75) {
      lines.push(part);
      part = " ";
      bytes = 1;
    }
    part += char;
    bytes += n;
  }
  lines.push(part);
  return lines.join("\r\n");
}
export function eventCalendar(
  list: Wishlist,
  options: CalendarOptions,
  origin: string,
  now = new Date(),
) {
  const day =
    nextOccurrence(list, now) || (!list.event_annual ? list.event_date : null);
  if (!day || list.archived)
    throw new AppError("Cette liste n’a pas d’événement actif.", 404);
  const base = webUrl(origin).origin;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ouicheur//Occasions//FR",
    "CALSCALE:GREGORIAN",
    `X-WR-TIMEZONE:${escapeIcs(list.event_timezone || "Europe/Paris")}`,
    "BEGIN:VEVENT",
    `UID:${list.id}-${hashToken(base).slice(0, 16)}@ouicheur`,
    `DTSTAMP:${now.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${day.replaceAll("-", "")}`,
    `SUMMARY:${escapeIcs(options.include_name ? list.name : "Ouicheur")}`,
    "TRANSP:TRANSPARENT",
    "CLASS:PRIVATE",
  ];
  if (list.event_annual) {
    const md = list.event_date.slice(5);
    lines.push(
      md === "02-29" && list.leap_day !== "skip"
        ? "RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1"
        : `RRULE:FREQ=YEARLY;BYMONTH=${Number(md.slice(0, 2))};BYMONTHDAY=${Number(md.slice(3))}`,
    );
  }
  if (options.include_description)
    lines.push(`DESCRIPTION:${escapeIcs(list.description)}`);
  if (options.include_link && list.visibility === "public")
    lines.push(`URL:${base}/lists/${encodeURIComponent(list.id)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(foldCalendarLine).join("\r\n") + "\r\n";
}
function calendarResponse(value: string) {
  return new Response(value, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="ouicheur.ics"',
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
export function exportCalendar(
  db: DatabaseSync,
  id: string,
  input: unknown,
  access: Access,
  origin: string,
  now = new Date(),
) {
  const list = listLists(db, access).find((l) => l.id === id);
  if (!list) throw new AppError("Liste introuvable.", 404);
  return calendarResponse(
    eventCalendar(list, optionsSchema.parse(input), origin, now),
  );
}
export function calendarFeedStatus(db: DatabaseSync, id: string) {
  return {
    active: !!db
      .prepare("SELECT 1 FROM calendar_feeds WHERE list_id=?")
      .get(id),
  };
}
export function rotateCalendarFeed(
  db: DatabaseSync,
  input: unknown,
  access: Access,
) {
  if (!access.owner)
    throw new AppError("Connexion administrateur requise.", 401);
  const v = optionsSchema
    .extend({
      list_id: text(64).min(1),
      revoke: z.boolean().default(false),
      confirm: z.literal(true),
    })
    .strict()
    .parse(input);
  return atomic(db, () => {
    const list = listLists(db, access).find((l) => l.id === v.list_id);
    if (!list) throw new AppError("Liste introuvable.", 404);
    db.prepare("DELETE FROM calendar_feeds WHERE list_id=?").run(v.list_id);
    if (v.revoke) {
      audit(db, "calendar.revoke", v.list_id);
      return { token: null };
    }
    if (!list.event_date || list.archived)
      throw new AppError("Cette liste n’a pas d’événement actif.", 409);
    const token = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO calendar_feeds VALUES (?,?,?,?,?,?)").run(
      v.list_id,
      hashToken(token),
      Number(v.include_name),
      Number(v.include_description),
      Number(v.include_link),
      dateNow(),
    );
    audit(db, "calendar.rotate", v.list_id);
    return { token };
  });
}
export function readCalendarFeed(
  db: DatabaseSync,
  token: string,
  origin: string,
  now = new Date(),
) {
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new AppError("Calendrier introuvable.", 404);
  const feed = db
    .prepare("SELECT * FROM calendar_feeds WHERE token_hash=?")
    .get(hashToken(token));
  if (!feed) throw new AppError("Calendrier introuvable.", 404);
  const list = listLists(db, { owner: true, lists: [] }).find(
    (l) => l.id === feed.list_id,
  );
  if (!list || list.archived || !list.event_date)
    throw new AppError("Calendrier introuvable.", 404);
  return calendarResponse(
    eventCalendar(
      list,
      {
        include_name: !!feed.include_name,
        include_description: !!feed.include_description,
        include_link: !!feed.include_link,
      },
      origin,
      now,
    ),
  );
}
