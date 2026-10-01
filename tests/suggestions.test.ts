import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { openDatabase } from "../lib/db";
import { hashToken, initializeOwner } from "../lib/auth";
import {
  accessFromCookies,
  listLists,
  rotateShare,
  saveList,
  shareCookie,
} from "../lib/lists";
import {
  acceptSuggestion,
  createSuggestion,
  listSuggestions,
  manageSuggestion,
  reviewSuggestion,
} from "../lib/suggestions";
import { listGifts } from "../lib/gifts";
import { backupInstance, restoreInstance } from "../lib/backup";
import { getSettings, saveSettings } from "../lib/settings";
import { deliverNotifications } from "../lib/notifications";

const idea = {
  list_id: "default",
  title: "Une idée",
  recipient_visible: true,
  message: "Message privé",
  nickname: "Proche",
};
async function fixture(path = ":memory:") {
  const db = openDatabase(path);
  await initializeOwner(db, "Test", "test-only-password-2026");
  saveList(db, {
    id: "default",
    name: "Ma liste",
    visibility: "public",
    suggestions_enabled: true,
  });
  return db;
}
const status = (db: ReturnType<typeof openDatabase>, token: string) => {
  const result = manageSuggestion(db, { token, action: "status" });
  assert.ok("state" in result);
  return result;
};
const pendingId = (db: ReturnType<typeof openDatabase>) =>
  listSuggestions(db, {}).items[0].id;
const gift = {
  list_id: "default",
  title: "Envie approuvée",
  url: "https://example.com/approved",
  target: "20",
};

test("suggestions require opt-in and current list access; archived/private/revoked links cannot submit", async () => {
  const db = await fixture();
  try {
    const list = saveList(db, {
      name: "Non répertoriée",
      visibility: "unlisted",
    });
    const share = rotateShare(db, list)!;
    const access = () =>
      accessFromCookies(db, {
        get: (n) => (n === shareCookie(list) ? { value: share } : undefined),
      });
    assert.throws(
      () => createSuggestion(db, { ...idea, list_id: list }, access()),
      /indisponibles/,
    );
    saveList(db, {
      id: list,
      name: "Non répertoriée",
      visibility: "unlisted",
      suggestions_enabled: true,
    });
    assert.throws(
      () => createSuggestion(db, { ...idea, list_id: list }),
      /indisponibles/,
    );
    const { token } = createSuggestion(
      db,
      { ...idea, list_id: list },
      access(),
    );
    assert.equal(listGifts(db, true).length, 0);
    assert.equal("message" in listLists(db)[0], false);
    rotateShare(db, list, true);
    assert.throws(
      () => createSuggestion(db, { ...idea, list_id: list }, access()),
      /indisponibles/,
    );
    assert.equal(
      status(db, token).state,
      "pending",
      "withdrawal remains possible after loss of list access",
    );
    saveList(db, { id: list, name: "Privée", visibility: "private" });
    assert.throws(
      () =>
        createSuggestion(
          db,
          { ...idea, list_id: list },
          { owner: true, lists: [] },
        ),
      /indisponibles/,
    );
    saveList(db, {
      id: list,
      name: "Archivée",
      visibility: "public",
      archived: true,
    });
    assert.throws(
      () => createSuggestion(db, { ...idea, list_id: list }),
      /indisponibles/,
    );
    saveList(db, { id: list, name: "Rouverte", visibility: "public" });
    assert.equal(
      listLists(db).find((l) => l.id === list)!.suggestions_enabled,
      1,
      "older clients preserve the setting",
    );
    createSuggestion(db, { ...idea, list_id: list });
  } finally {
    db.close();
  }
});

