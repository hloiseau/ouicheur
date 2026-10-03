import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { backupInstance, restoreInstance } from "../lib/backup";
import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../lib/db";
import { initializeOwner, createSession } from "../lib/auth";
import { inviteMember, acceptInvitation } from "../lib/family";
import {
  createExchange,
  manageExchange,
  exchangeAdmin,
  myExchanges,
  exchangePreferences,
  exchangeQuestion,
  exchangeCalendar,
  drawAssignments,
} from "../lib/exchanges";
import {
  scheduleReminders,
  deliverNotifications,
  notificationMessages,
} from "../lib/notifications";
import { saveNotificationPreferences } from "../lib/notification-preferences";
const password = "exchange-test-only-password";
async function fixture() {
  const db = openDatabase(":memory:");
  await initializeOwner(db, "Owner", password);
  const owner = createSession(db);
  const members = [];
  for (const login of ["alice", "bob", "charlie"]) {
    const invitation = inviteMember(db, {
      name: login,
      login,
      lists: [],
      confirm: true,
    });
    const token = await acceptInvitation(db, {
      token: invitation.token,
      password,
      confirmation: password,
    });
    members.push({ ...invitation, token });
  }
  return { db, owner, members };
}
const create = (
  f: Awaited<ReturnType<typeof fixture>>,
  participants = f.members.map((m) => m.id),
) =>
  createExchange(f.db, f.owner, {
    name: "Private family exchange",
    event_date: "2026-12-25",
    currency: "EUR",
    budget: 2000,
    participants,
    questions: true,
    confirm: true,
  }).id;
const accept = (
  f: Awaited<ReturnType<typeof fixture>>,
  id: string,
  token: string,
  options = {},
) =>
  exchangePreferences(f.db, token, {
    id,
    accepted: true,
    wishes: "A handmade card",
    questions_allowed: true,
    ...options,
  });
