import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openDatabase } from "../lib/db";
import {
  authorized,
  createSession,
  hashToken,
  initializeOwner,
  sessionAccount,
  setPassword,
} from "../lib/auth";
import {
  acceptInvitation,
  assignFamilyProfile,
  familyAdmin,
  familyExport,
  inspectInvitation,
  inviteMember,
  loginMember,
  memberAccess,
  memberSummary,
  saveFamilyProfile,
  saveMemberGift,
  setMemberGiftPurchased,
  updateMemberAccess,
} from "../lib/family";
import {
  accessFromCookies,
  canReadImage,
  listLists,
  saveList,
} from "../lib/lists";
import { listGifts, saveGift } from "../lib/gifts";
import {
  changeSessionPassword,
  listSessions,
  revokeSessions,
} from "../lib/sessions";
import { setSurpriseReveal } from "../lib/surprise";
import { backupInstance, restoreInstance } from "../lib/backup";

const ownerPassword = "owner-test-only-password";
const memberPassword = "member-test-only-password";
async function fixture() {
  const db = openDatabase(":memory:");
  await initializeOwner(db, "Owner", ownerPassword);
  return db;
}
async function member(db: DatabaseSync, login: string, lists: string[]) {
  const invitation = inviteMember(db, {
    login,
    name: login,
    lists,
    confirm: true,
  });
  const token = await acceptInvitation(db, {
    token: invitation.token,
    password: memberPassword,
    confirmation: memberPassword,
  });
  return { ...invitation, token };
}
const gift = {
  url: "https://example.com/family",
  title: "A wish",
  target: "25",
  visibility: "visible",
};
const cookies = (token: string) => ({
  get: (name: string) =>
    name === "wishlister_session" ? { value: token } : undefined,
});

test("family migration preserves owner, sessions, gift assignments and original single-owner behavior", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys=ON");
    for (const file of readdirSync("migrations")
      .filter((f) => f.endsWith(".sql") && f < "015")
      .sort())
      db.exec(readFileSync(`migrations/${file}`, "utf8"));
    await initializeOwner(db, "Owner", ownerPassword);
    const id = randomUUID();
    db.prepare(
      "INSERT INTO gifts(id,url,title,target,currency,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
    ).run(
      id,
      gift.url,
      gift.title,
      2500,
      "EUR",
      new Date().toISOString(),
      new Date().toISOString(),
    );
    const token = "c".repeat(64);
    db.prepare("INSERT INTO sessions(hash,expires,id) VALUES (?,?,?)").run(
      hashToken(token),
      Date.now() + 60000,
      "d".repeat(32),
    );
    const before = db.prepare("SELECT * FROM owner").get();
    for (const file of readdirSync("migrations")
      .filter((f) => f.endsWith(".sql") && f >= "015")
      .sort())
      db.exec(readFileSync(`migrations/${file}`, "utf8"));
    assert.deepEqual(db.prepare("SELECT * FROM owner").get(), before);
    assert.ok(authorized(db, token));
    assert.equal(listGifts(db, true)[0].id, id);
    assert.equal(familyAdmin(db).members.length, 0);
    assert.equal(familyAdmin(db).profiles.length, 0);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});

