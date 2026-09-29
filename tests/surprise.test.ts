import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { openDatabase } from "../lib/db";
import { initializeOwner, createSession } from "../lib/auth";
import {
  accessFromCookies,
  saveList,
  rotateShare,
  shareCookie,
  listLists,
} from "../lib/lists";
import { listGifts, saveGift } from "../lib/gifts";
import { createReservation, updateReservation } from "../lib/reservations";
import { createIntent, declareIntent } from "../lib/payments";
import { setSurpriseReveal, requireSurpriseReveal } from "../lib/surprise";
import { getSettings, saveSettings } from "../lib/settings";
import { deliverNotifications } from "../lib/notifications";
import { backupInstance, restoreInstance } from "../lib/backup";
import { productGet } from "../lib/product-api";

async function fixture(path = ":memory:") {
  const db = openDatabase(path);
  await initializeOwner(db, "Test", "test-only-password-2026", {
    paypal: "FictionalTestOnly",
    currency: "EUR",
  });
  return db;
}
const input = {
  title: "A surprise",
  url: "https://example.com/surprise",
  target: "20",
  quantity: 2,
  visibility: "visible",
};
const ownerAccess = (db: ReturnType<typeof openDatabase>, token: string) =>
  accessFromCookies(db, {
    get: (name) =>
      name === "wishlister_session" ? { value: token } : undefined,
  });

test("recipient projection preserves financial truth, donor availability and private-link access", async () => {
  const db = await fixture();
  try {
    const list = saveList(db, {
      name: "Birthday",
      visibility: "unlisted",
      surprise_mode: true,
    });
    const share = rotateShare(db, list)!;
    const donor = accessFromCookies(db, {
      get: (name) =>
        name === shareCookie(list) ? { value: share } : undefined,
    });
    const owner = ownerAccess(db, createSession(db));
    const gift = saveGift(db, { ...input, list_id: list, purchased: false });
    const { token } = createReservation(
      db,
      { gift_id: gift, quantity: 1 },
      donor,
    );
    updateReservation(db, token, { state: "purchased" });
    const moneyGift = saveGift(db, {
      ...input,
      list_id: list,
      url: "https://example.com/funded",
    });
    const contribution = createIntent(
      db,
      { gift_id: moneyGift, amount: "5" },
      donor,
    );
    declareIntent(db, contribution.id);
    const recipient = listGifts(db, true, owner).find((g) => g.id === gift)!;
    assert.deepEqual(
      [recipient.reserved, recipient.purchased, recipient.closed],
      [null, null, null],
    );
    assert.equal(recipient.surprise_hidden, true);
    assert.equal(
      listGifts(db, false, donor).find((g) => g.id === gift)!.reserved,
      1,
    );
    assert.equal(
      listGifts(db, false, { ...owner, owner: false }).find(
        (g) => g.id === gift,
      ),
      undefined,
      "public preview must not grant an unlisted link",
    );
    assert.equal(
      listGifts(db, false, { ...owner, owner: false, lists: [list] }).find(
        (g) => g.id === gift,
      )!.reserved,
      null,
    );
    assert.equal(
      listGifts(db, true, owner).find((g) => g.id === moneyGift)!.funded,
      500,
    );
    assert.throws(
      () => createReservation(db, { gift_id: gift, quantity: 2 }, donor),
      /quantité vient/,
    );
    assert.throws(
      () => createReservation(db, { gift_id: gift, quantity: 1 }, owner),
      /Révélez les surprises/,
    );
    assert.throws(
      () => createIntent(db, { gift_id: gift, amount: "1" }, owner),
      /Révélez les surprises/,
    );
    assert.equal(
      listGifts(db).some((g) => g.id === gift),
      false,
    );
    rotateShare(db, list, true);
    const revoked = accessFromCookies(db, {
      get: (name) =>
        name === shareCookie(list) ? { value: share } : undefined,
    });
    assert.equal(
      listGifts(db, false, revoked).some((g) => g.id === gift),
      false,
    );
  } finally {
    db.close();
  }
});