test("guest content is bounded, explicitly recipient-visible and never fetched; links reject unsafe destinations", async () => {
  const db = await fixture();
  const previous = globalThis.fetch;
  let fetched = false;
  globalThis.fetch = async () => {
    fetched = true;
    throw new Error("Unexpected fetch");
  };
  try {
    for (const url of [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "http://name:secret@example.com",
      "http://127.0.0.1",
      "http://2130706433",
      "http://[::1]",
      "http://printer.local",
      "http://localhost.",
      "https://example.com:4443",
    ])
      assert.throws(() => createSuggestion(db, { ...idea, url }));
    for (const invalid of [
      { recipient_visible: false },
      { title: " " },
      { title: "x".repeat(161) },
      { message: "x".repeat(2001) },
      { nickname: "x".repeat(81) },
      { image: "https://example.com/track.png" },
    ])
      assert.throws(() => createSuggestion(db, { ...idea, ...invalid }));
    const { token } = createSuggestion(db, {
      ...idea,
      title: "<img src=x onerror=alert(1)>",
      url: "https://example.com/gift?utm_source=x",
    });
    assert.equal(status(db, token).url, "https://example.com/gift");
    assert.equal(fetched, false);
    assert.equal(listSuggestions(db, {}).items.length, 1);
    assert.equal(
      JSON.stringify(db.prepare("SELECT * FROM audit").all()).includes(token),
      false,
    );
    assert.equal(
      JSON.stringify(db.prepare("SELECT * FROM audit").all()).includes(
        idea.message,
      ),
      false,
    );
    assert.equal(
      JSON.stringify(listSuggestions(db, {})).includes("token_hash"),
      false,
    );
  } finally {
    globalThis.fetch = previous;
    db.close();
  }
});

test("owner acceptance creates one editable gift atomically; failed validation, reject and withdrawal cannot publish", async () => {
  const db = await fixture();
  try {
    const { token } = createSuggestion(db, idea);
    const id = pendingId(db);
    assert.throws(() =>
      acceptSuggestion(db, id, { ...gift, target: "invalid" }),
    );
    assert.equal(status(db, token).state, "pending");
    assert.equal(listGifts(db, true).length, 0);
    assert.throws(
      () => acceptSuggestion(db, id, { ...gift, list_id: "other" }),
      /Conservez/,
    );
    const giftId = acceptSuggestion(db, id, gift);
    assert.equal(
      acceptSuggestion(db, id, { ...gift, title: "A retry cannot overwrite" }),
      giftId,
    );
    assert.equal(listGifts(db, true).length, 1);
    const created = listGifts(db, true)[0];
    assert.equal(created.title, gift.title);
    assert.equal(
      created.description,
      "",
      "the private message is not copied to the gift",
    );
    assert.equal(status(db, token).state, "accepted");
    assert.deepEqual(
      Object.keys(status(db, token)).sort(),
      ["title", "nickname", "message", "url", "state", "created_at"].sort(),
    );
    const rejected = createSuggestion(db, idea);
    const rejectedId = pendingId(db);
    reviewSuggestion(db, rejectedId, { action: "reject", confirm: true });
    reviewSuggestion(db, rejectedId, { action: "reject", confirm: true });
    assert.throws(
      () => acceptSuggestion(db, rejectedId, gift),
      /déjà été traitée/,
    );
    assert.equal(status(db, rejected.token).state, "rejected");
    const withdrawn = createSuggestion(db, idea);
    const withdrawnId = pendingId(db);
    manageSuggestion(db, {
      token: withdrawn.token,
      action: "delete",
      confirm: true,
    });
    assert.throws(() => acceptSuggestion(db, withdrawnId, gift), /introuvable/);
    assert.equal(listGifts(db, true).length, 1);
  } finally {
    db.close();
  }
});

test("tracking secrets rotate and revoke; deletion purges the proposal without deleting an accepted gift", async () => {
  const db = await fixture();
  try {
    const { token } = createSuggestion(db, idea);
    const id = pendingId(db);
    assert.throws(
      () => manageSuggestion(db, { token, action: "rotate" }),
      /Confirmez/,
    );
    const rotated = manageSuggestion(db, {
      token,
      action: "rotate",
      confirm: true,
    });
    assert.ok("token" in rotated && typeof rotated.token === "string");
    const rotatedToken = rotated.token;
    assert.notEqual(rotatedToken, token);
    assert.throws(() => status(db, token), /introuvable/);
    acceptSuggestion(db, id, gift);
    manageSuggestion(db, {
      token: rotatedToken,
      action: "delete",
      confirm: true,
    });
    assert.throws(() => status(db, rotatedToken), /introuvable/);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM suggestions").get()!.n, 0);
    assert.equal(listGifts(db, true).length, 1);
    const another = createSuggestion(db, idea);
    reviewSuggestion(db, pendingId(db), { action: "delete", confirm: true });
    assert.throws(() => status(db, another.token), /introuvable/);
  } finally {
    db.close();
  }
});

