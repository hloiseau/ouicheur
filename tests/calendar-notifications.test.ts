import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../lib/db";
import { initializeOwner } from "../lib/auth";
import { saveList, listLists, publicAccess } from "../lib/lists";
import {
  eventCalendar,
  exportCalendar,
  foldCalendarLine,
  rotateCalendarFeed,
  readCalendarFeed,
} from "../lib/calendar";
import { nextOccurrence, localDate } from "../lib/event-dates";
import {
  saveNotificationPreferences,
  requestAccountEmail,
  confirmAccountEmail,
  readNotificationPreferences,
  removeAccountEmail,
  quietNow,
} from "../lib/notification-preferences";
import {
  enqueueNotification,
  deliverNotifications,
  scheduleReminders,
} from "../lib/notifications";
import { inviteMember, acceptInvitation, memberAccess } from "../lib/family";
import { saveGift } from "../lib/gifts";
import { createReservation } from "../lib/reservations";
const owner = { owner: true, lists: [] },
  origin = "https://ouicheur.example.org";
async function fixture() {
  const db = openDatabase(":memory:");
  await initializeOwner(db, "Owner", "calendar-only-password");
  return db;
}
test("annual dates honor timezone boundaries and both February 29 policies", () => {
  const event = {
    event_date: "2000-02-29",
    event_annual: true,
    event_timezone: "Europe/Paris",
    leap_day: "feb28",
  };
  assert.equal(
    nextOccurrence(event, new Date("2027-02-27T23:30:00Z")),
    "2027-02-28",
  );
  assert.equal(
    nextOccurrence(event, new Date("2027-02-28T23:30:00Z")),
    "2028-02-29",
  );
  assert.equal(
    nextOccurrence({ ...event, leap_day: "skip" }, new Date("2027-01-01Z")),
    "2028-02-29",
  );
  assert.equal(
    localDate(new Date("2027-01-01T00:30:00Z"), "America/Los_Angeles"),
    "2026-12-31",
  );
  assert.equal(
    nextOccurrence(
      { event_date: "2026-12-31", event_annual: false },
      new Date("2027-01-01Z"),
    ),
    null,
  );
});
test("calendar exports are minimal, escape content, fold UTF-8 correctly and protect private feeds", async () => {
  const db = await fixture();
  try {
    const id = saveList(db, {
      name: "Secret\nBEGIN:VEVENT",
      description: "Gift, money; private",
      visibility: "private",
      event_date: "2000-02-29",
      event_annual: true,
      event_timezone: "Europe/Paris",
    });
    const list = listLists(db, owner).find((l) => l.id === id)!;
    const minimal = eventCalendar(
      list,
      { include_name: false, include_description: false, include_link: false },
      origin,
      new Date("2027-01-01Z"),
    );
    assert.match(minimal, /DTSTART;VALUE=DATE:20270228/);
    assert.match(minimal, /RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1/);
    assert.doesNotMatch(minimal, /Secret|Gift|2000|URL:/);
    assert.throws(
      () => exportCalendar(db, id, {}, publicAccess, origin),
      /introuvable/,
    );
    const feed = rotateCalendarFeed(
      db,
      {
        list_id: id,
        include_name: true,
        include_description: true,
        include_link: true,
        confirm: true,
      },
      owner,
    );
    const content = await readCalendarFeed(db, feed.token!, origin).text();
    assert.match(content, /SUMMARY:Secret\\nBEGIN:VEVENT/);
    assert.doesNotMatch(content, /URL:/);
    assert.equal(content.split("\r\nBEGIN:VEVENT").length, 2);
    assert.ok(
      foldCalendarLine("SUMMARY:" + "é😀".repeat(80))
        .split("\r\n")
        .every((l) => Buffer.byteLength(l) <= 75),
    );
    const newFeed = rotateCalendarFeed(
      db,
      { list_id: id, confirm: true },
      owner,
    );
    assert.throws(
      () => readCalendarFeed(db, feed.token!, origin),
      /introuvable/,
    );
    saveList(db, {
      id,
      name: "Public now",
      visibility: "public",
      event_date: "2027-02-28",
    });
    assert.throws(
      () => readCalendarFeed(db, newFeed.token!, origin),
      /introuvable/,
    );
    assert.throws(() =>
      saveList(db, {
        name: "bad",
        visibility: "public",
        event_timezone: "No/Such_Zone",
      }),
    );
  } finally {
    db.close();
  }
});
test("email verification is explicit, bounded, account-scoped and disabled independently", async () => {
  const db = await fixture();
  try {
    const delivered: string[] = [];
    await requestAccountEmail(
      db,
      { email: "owner@example.org", consent: true },
      owner,
      async (_to, _subject, body) => {
        delivered.push(body);
      },
    );
    assert.equal(readNotificationPreferences(db, owner).verified, false);
    assert.throws(() => confirmAccountEmail(db, { code: "abcdef" }, owner));
    const code = delivered[0].match(/code: (\d{6})/)![1];
    assert.doesNotMatch(
      String(
        db.prepare("SELECT challenge_hash FROM account_email").get()!
          .challenge_hash,
      ),
      new RegExp(code),
    );
    confirmAccountEmail(db, { code }, owner);
    assert.equal(readNotificationPreferences(db, owner).verified, true);
    assert.throws(
      () => confirmAccountEmail(db, { code }, owner),
      /Code invalide/,
    );
    assert.equal(
      readNotificationPreferences(db, owner).preferences.enabled,
      false,
    );
    removeAccountEmail(db, owner);
    assert.equal(readNotificationPreferences(db, owner).email, "");
    await requestAccountEmail(
      db,
      { email: "owner@example.org", consent: true },
      owner,
      async () => {},
    );
    db.exec("UPDATE account_email SET expires=0");
    assert.throws(
      () => confirmAccountEmail(db, { code }, owner),
      /Code invalide/,
    );
  } finally {
    db.close();
  }
});
test("reminders catch up once, survive quiet hours, deduplicate daily delivery and recheck revoked grants", async () => {
  const db = await fixture(),
    old = {
      NTFY_URL: process.env.NTFY_URL,
      SMTP_HOST: process.env.SMTP_HOST,
      SMTP_FROM: process.env.SMTP_FROM,
    };
  process.env.NTFY_URL = "https://ntfy.invalid/test";
  process.env.SMTP_HOST = "smtp.invalid";
  process.env.SMTP_FROM = "sender@example.org";
  const now = new Date("2027-12-20T21:30:00Z");
  try {
    const list = saveList(db, {
      name: "Christmas",
      visibility: "private",
      event_date: "2027-12-25",
      event_annual: true,
    });
    saveNotificationPreferences(
      db,
      {
        enabled: true,
        timezone: "Europe/Paris",
        quiet_start: "22:00",
        quiet_end: "08:00",
        rules: [
          {
            kind: "event_reminder",
            list_id: list,
            channel: "ntfy",
            frequency: "daily",
            days: 7,
          },
        ],
      },
      owner,
    );
    scheduleReminders(db, now);
    scheduleReminders(db, now);
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM notification_jobs").get()!.n,
      1,
    );
    const sent: string[] = [];
    const send = async (kind: string) => {
      sent.push(kind);
    };
    await deliverNotifications(db, send, now);
    assert.equal(sent.length, 0);
    const morning = new Date("2027-12-21T08:00:00Z");
    await deliverNotifications(db, send, morning);
    assert.deepEqual(sent, ["digest"]);
    scheduleReminders(db, morning);
    await deliverNotifications(db, send, morning);
    assert.equal(sent.length, 1);
    assert.equal(
      quietNow(
        { timezone: "Europe/Paris", quiet_start: "08:00", quiet_end: "08:00" },
        now,
      ),
      false,
    );
    const invitation = inviteMember(db, {
      name: "Robin",
      login: "robin",
      lists: [list],
      confirm: true,
    });
    const token = await acceptInvitation(db, {
      token: invitation.token,
      password: "member-only-password",
      confirmation: "member-only-password",
    });
    const member = memberAccess(db, token);
    let verification = "";
    await requestAccountEmail(
      db,
      { email: "robin@example.org", consent: true },
      member,
      async (_to, _s, body) => {
        verification = body.match(/code: (\d{6})/)![1];
      },
    );
    confirmAccountEmail(db, { code: verification }, member);
    saveNotificationPreferences(
      db,
      {
        enabled: true,
        quiet_start: "00:00",
        quiet_end: "00:00",
        rules: [
          {
            kind: "event_reminder",
            list_id: list,
            channel: "email",
            frequency: "instant",
            days: 7,
          },
        ],
      },
      member,
    );
    scheduleReminders(db, morning);
    db.prepare("DELETE FROM member_lists WHERE member_id=?").run(invitation.id);
    await deliverNotifications(db, send, morning);
    assert.equal(sent.length, 1);
    assert.equal(
      db
        .prepare("SELECT COUNT(*) n FROM notification_jobs WHERE account_id=?")
        .get(invitation.id)!.n,
      0,
    );
  } finally {
    db.close();
    for (const [k, v] of Object.entries(old)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
test("reservation expiry reminders never notify a protected recipient and discard cancelled events", async () => {
  const db = await fixture(),
    old = process.env.NTFY_URL;
  process.env.NTFY_URL = "https://ntfy.invalid/test";
  try {
    const now = new Date(),
      list = saveList(db, {
        name: "Surprise",
        visibility: "public",
        surprise_mode: true,
      });
    saveNotificationPreferences(
      db,
      {
        enabled: true,
        quiet_start: "00:00",
        quiet_end: "00:00",
        rules: [
          {
            kind: "reservation_expiring",
            list_id: list,
            channel: "ntfy",
            frequency: "instant",
          },
        ],
      },
      owner,
    );
    const id = saveGift(db, {
      list_id: list,
      title: "PRIVATE_CANARY",
      url: "https://example.org/a",
      target: "10",
    });
    createReservation(db, { gift_id: id, quantity: 1 });
    db.prepare("UPDATE reservations SET expires_at=?").run(
      new Date(now.getTime() + 3600000).toISOString(),
    );
    scheduleReminders(db, now);
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM notification_jobs").get()!.n,
      0,
    );
    saveList(db, {
      id: list,
      name: "Reveal",
      visibility: "public",
      surprise_mode: false,
      confirm_reveal: true,
    });
    scheduleReminders(db, now);
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM notification_jobs").get()!.n,
      1,
    );
    db.exec("UPDATE reservations SET state='cancelled'");
    let count = 0;
    await deliverNotifications(
      db,
      async () => {
        count++;
      },
      now,
    );
    assert.equal(count, 0);
    assert.throws(
      () =>
        saveNotificationPreferences(
          db,
          {
            enabled: true,
            rules: [
              { kind: "backup_failed", channel: "email", frequency: "instant" },
            ],
          },
          owner,
        ),
      /Configurez/,
    );
  } finally {
    db.close();
    if (old === undefined) delete process.env.NTFY_URL;
    else process.env.NTFY_URL = old;
  }
});
