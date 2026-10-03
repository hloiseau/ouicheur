import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../lib/db";
import { initializeOwner } from "../lib/auth";
import { listGifts, saveGift, setGiftPurchased } from "../lib/gifts";
import { saveList } from "../lib/lists";
import { createIntent, declareIntent } from "../lib/payments";
import { createReservation } from "../lib/reservations";
const owner = { owner: true, lists: [] };
const input = {
  title: "Une envie",
  url: "https://example.com/purchase",
  target: "50",
  quantity: 2,
};

test("purchase switch is reversible, preserves financial records and survives ordinary edits", async () => {
  const db = openDatabase(":memory:");
  try {
    await initializeOwner(db, "Test", "test-only-password-2026", {
      paypal: "FictionalTestOnly",
      currency: "EUR",
    });
    const id = saveGift(db, input);
    const pending = createIntent(db, { gift_id: id, amount: "10" });
    const before = db.prepare("SELECT * FROM gifts WHERE id=?").get(id)!;
    setGiftPurchased(db, id, { purchased: true }, owner);
    assert.throws(() => createIntent(db, { gift_id: id, amount: "1" }));
    assert.throws(() => createReservation(db, { gift_id: id, quantity: 1 }));
    declareIntent(db, pending.id);
    const bought = listGifts(db)[0];
    assert.equal(bought.purchased, 1);
    assert.equal(bought.funded, 1000);
    const after = db.prepare("SELECT * FROM gifts WHERE id=?").get(id)!;
    assert.deepEqual(
      { ...after, purchased: before.purchased, updated_at: before.updated_at },
      { ...before },
    );
    saveGift(db, { ...input, title: "Une envie renommée" }, id);
    assert.equal(listGifts(db)[0].purchased, 1);
    setGiftPurchased(db, id, { purchased: true }, owner);
    assert.equal(
      db
        .prepare("SELECT COUNT(*) n FROM audit WHERE action='gift.purchase'")
        .get()!.n,
      1,
    );
    setGiftPurchased(db, id, { purchased: false }, owner);
    assert.equal(listGifts(db)[0].purchased, 0);
    assert.equal(listGifts(db)[0].funded, 1000);
    assert.equal(listGifts(db)[0].title, "Une envie renommée");
    assert.ok(createIntent(db, { gift_id: id, amount: "1" }));
  } finally {
    db.close();
  }
});

test("purchase updates require an owner, strict boolean and a reveal scoped to the gift's list", async () => {
  const db = openDatabase(":memory:");
  try {
    await initializeOwner(db, "Test", "test-only-password-2026");
    const list = saveList(db, {
      name: "Surprise",
      visibility: "public",
      surprise_mode: true,
    });
    const protectedId = saveGift(db, { ...input, list_id: list });
    const ordinaryId = saveGift(db, { ...input, url: input.url + "/ordinary" });
    assert.throws(
      () =>
        setGiftPurchased(
          db,
          ordinaryId,
          { purchased: true },
          { owner: false, lists: [] },
        ),
      /administrateur/,
    );
    assert.throws(
      () => setGiftPurchased(db, protectedId, { purchased: true }, owner),
      /Révélez/,
    );
    assert.equal(
      listGifts(db, true, owner).find((g) => g.id === protectedId)!.purchased,
      null,
    );
    for (const payload of [
      { purchased: "false" },
      { purchased: 1 },
      { purchased: true, title: "hijack" },
      {},
    ])
      assert.throws(() => setGiftPurchased(db, ordinaryId, payload, owner));
    assert.throws(
      () => setGiftPurchased(db, "missing", { purchased: true }, owner),
      /introuvable/,
    );
    setGiftPurchased(db, ordinaryId, { purchased: true }, owner);
    setGiftPurchased(
      db,
      protectedId,
      { purchased: true },
      { ...owner, revealSurprises: true },
    );
    assert.equal(
      listGifts(db, true, { ...owner, revealSurprises: true }).find(
        (g) => g.id === protectedId,
      )!.purchased,
      1,
    );
  } finally {
    db.close();
  }
});