test("named invitations are hashed, single-use and cannot grant administrator status", async () => {
  const db = await fixture();
  try {
    const i = inviteMember(db, {
      login: "alex",
      name: "Alex",
      lists: ["default"],
      confirm: true,
    });
    assert.equal(inspectInvitation(db, i.token).login, "alex");
    assert.ok(!JSON.stringify(familyAdmin(db)).includes(i.token));
    assert.ok(
      !JSON.stringify(db.prepare("SELECT * FROM audit").all()).includes(
        i.token,
      ),
    );
    const row = db.prepare("SELECT token_hash FROM member_invitations").get()!;
    assert.notEqual(row.token_hash, i.token);
    const results = await Promise.allSettled([
      acceptInvitation(db, {
        token: i.token,
        password: memberPassword,
        confirmation: memberPassword,
      }),
      acceptInvitation(db, {
        token: i.token,
        password: memberPassword,
        confirmation: memberPassword,
      }),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const token = results.find((r) => r.status === "fulfilled")!.value;
    const exported = familyExport(db);
    assert.equal(exported.members[0].id, i.id);
    assert.deepEqual(exported.members[0].lists, ["default"]);
    const serialized = JSON.stringify(exported);
    for (const secret of [
      i.token,
      token,
      hashToken(token),
      "password_hash",
      "scrypt:",
      "invitation_expires",
      "token_hash",
    ])
      assert.ok(!serialized.includes(secret));
    assert.equal(sessionAccount(db, token)?.role, "member");
    assert.ok(!authorized(db, token));
    assert.throws(() => inspectInvitation(db, i.token), { status: 404 });
    assert.throws(
      () =>
        inviteMember(db, {
          login: "alex",
          name: "Alex",
          lists: ["default"],
          confirm: true,
        }),
      { status: 409 },
    );
    assert.throws(() =>
      inviteMember(db, {
        login: "owner",
        name: "Owner",
        lists: ["default"],
        confirm: true,
      }),
    );
  } finally {
    db.close();
  }
});

test("expired, revoked, superseded or concurrently revoked invitations cannot create sessions", async () => {
  const db = await fixture();
  try {
    const first = inviteMember(db, {
      login: "alex",
      name: "Alex",
      lists: ["default"],
      confirm: true,
    });
    const second = inviteMember(db, {
      id: first.id,
      login: "alex",
      name: "Alex",
      lists: ["default"],
      confirm: true,
    });
    assert.throws(() => inspectInvitation(db, first.token), { status: 404 });
    db.prepare("UPDATE member_invitations SET expires=?").run(Date.now() - 1);
    await assert.rejects(
      acceptInvitation(db, {
        token: second.token,
        password: memberPassword,
        confirmation: memberPassword,
      }),
      { status: 404 },
    );
    const third = inviteMember(db, {
      id: first.id,
      login: "alex",
      name: "Alex",
      lists: ["default"],
      confirm: true,
    });
    const pending = acceptInvitation(db, {
      token: third.token,
      password: memberPassword,
      confirmation: memberPassword,
    });
    updateMemberAccess(db, { id: first.id, action: "disable", confirm: true });
    await assert.rejects(pending, { status: 404 });
    assert.equal(db.prepare("SELECT COUNT(*) n FROM sessions").get()!.n, 0);
  } finally {
    db.close();
  }
});

test("coorganizers can read and edit only assigned lists, including their drafts; foreign duplicate URLs do not disclose private wishes", async () => {
  const db = await fixture();
  try {
    const shared = saveList(db, { name: "Assigned", visibility: "private" });
    const hidden = saveList(db, {
      name: "Secret other family",
      visibility: "private",
    });
    const hiddenId = saveGift(db, {
      ...gift,
      list_id: hidden,
      title: "Secret other gift",
    });
    const allowedId = saveGift(db, {
      ...gift,
      url: "https://example.com/draft",
      list_id: shared,
      visibility: "draft",
    });
    const actor = await member(db, "alex", [shared]);
    const summary = memberSummary(db, actor.token);
    assert.deepEqual(
      summary.lists.map((l) => l.id),
      [shared],
    );
    assert.deepEqual(
      summary.gifts.map((g) => g.id),
      [allowedId],
    );
    assert.ok(!JSON.stringify(summary).includes("Secret other"));
    assert.ok(
      !listLists(db, memberAccess(db, actor.token)).some(
        (l) => l.id === hidden,
      ),
    );
    assert.throws(
      () =>
        saveMemberGift(db, actor.token, { ...gift, list_id: shared }, hiddenId),
      { status: 404, message: "Envie introuvable." },
    );
    assert.throws(
      () =>
        setMemberGiftPurchased(db, actor.token, hiddenId, { purchased: true }),
      { status: 404, message: "Envie introuvable." },
    );
    assert.throws(
      () =>
        saveMemberGift(
          db,
          actor.token,
          { ...gift, list_id: hidden },
          allowedId,
        ),
      { status: 404 },
    );
    const copied = saveMemberGift(db, actor.token, {
      ...gift,
      list_id: shared,
    });
    assert.ok(copied);
    assert.throws(
      () => saveMemberGift(db, actor.token, { ...gift, list_id: shared }),
      { status: 409 },
    );
    saveMemberGift(
      db,
      actor.token,
      { ...gift, list_id: shared, title: "Edited" },
      copied,
    );
    assert.equal(
      db.prepare("SELECT title FROM gifts WHERE id=?").get(hiddenId)!.title,
      "Secret other gift",
    );
    setMemberGiftPurchased(db, actor.token, copied, { purchased: true });
    assert.equal(
      db.prepare("SELECT purchased FROM gifts WHERE id=?").get(copied)!
        .purchased,
      1,
    );
  } finally {
    db.close();
  }
});

test("membership changes and disable immediately revoke sessions; concurrent sign-in respects disable", async () => {
  const db = await fixture();
  try {
    const actor = await member(db, "alex", ["default"]);
    updateMemberAccess(db, {
      id: actor.id,
      action: "grants",
      lists: [],
      confirm: true,
    });
    assert.equal(sessionAccount(db, actor.token), undefined);
    assert.throws(() => saveMemberGift(db, actor.token, gift), { status: 401 });
    const token = await loginMember(db, "ALEX", memberPassword);
    assert.equal(memberSummary(db, token).gifts.length, 0);
    assert.throws(
      () => saveMemberGift(db, token, { ...gift, list_id: "default" }),
      { status: 404 },
    );
    const pending = loginMember(db, "alex", memberPassword);
    updateMemberAccess(db, { id: actor.id, action: "disable", confirm: true });
    await assert.rejects(pending, { status: 401 });
    assert.equal(sessionAccount(db, token), undefined);
    await assert.rejects(loginMember(db, "alex", memberPassword), {
      status: 401,
    });
    await assert.rejects(loginMember(db, "nobody", memberPassword), {
      status: 401,
    });
  } finally {
    db.close();
  }
});

test("sessions, remote revocation and password rotation remain confined to each account", async () => {
  const db = await fixture();
  try {
    const owner = createSession(db);
    const first = await member(db, "alex", ["default"]),
      second = await member(db, "sam", ["default"]);
    const other = await loginMember(db, "alex", memberPassword);
    assert.equal(listSessions(db, first.token).length, 2);
    assert.equal(listSessions(db, owner).length, 1);
    assert.equal(listSessions(db, second.token).length, 1);
    assert.throws(
      () => revokeSessions(db, first.token, listSessions(db, owner)[0].id),
      { status: 404 },
    );
    assert.throws(
      () =>
        revokeSessions(db, first.token, listSessions(db, second.token)[0].id),
      { status: 404 },
    );
    revokeSessions(db, first.token, "others");
    assert.equal(sessionAccount(db, other), undefined);
    assert.ok(authorized(db, owner));
    assert.ok(sessionAccount(db, second.token));
    const changed = await changeSessionPassword(
      db,
      first.token,
      memberPassword,
      "new-member-password",
    );
    assert.equal(sessionAccount(db, first.token), undefined);
    assert.equal(sessionAccount(db, changed)?.memberId, first.id);
    assert.ok(authorized(db, owner));
    assert.ok(sessionAccount(db, second.token));
    await setPassword(db, "new-owner-password");
    assert.ok(!authorized(db, owner));
    assert.ok(sessionAccount(db, changed));
  } finally {
    db.close();
  }
});

test("family recipient roles protect surprises while other organizers retain their own view", async () => {
  const db = await fixture();
  try {
    const list = saveList(db, {
      name: "For Alex",
      visibility: "private",
      surprise_mode: true,
    });
    const id = saveGift(db, { ...gift, list_id: list, purchased: true });
    const owner = createSession(db);
    const alex = await member(db, "alex", [list]),
      sam = await member(db, "sam", [list]);
    const profile = saveFamilyProfile(db, {
      name: "Alex",
      kind: "adult",
      recipient: alex.id,
    });
    assignFamilyProfile(db, {
      list_id: list,
      profile_id: profile,
      confirm: true,
    });
    const exported = familyExport(db);
    assert.equal(exported.profiles[0].recipient, alex.id);
    assert.equal(
      exported.lists.find((l) => l.id === list)!.profile_id,
      profile,
    );
    assert.equal(memberSummary(db, alex.token).gifts[0].purchased, null);
    assert.equal(memberSummary(db, sam.token).gifts[0].purchased, 1);
    assert.equal(
      listGifts(db, true, accessFromCookies(db, cookies(owner))).find(
        (g) => g.id === id,
      )!.purchased,
      1,
    );
    assert.throws(
      () => setMemberGiftPurchased(db, alex.token, id, { purchased: false }),
      { status: 409 },
    );
    setSurpriseReveal(db, alex.token, true);
    assert.equal(memberSummary(db, alex.token).gifts[0].purchased, 1);
    setMemberGiftPurchased(db, alex.token, id, { purchased: false });
    assert.equal(memberSummary(db, sam.token).gifts[0].purchased, 0);
    setSurpriseReveal(db, alex.token, false);
    const added = saveMemberGift(db, alex.token, {
      ...gift,
      url: "https://example.com/new-surprise",
      list_id: list,
    });
    assert.equal(
      memberSummary(db, alex.token).gifts.find((g) => g.id === id)!.purchased,
      null,
    );
    assert.ok(memberSummary(db, alex.token).gifts.some((g) => g.id === added));
    assert.throws(() =>
      saveFamilyProfile(db, {
        name: "Child",
        kind: "child",
        recipient: alex.id,
      }),
    );
    const child = saveFamilyProfile(db, { name: "Child", kind: "child" });
    assignFamilyProfile(db, {
      list_id: list,
      profile_id: child,
      confirm: true,
    });
    assert.equal(
      db.prepare("SELECT visibility FROM lists WHERE id=?").get(list)!
        .visibility,
      "private",
    );
    assert.equal(db.prepare("SELECT COUNT(*) n FROM members").get()!.n, 2);
    assert.equal(
      db
        .prepare("SELECT surprises_revealed FROM sessions WHERE hash=?")
        .get(hashToken(alex.token))!.surprises_revealed,
      0,
    );
  } finally {
    db.close();
  }
});

test("private media and categories cannot be copied from an unassigned list", async () => {
  const db = await fixture();
  try {
    const list = saveList(db, { name: "Private", visibility: "private" });
    const image = "/media/" + "a".repeat(64) + ".webp";
    const category = randomUUID();
    db.prepare("INSERT INTO categories(id,name,image) VALUES (?,?,?)").run(
      category,
      "Secret category",
      image,
    );
    saveGift(db, { ...gift, image, category_id: category, list_id: list });
    const actor = await member(db, "alex", ["default"]);
    assert.ok(!canReadImage(db, image, memberAccess(db, actor.token)));
    assert.equal(memberSummary(db, actor.token).categories.length, 0);
    assert.throws(
      () =>
        saveMemberGift(db, actor.token, { ...gift, image, list_id: "default" }),
      { status: 404 },
    );
    assert.throws(() =>
      saveMemberGift(db, actor.token, {
        ...gift,
        category_id: category,
        list_id: "default",
      }),
    );
    const ownImage = "/media/" + "b".repeat(64) + ".webp";
    db.prepare("INSERT INTO member_uploads VALUES (?,?)").run(
      actor.id,
      ownImage,
    );
    assert.ok(canReadImage(db, ownImage, memberAccess(db, actor.token)));
    saveMemberGift(db, actor.token, {
      ...gift,
      image: ownImage,
      list_id: "default",
    });
  } finally {
    db.close();
  }
});

test("backups retain accounts and grants but restoration revokes sessions and unused invitations", async () => {
  mkdirSync(".local", { recursive: true });
  const folder = mkdtempSync(".local/family-backup-");
  const db = openDatabase(join(folder, "source", "wishlist.sqlite"));
  try {
    await initializeOwner(db, "Owner", ownerPassword);
    const actor = await member(db, "alex", ["default"]);
    const pending = inviteMember(db, {
      login: "sam",
      name: "Sam",
      lists: ["default"],
      confirm: true,
    });
    const profile = saveFamilyProfile(db, {
      name: "Alex",
      kind: "adult",
      recipient: actor.id,
    });
    assignFamilyProfile(db, {
      list_id: "default",
      profile_id: profile,
      confirm: true,
    });
    backupInstance(db, join(folder, "source"), join(folder, "backup"));
    restoreInstance(join(folder, "backup"), join(folder, "restored"));
    const restored = openDatabase(join(folder, "restored", "wishlist.sqlite"));
    try {
      assert.equal(sessionAccount(restored, actor.token), undefined);
      assert.throws(() => inspectInvitation(restored, pending.token), {
        status: 404,
      });
      const token = await loginMember(restored, "alex", memberPassword);
      assert.equal(memberSummary(restored, token).lists[0].id, "default");
      assert.equal(familyAdmin(restored).profiles[0].name, "Alex");
      assert.deepEqual(restored.prepare("PRAGMA foreign_key_check").all(), []);
    } finally {
      restored.close();
    }
  } finally {
    db.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
