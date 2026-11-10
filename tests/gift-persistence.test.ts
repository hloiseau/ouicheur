import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { openDatabase } from "../lib/db.ts";
import { initializeOwner } from "../lib/auth.ts";
import { saveList } from "../lib/lists.ts";
import { giftService } from "../lib/gift-persistence.ts";
import { removeGift, SqliteGiftStore } from "../lib/gift-sqlite.ts";
import { giftContract } from "./gift-contract.ts";
import { catalogService } from "../lib/catalog.ts";
import { SqliteCatalogStore } from "../lib/catalog-sqlite.ts";
import { saveGift } from "../lib/gifts.ts";
import { savePriceWatch } from "../lib/price-history.ts";
import { createReservation, reservationStatus } from "../lib/reservations.ts";
giftContract("SQLite gifts", async () => {
  const db = openDatabase(":memory:");
  await initializeOwner(db, "Gifts", "test-gift-password-only");
  return {
    service: giftService(new SqliteGiftStore(db)),
    list: "default",
    async purchase(id, purchased, access) {
      return catalogService(new SqliteCatalogStore(db)).setManagedGiftPurchased(
        id,
        { purchased },
        access,
      );
    },
    async archiveList(id) {
      db.prepare("UPDATE lists SET archived=1 WHERE id=?").run(id);
    },
    async listCreate(surprise = false) {
      return saveList(db, {
        name: "Test",
        visibility: "private",
        surprise_mode: surprise,
      });
    },
    async setCurrency(currency) {
      db.prepare("UPDATE owner SET currency=?").run(currency);
    },
    async seedCategory(id) {
      db.prepare("INSERT INTO categories(id,name) VALUES (?,?)").run(id, id);
    },
    async seedPriority(id) {
      db.prepare(
        "INSERT INTO gift_priorities(id,name,position) VALUES (?,'Custom',3)",
      ).run(id);
    },
    async seedReservation(id, quantity, state, expired) {
      db.prepare(
        "INSERT INTO reservations(id,token_hash,gift_id,quantity,state,created_at,expires_at) VALUES (?,?,?,?,?,?,?)",
      ).run(
        randomUUID(),
        randomUUID(),
        id,
        quantity,
        state,
        new Date().toISOString(),
        new Date(Date.now() + (expired ? -1 : 1) * 86400000).toISOString(),
      );
    },
    async seedContribution(id) {
      db.prepare(
        "INSERT INTO contributions(id,gift_id,amount,currency,state,created_at,expires_at) VALUES (?,?,100,'EUR','expired',?,?)",
      ).run(
        randomUUID(),
        id,
        new Date().toISOString(),
        new Date().toISOString(),
      );
    },
    async seedSource(id) {
      db.prepare(
        "UPDATE gifts SET source='test-import',source_id='original' WHERE id=?",
      ).run(id);
    },
    async setPurchased(id) {
      db.prepare("UPDATE gifts SET purchased=1 WHERE id=?").run(id);
    },
    async failAudit() {
      db.exec(
        "CREATE TRIGGER test_gift_audit BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'test audit failure'); END",
      );
    },
    async auditCount(id) {
      return Number(
        db.prepare("SELECT count(*) AS n FROM audit WHERE entity_id=?").get(id)!
          .n,
      );
    },
    async close() {
      db.close();
    },
  };
});

test("gift removal rechecks engagements and keeps reservation and offer history", async () => {
  const db = openDatabase(":memory:");
  try {
    await initializeOwner(db, "Gifts", "test-gift-password-only");
    const owner = { owner: true, lists: [] };
    const editor = {
      owner: false,
      lists: [],
      memberId: randomUUID(),
      editableLists: ["default"],
    };
    const id = saveGift(db, {
      title: "Gift with a price watch",
      url: "https://example.com/gift",
      target: "15",
      offers: [{ url: "https://example.com/offer", currency: "EUR" }],
    });
    savePriceWatch(db, {
      gift_id: id,
      threshold: 1000,
      confirmed_variant: true,
      automatic: true,
      confirm: true,
    });
    const remove = (confirm?: "archive" | "delete") =>
      removeGift(db, id, { confirm }, editor);
    assert.throws(
      () => removeGift(db, id, {}, { ...editor, editableLists: ["other"] }),
      /Cadeau introuvable/,
    );
    assert.deepEqual(remove(), { action: "delete" });
    const reservation = createReservation(db, { gift_id: id, quantity: 1 });
    assert.throws(() => remove("delete"), /engagements.*ont changé/);
    assert.equal(
      db.prepare("SELECT visibility FROM gifts WHERE id=?").get(id)?.visibility,
      "visible",
    );
    assert.deepEqual(removeGift(db, id, {}, owner), { action: "archive" });
    assert.deepEqual(remove("archive"), { action: "archive" });
    assert.equal(
      db.prepare("SELECT visibility FROM gifts WHERE id=?").get(id)?.visibility,
      "archived",
    );
    assert.equal(reservationStatus(db, reservation.token).state, "reserved");
    assert.ok(db.prepare("SELECT 1 FROM gift_offers WHERE gift_id=?").get(id));
    assert.equal(
      db.prepare("SELECT automatic FROM price_watches WHERE gift_id=?").get(id)
        ?.automatic,
      0,
    );
  } finally {
    db.close();
  }
});
