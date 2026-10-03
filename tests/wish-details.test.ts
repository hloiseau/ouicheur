import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../lib/db";
import { initializeOwner } from "../lib/auth";
import { saveGift, listGifts } from "../lib/gifts";
import { createReservation, reservationStatus } from "../lib/reservations";
import { createIntent } from "../lib/payments";
import { createImport, getImport, commitImport } from "../lib/imports";
import { filterWishlist } from "../lib/wishlist-filters";
async function fixture() {
  const db = openDatabase(":memory:");
  await initializeOwner(db, "Owner", "wish-test-only-password");
  db.exec("UPDATE owner SET paypal='FictionalOnly'");
  return db;
}
const gift = {
  url: "https://example.com/shirt",
  title: "Shirt",
  target: "30",
  size: "M",
  color: "Blue",
};
test("variants distinguish duplicate products and reservation snapshots never change after editing", async () => {
  const db = await fixture();
  try {
    const id = saveGift(db, gift);
    saveGift(db, { ...gift, size: "L" });
    assert.throws(() => saveGift(db, gift), /existe déjà/);
    const r = createReservation(db, { gift_id: id, quantity: 1 });
    assert.equal(reservationStatus(db, r.token).details?.size, "M");
    assert.equal(reservationStatus(db, r.token).details_changed, false);
    assert.throws(
      () => saveGift(db, { ...gift, size: "L" }, id),
      /existe déjà/,
    );
    saveGift(db, { ...gift, size: "S" }, id);
    assert.equal(reservationStatus(db, r.token).details?.size, "M");
    assert.equal(reservationStatus(db, r.token).details_changed, true);
  } finally {
    db.close();
  }
});
test("all alternative offers consume the same quantity; the selected offer remains in the reservation history", async () => {
  const db = await fixture();
  try {
    const id = saveGift(db, {
      ...gift,
      offers: [
        {
          url: "https://example.org/used",
          condition: "used",
          note: "Same edition",
          price: 1500,
          currency: "EUR",
          shipping: 400,
        },
      ],
    });
    const offer = listGifts(db)[0].offers![0];
    const r = createReservation(db, {
      gift_id: id,
      quantity: 1,
      offer_id: offer.id,
    });
    assert.throws(
      () => createReservation(db, { gift_id: id, quantity: 1 }),
      /réservée/,
    );
    assert.equal(reservationStatus(db, r.token).details?.url, offer.url);
    assert.equal(reservationStatus(db, r.token).details?.condition, "used");
    saveGift(db, gift, id);
    assert.equal(reservationStatus(db, r.token).details_changed, true);
    assert.equal(
      reservationStatus(db, r.token).details?.offer_note,
      "Same edition",
    );
  } finally {
    db.close();
  }
});
test("no-link wishes distinguish unknown budgets from no expense, remain reservable and cannot collect money", async () => {
  const db = await fixture();
  try {
    assert.throws(
      () => saveGift(db, { title: "Product without link", target: "20" }),
      /doit avoir un lien/,
    );
    assert.throws(
      () => saveGift(db, { ...gift, target: "" }),
      /budget positif/,
    );
    const unknown = saveGift(db, {
      title: "Shared meal",
      kind: "experience",
      budget_mode: "unknown",
      time_hint: "A weekend",
    });
    const free = saveGift(db, {
      title: "Repair",
      kind: "service",
      budget_mode: "free",
    });
    saveGift(db, {
      title: "Handmade",
      kind: "handmade",
      budget_mode: "unknown",
    });
    const rows = listGifts(db);
    assert.equal(rows.length, 3);
    assert.ok(rows.every((r) => r.target === 0));
    const filters = {
      search: "",
      currency: "EUR",
      basis: "total" as const,
      minimum: 0,
      maximum: 500,
      availableOnly: true,
      sort: "price" as const,
      locale: "en",
    };
    assert.deepEqual(
      filterWishlist(rows, filters).map((g) => g.id),
      [free],
    );
    assert.throws(
      () => createIntent(db, { gift_id: unknown, amount: "1" }),
      /financement/,
    );
    createReservation(db, { gift_id: unknown, quantity: 1 });
    assert.equal(
      reservationStatus(
        db,
        createReservation(db, { gift_id: free, quantity: 1 }).token,
      ).details?.kind,
      "service",
    );
  } finally {
    db.close();
  }
});
test("imports preserve variants, quantity, original links and free wishes without false empty-URL duplicates", async () => {
  const db = await fixture();
  try {
    const payload = [
      {
        ...gift,
        price: "30",
        currency: "EUR",
        quantity: 2,
        model: "2026",
        variant_policy: "flexible",
      },
      {
        title: "A walk",
        kind: "experience",
        budget_mode: "free",
        url: "",
        currency: "EUR",
      },
      {
        title: "A meal",
        kind: "service",
        budget_mode: "unknown",
        currency: "EUR",
      },
    ];
    const id = createImport(db, "json", JSON.stringify(payload));
    const items = getImport(db, id).items;
    assert.ok(items.every((i) => !i.errors.length));
    commitImport(
      db,
      id,
      items.map((i, index) => ({ index, gift: { ...i, target: i.price } })),
    );
    const imported = listGifts(db);
    assert.equal(imported.length, 3);
    const shirt = imported.find((g) => g.kind === "product")!;
    assert.equal(shirt.quantity, 2);
    assert.equal(shirt.target, 6000);
    assert.equal(shirt.model, "2026");
    assert.equal(shirt.variant_policy, "flexible");
  } finally {
    db.close();
  }
});