test("matching respects directed exclusions and detects impossible constraints without repeated draws", () => {
  const p = Array.from({ length: 50 }, (_, i) => String(i));
  const banned: [string, string][] = p.map((a, i) => [a, p[(i + 1) % 50]]);
  const result = drawAssignments(p, banned);
  assert.equal(result.length, 50);
  assert.equal(new Set(result.map((r) => r.recipient)).size, 50);
  assert.ok(
    result.every(
      (r) =>
        r.giver !== r.recipient &&
        !banned.some(([a, b]) => a === r.giver && b === r.recipient),
    ),
  );
  assert.throws(
    () => drawAssignments(["a", "b"], [["a", "b"]]),
    /Aucun tirage/,
  );
  // Every giver has an edge, but two are constrained to the same recipient.
  assert.throws(
    () =>
      drawAssignments(
        ["a", "b", "c"],
        [
          ["a", "b"],
          ["b", "a"],
        ],
      ),
    /Aucun tirage/,
  );
  assert.throws(() => drawAssignments(["a", "a"], []));
});
test("exchanges require acceptance, freeze one draw and disclose only the signed-in participant's recipient", async () => {
  const f = await fixture(),
    { db, owner, members } = f;
  try {
    const id = create(f);
    assert.equal(myExchanges(db, owner).length, 0);
    assert.throws(
      () => manageExchange(db, owner, { id, action: "draw", confirm: true }),
      /accepter/,
    );
    for (const m of members) accept(f, id, m.token);
    manageExchange(db, owner, { id, action: "draw", confirm: true });
    const before = db.prepare("SELECT * FROM exchange_assignments").all();
    assert.throws(
      () => manageExchange(db, owner, { id, action: "draw", confirm: true }),
      /figé/,
    );
    assert.deepEqual(
      db.prepare("SELECT * FROM exchange_assignments").all(),
      before,
    );
    const admin = exchangeAdmin(db, owner).events[0];
    assert.equal(Object.hasOwn(admin, "recipient"), false);
    assert.equal(Object.hasOwn(admin, "assignments"), false);
    assert.doesNotMatch(JSON.stringify(admin), /A handmade card/);
    for (const m of members) {
      const own = myExchanges(db, m.token)[0];
      assert.equal(
        own.recipient?.name,
        db
          .prepare("SELECT name FROM members WHERE id=?")
          .get(before.find((a) => a.giver === m.id)!.recipient)!.name,
      );
      assert.equal(Object.hasOwn(own, "giver"), false);
      assert.throws(() => exchangeAdmin(db, m.token), /administrateur/);
    }
    assert.throws(
      () => exchangePreferences(db, members[0].token, { id, accepted: false }),
      /déjà effectué/,
    );
    const ics = await exchangeCalendar(
      db,
      members[0].token,
      id,
      "https://example.org",
    ).text();
    assert.match(ics, /SUMMARY:Ouicheur/);
    assert.doesNotMatch(ics, /alice|bob|charlie|Private family|handmade|URL:/);
    manageExchange(db, owner, { id, action: "cancel", confirm: true });
    assert.equal(myExchanges(db, members[0].token)[0].recipient, null);
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM exchange_assignments").get()!.n,
      0,
    );
    assert.throws(
      () => manageExchange(db, owner, { id, action: "draw", confirm: true }),
      /figé/,
    );
  } finally {
    db.close();
  }
});
test("anonymous questions are pair-scoped, opt-in, reportable and blocked without leaking sender identities", async () => {
  const f = await fixture(),
    { db, owner, members } = f;
  try {
    const id = create(f);
    for (const m of members) accept(f, id, m.token);
    manageExchange(db, owner, { id, action: "draw", confirm: true });
    const giver = members[0],
      targetId = db
        .prepare(
          "SELECT recipient FROM exchange_assignments WHERE exchange_id=? AND giver=?",
        )
        .get(id, giver.id)!.recipient,
      target = members.find((m) => m.id === targetId)!,
      third = members.find((m) => m.id !== giver.id && m.id !== targetId)!;
    exchangeQuestion(db, giver.token, {
      exchange_id: id,
      action: "ask",
      message: "Which colour would you like?",
    });
    const inbox = myExchanges(db, target.token)[0].inbox;
    assert.equal(inbox.length, 1);
    assert.equal(Object.hasOwn(inbox[0], "giver"), false);
    assert.equal(myExchanges(db, third.token)[0].inbox.length, 0);
    assert.equal(exchangeAdmin(db, owner).events[0].reports.length, 0);
    assert.throws(
      () =>
        exchangeQuestion(db, third.token, {
          exchange_id: id,
          action: "answer",
          id: inbox[0].id,
          message: "Guess",
        }),
      /introuvable/,
    );
    exchangeQuestion(db, target.token, {
      exchange_id: id,
      action: "answer",
      id: inbox[0].id,
      message: "Blue, thanks",
    });
    assert.equal(
      myExchanges(db, giver.token)[0].sent[0].answer,
      "Blue, thanks",
    );
    exchangeQuestion(db, target.token, {
      exchange_id: id,
      action: "report",
      id: inbox[0].id,
    });
    assert.throws(
      () =>
        exchangeQuestion(db, giver.token, {
          exchange_id: id,
          action: "ask",
          message: "Again",
        }),
      /pas de questions/,
    );
    assert.equal(exchangeAdmin(db, owner).events[0].reports.length, 1);
    assert.doesNotMatch(
      JSON.stringify(db.prepare("SELECT * FROM audit").all()),
      /Which colour|Blue, thanks/,
    );
  } finally {
    db.close();
  }
});
test("exchange reminders require per-exchange consent and an enabled channel, stay neutral and stop on cancellation", async () => {
  const f = await fixture(),
    { db, owner, members } = f,
    previous = process.env.NTFY_URL;
  process.env.NTFY_URL = "https://ntfy.invalid/test";
  try {
    const id = create(f, ["owner", members[0].id]);
    accept(f, id, owner, { reminders: true });
    accept(f, id, members[0].token);
    manageExchange(db, owner, { id, action: "draw", confirm: true });
    const now = new Date("2026-12-23T12:00:00Z");
    scheduleReminders(db, now);
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM notification_jobs").get()!.n,
      0,
    );
    saveNotificationPreferences(
      db,
      {
        enabled: true,
        quiet_start: "00:00",
        quiet_end: "00:00",
        rules: [
          { kind: "exchange_reminder", channel: "ntfy", frequency: "instant" },
        ],
      },
      { owner: true, lists: [] },
    );
    scheduleReminders(db, now);
    scheduleReminders(db, now);
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) n FROM notification_jobs WHERE kind='exchange_reminder'",
        )
        .get()!.n,
      1,
    );
    assert.doesNotMatch(
      notificationMessages.exchange_reminder,
      /alice|owner|recipient/i,
    );
    manageExchange(db, owner, { id, action: "cancel", confirm: true });
    let sent = 0;
    await deliverNotifications(
      db,
      async () => {
        sent++;
      },
      now,
    );
    assert.equal(sent, 0);
  } finally {
    db.close();
    if (previous === undefined) delete process.env.NTFY_URL;
    else process.env.NTFY_URL = previous;
  }
});

test("restoring a snapshot cancels old exchanges instead of silently replaying a draw", async () => {
  const f = await fixture();
  mkdirSync(resolve(".local"), { recursive: true });
  const folder = mkdtempSync(resolve(".local/exchange-restore-"));
  try {
    const id = create(f);
    for (const m of f.members) accept(f, id, m.token, { reminders: true });
    manageExchange(f.db, f.owner, { id, action: "draw", confirm: true });
    backupInstance(f.db, folder, join(folder, "backup"));
    restoreInstance(join(folder, "backup"), join(folder, "restored"));
    const restored = openDatabase(join(folder, "restored", "wishlist.sqlite"));
    try {
      assert.equal(
        restored.prepare("SELECT state FROM gift_exchanges WHERE id=?").get(id)!
          .state,
        "cancelled",
      );
      assert.equal(
        restored.prepare("SELECT COUNT(*) n FROM exchange_assignments").get()!
          .n,
        0,
      );
      assert.equal(
        restored
          .prepare("SELECT SUM(reminders) n FROM exchange_participants")
          .get()!.n,
        0,
      );
    } finally {
      restored.close();
    }
  } finally {
    f.db.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
