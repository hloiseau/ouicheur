import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../lib/db";
import { initializeOwner } from "../lib/auth";
import { saveGift } from "../lib/gifts";
import { saveList } from "../lib/lists";
import {
  createReservation,
  reservationStatus,
  reservedQuantity,
  updateReservation,
} from "../lib/reservations";
import { productGet, productPost } from "../lib/product-api";

test("owner cancellation releases only the selected quantity and preserves surprise boundaries", async () => {
  const db = openDatabase(":memory:");
  try {
    await initializeOwner(db, "Test", "test-only-password-2026", {
      currency: "EUR",
      paypal: "",
    });
    const hiddenList = saveList(db, {
      name: "Surprise",
      visibility: "public",
      surprise_mode: true,
    });
    const gift = saveGift(db, {
      title: "Shared gift",
      url: "https://example.com/shared",
      target: "20",
      quantity: 3,
    });
    const hiddenGift = saveGift(db, {
      title: "Secret gift",
      url: "https://example.com/secret",
      target: "20",
      list_id: hiddenList,
    });
    const first = createReservation(db, { gift_id: gift, quantity: 1 });
    const second = createReservation(db, { gift_id: gift, quantity: 2 });
    const hidden = createReservation(db, { gift_id: hiddenGift, quantity: 1 });
    updateReservation(db, first.token, { state: "purchased" });
    const id = String(reservationStatus(db, first.token).id);
    const secretId = String(reservationStatus(db, hidden.token).id);
    const owner = { owner: true, lists: [] };
    await assert.rejects(
      productGet(
        db,
        "admin/history",
        new URL("http://localhost/?kind=reservations"),
        owner,
      ),
      /Révélez/,
    );
    await assert.rejects(
      productGet(
        db,
        "admin/history",
        new URL(`http://localhost/?kind=reservations&gift_id=${hiddenGift}`),
        owner,
      ),
      /Révélez/,
    );
    const history = await (await productGet(
      db,
      "admin/history",
      new URL(`http://localhost/?kind=reservations&gift_id=${gift}`),
      owner,
    ))!.json();
    assert.equal(history.total, 2);
    assert.ok(
      history.items.every((r: { title: string }) => r.title === "Shared gift"),
    );
    await assert.rejects(
      productPost(db, "admin/reservations/cancel", { id }, owner),
    );
    await assert.rejects(
      productPost(
        db,
        "admin/reservations/cancel",
        { id: secretId, confirm: true },
        owner,
      ),
      /Révélez/,
    );
    assert.equal(reservedQuantity(db, gift), 3);
    await productPost(
      db,
      "admin/reservations/cancel",
      { id, confirm: true },
      owner,
    );
    assert.equal(reservedQuantity(db, gift), 2);
    assert.equal(reservationStatus(db, first.token).state, "cancelled");
    assert.equal(reservationStatus(db, second.token).state, "reserved");
    assert.equal(reservationStatus(db, hidden.token).state, "reserved");
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) n FROM audit WHERE action='reservation.cancel_owner'",
        )
        .get()!.n,
      1,
    );
    await assert.rejects(
      productPost(
        db,
        "admin/reservations/cancel",
        { id, confirm: true },
        owner,
      ),
      /plus active/,
    );
    const secondId = reservationStatus(db, second.token).id;
    db.prepare(
      "UPDATE reservations SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=?",
    ).run(secondId);
    await assert.rejects(
      productPost(
        db,
        "admin/reservations/cancel",
        { id: secondId, confirm: true },
        owner,
      ),
      /plus active/,
    );
    await productPost(
      db,
      "admin/reservations/cancel",
      { id: secretId, confirm: true },
      { ...owner, revealSurprises: true },
    );
    assert.equal(reservedQuantity(db, hiddenGift), 0);
  } finally {
    db.close();
  }
});