test("reveal is explicit and session-scoped; protected administration cannot disclose counts", async () => {
  const db = await fixture();
  try {
    const list = saveList(db, {
      name: "Birthday",
      visibility: "public",
      surprise_mode: true,
    });
    const gift = saveGift(db, {
      ...input,
      list_id: list,
      purchased: true,
      closed: true,
    });
    const first = createSession(db),
      second = createSession(db);
    const access = () => ownerAccess(db, first);
    assert.throws(() => requireSurpriseReveal(db, access()), /Révélez/);
    for (const path of [
      "admin/operations",
      "admin/diagnostics",
      "admin/backups/unknown",
      "admin/history?kind=reservations",
      "admin/history?kind=audit",
    ]) {
      const url = new URL("http://localhost/" + path);
      await assert.rejects(
        productGet(db, url.pathname.slice(1), url, access()),
        /Révélez/,
      );
    }
    const financialHistory = await productGet(
      db,
      "admin/history",
      new URL("http://localhost/?kind=contributions"),
      access(),
    );
    assert.equal(financialHistory!.status, 200);
    assert.throws(
      () => setSurpriseReveal(db, "0".repeat(64), true),
      /Connexion/,
    );
    setSurpriseReveal(db, first, true);
    assert.equal(
      listGifts(db, true, access()).find((g) => g.id === gift)!.purchased,
      1,
    );
    assert.equal(
      listGifts(db, true, ownerAccess(db, second)).find((g) => g.id === gift)!
        .purchased,
      null,
    );
    setSurpriseReveal(db, first, false);
    assert.equal(
      listGifts(db, true, access()).find((g) => g.id === gift)!.purchased,
      null,
    );
    assert.throws(
      () =>
        saveList(db, {
          id: list,
          name: "Birthday",
          visibility: "public",
          surprise_mode: false,
        }),
      /Confirmez/,
    );
    saveList(db, { id: list, name: "Birthday renamed", visibility: "public" });
    assert.equal(
      listLists(db).find((l) => l.id === list)!.surprise_mode,
      1,
      "older clients must not disable the setting implicitly",
    );
    saveList(db, {
      id: list,
      name: "Birthday",
      visibility: "public",
      surprise_mode: false,
      confirm_reveal: true,
    });
    setSurpriseReveal(db, first, true);
    saveList(db, {
      id: list,
      name: "Birthday",
      visibility: "public",
      surprise_mode: true,
    });
    assert.equal(
      access().revealSurprises,
      false,
      "enabling protection must reset previous reveals",
    );
  } finally {
    db.close();
  }
});

test("reservation notifications are suppressed, including jobs queued before protection was enabled", async () => {
  const db = await fixture();
  try {
    saveSettings(db, { ...getSettings(db), notifications: true });
    const list = saveList(db, { name: "Birthday", visibility: "public" });
    const gift = saveGift(db, { ...input, list_id: list });
    createReservation(db, { gift_id: gift, quantity: 1 });
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM notification_jobs").get()!.n,
      1,
    );
    saveList(db, {
      id: list,
      name: "Birthday",
      visibility: "public",
      surprise_mode: true,
    });
    createReservation(db, { gift_id: gift, quantity: 1 });
    const sent: string[] = [];
    await deliverNotifications(db, async (kind) => {
      sent.push(kind);
    });
    assert.deepEqual(sent, []);
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM notification_jobs").get()!.n,
      0,
    );
    const funded = saveGift(db, {
      ...input,
      list_id: list,
      url: "https://example.com/contribution",
    });
    const contribution = createIntent(db, { gift_id: funded, amount: "3" });
    declareIntent(db, contribution.id);
    await deliverNotifications(db, async (kind) => {
      sent.push(kind);
    });
    assert.deepEqual(sent, ["declaration"]);
  } finally {
    db.close();
  }
});

test("backup restoration retains surprise settings and reservations but invalidates revealed sessions", async () => {
  mkdirSync(resolve(".local"), { recursive: true });
  const root = mkdtempSync(resolve(".local/surprise-"));
  const source = join(root, "source");
  const db = await fixture(join(source, "wishlist.sqlite"));
  try {
    const list = saveList(db, {
      name: "Birthday",
      visibility: "public",
      surprise_mode: true,
    });
    const gift = saveGift(db, { ...input, list_id: list });
    createReservation(db, { gift_id: gift, quantity: 1 });
    const session = createSession(db);
    setSurpriseReveal(db, session, true);
    backupInstance(db, source, join(root, "backup"));
    restoreInstance(join(root, "backup"), join(root, "restored"));
    const restored = openDatabase(join(root, "restored/wishlist.sqlite"));
    try {
      assert.equal(ownerAccess(restored, session).owner, false);
      assert.equal(
        listLists(restored).find((l) => l.id === list)!.surprise_mode,
        1,
      );
      assert.equal(listGifts(restored).find((g) => g.id === gift)!.reserved, 1);
      assert.equal(
        listGifts(
          restored,
          true,
          ownerAccess(restored, createSession(restored)),
        ).find((g) => g.id === gift)!.reserved,
        null,
      );
    } finally {
      restored.close();
    }
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});