test("moderation is paginated and the persistent queue remains bounded", async () => {
  const db = await fixture();
  try {
    for (let i = 0; i < 100; i++)
      createSuggestion(db, { ...idea, title: `Idée ${i}` });
    assert.throws(
      () => createSuggestion(db, idea),
      /boîte de suggestions est pleine/,
    );
    const first = listSuggestions(db, {}),
      second = listSuggestions(db, { page: "1" });
    assert.equal(first.total, 100);
    assert.equal(first.items.length, 20);
    assert.equal(second.items.length, 20);
    assert.equal(
      new Set([...first.items, ...second.items].map((x) => x.id)).size,
      40,
    );
    assert.throws(() => listSuggestions(db, { state: "__proto__" }));
    assert.throws(() => listSuggestions(db, { page: "-1" }));
    reviewSuggestion(db, first.items[0].id, {
      action: "delete",
      confirm: true,
    });
    createSuggestion(db, idea);
  } finally {
    db.close();
  }
});

test("neutral suggestion notifications remain separate from hidden reservations and disappear on moderation", async () => {
  const db = await fixture();
  try {
    saveSettings(db, { ...getSettings(db), notifications: true });
    saveList(db, {
      id: "default",
      name: "Surprise",
      visibility: "public",
      surprise_mode: true,
    });
    createSuggestion(db, idea);
    const sent: string[] = [];
    await deliverNotifications(db, async (kind) => {
      sent.push(kind);
    });
    assert.deepEqual(sent, ["suggestion"]);
    const another = createSuggestion(db, idea);
    manageSuggestion(db, {
      token: another.token,
      action: "delete",
      confirm: true,
    });
    const third = createSuggestion(db, idea);
    const thirdId = String(
      db
        .prepare("SELECT id FROM suggestions WHERE token_hash=?")
        .get(hashToken(third.token))!.id,
    );
    reviewSuggestion(db, thirdId, { action: "reject", confirm: true });
    assert.equal(status(db, third.token).state, "rejected");
    await deliverNotifications(db, async (kind) => {
      sent.push(kind);
    });
    assert.deepEqual(sent, ["suggestion"]);
  } finally {
    db.close();
  }
});

test("migration preserves existing gifts; backups retain suggestions and revoke tracking links on restore", async () => {
  mkdirSync(resolve(".local"), { recursive: true });
  const root = mkdtempSync(resolve(".local/suggestions-"));
  const source = join(root, "source");
  let db = await fixture(join(source, "wishlist.sqlite"));
  try {
    createSuggestion(db, idea);
    const created = acceptSuggestion(db, pendingId(db), gift);
    // Recreate the schema-011 shape before reopening through the real migration path.
    db.exec(
      "DROP TABLE suggestions; ALTER TABLE lists DROP COLUMN suggestions_enabled; DELETE FROM migrations WHERE name='012-gift-suggestions.sql'",
    );
    db.close();
    db = openDatabase(join(source, "wishlist.sqlite"));
    assert.equal(listGifts(db, true)[0].id, created);
    assert.equal(listLists(db)[0].suggestions_enabled, 0);
    saveList(db, {
      id: "default",
      name: "Rouverte",
      visibility: "public",
      suggestions_enabled: true,
    });
    const { token } = createSuggestion(db, idea);
    const id = pendingId(db);
    backupInstance(db, source, join(root, "backup"));
    restoreInstance(join(root, "backup"), join(root, "restored"));
    const restored = openDatabase(join(root, "restored/wishlist.sqlite"));
    try {
      assert.equal(listLists(restored)[0].suggestions_enabled, 1);
      assert.equal(listSuggestions(restored, {}).items[0].id, id);
      assert.throws(() => status(restored, token), /introuvable/);
      acceptSuggestion(restored, id, {
        ...gift,
        url: "https://example.com/restored",
      });
      assert.equal(listGifts(restored, true).length, 2);
    } finally {
      restored.close();
    }
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});
