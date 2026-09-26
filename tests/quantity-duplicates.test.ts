import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { openDatabase } from "../lib/db";
import { initializeOwner } from "../lib/auth";
import { listGifts, saveGift } from "../lib/gifts";
import { createIntent, declareIntent } from "../lib/payments";
import { createImport, commitImport, getImport } from "../lib/imports";

test("migration: les envies existantes gardent leur objectif et une quantité de 1", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync("migrations/001-initial.sql", "utf8"));
    db.exec(
      "INSERT INTO gifts(id,url,title,target,currency,created_at,updated_at) VALUES ('old','https://example.com/item','Envie',1999,'EUR','2026-09-26','2026-09-26')",
    );
    db.exec(
      readFileSync("migrations/009-gift-quantity-duplicates.sql", "utf8"),
    );
    const gift = db.prepare("SELECT target,quantity FROM gifts").get()!;
    assert.equal(gift.target, 1999);
    assert.equal(gift.quantity, 1);
    assert.throws(() => db.exec("UPDATE gifts SET quantity=0"));
    assert.throws(() => db.exec("UPDATE gifts SET quantity=1.5"));
  } finally {
    db.close();
  }
});

test("quantités et doublons volontaires conservent un financement indépendant", async () => {
  const db = openDatabase(":memory:");
  try {
    await initializeOwner(db, "Test", "test-only-password-2026");
    db.exec("UPDATE owner SET paypal='FictionalTestOnly'");
    const input = {
      url: "https://example.com/item",
      title: "Envie",
      target: "19,99",
      quantity: 3,
    };
    const first = saveGift(db, input);
    assert.equal(listGifts(db)[0].target, 5997);
    const intent = createIntent(db, { gift_id: first, amount: "30" });
    declareIntent(db, intent.id);
    assert.throws(
      () => createIntent(db, { gift_id: first, amount: "30" }),
      /restant/,
    );
    assert.throws(
      () => saveGift(db, { ...input, url: input.url + "?utm_source=test" }),
      /existe déjà/,
    );
    const copy = saveGift(db, { ...input, quantity: 2, allow_duplicate: true });
    assert.notEqual(first, copy);
    assert.equal(listGifts(db).find((g) => g.id === copy)!.funded, 0);
    assert.equal(listGifts(db).find((g) => g.id === first)!.funded, 3000);
    saveGift(db, { ...input, title: "Copie modifiée", quantity: 4 }, copy);
    assert.equal(listGifts(db).find((g) => g.id === copy)!.target, 7996);
    saveGift(db, { ...input, quantity: 1 }, first);
    assert.equal(listGifts(db).find((g) => g.id === first)!.funded, 3000);
    assert.throws(
      () => createIntent(db, { gift_id: first, amount: "1" }),
      /terminé/,
    );
    for (const quantity of [0, -1, 1.5, 1000, "2", null])
      assert.throws(() => saveGift(db, { ...input, quantity }, copy));
    assert.throws(
      () => saveGift(db, { ...input, target: "1000000", quantity: 2 }, copy),
      /limites/,
    );
    assert.equal(listGifts(db).find((g) => g.id === copy)!.target, 7996);
    const unrelated = saveGift(db, {
      ...input,
      url: "https://example.com/other",
    });
    assert.throws(() => saveGift(db, input, unrelated), /existe déjà/);
  } finally {
    db.close();
  }
});

test("import: doublons du lot ou existants, choix explicite et remplacement sans ambiguïté", async () => {
  const db = openDatabase(":memory:");
  try {
    await initializeOwner(db, "Test", "test-only-password-2026");
    db.exec("UPDATE owner SET paypal='FictionalTestOnly'");
    const gift = {
      url: "https://example.com/import",
      title: "Import",
      target: "10",
      quantity: 3,
    };
    const content = JSON.stringify(
      [gift, gift].map((g) => ({ ...g, price: "10", currency: "EUR" })),
    );
    const job = createImport(db, "json", content);
    assert.equal(getImport(db, job).items[1].duplicate_index, 0);
    assert.throws(
      () =>
        commitImport(db, job, [
          { index: 0, gift },
          { index: 1, gift },
        ]),
      /Doublon/,
    );
    assert.equal(listGifts(db).length, 0);
    assert.equal(getImport(db, job).state, "preview");
    const ids = commitImport(db, job, [
      { index: 0, gift },
      { index: 1, gift: { ...gift, allow_duplicate: true } },
    ]);
    assert.equal(new Set(ids).size, 2);
    assert.deepEqual(
      listGifts(db).map((g) => g.target),
      [3000, 3000],
    );
    const intent = createIntent(db, { gift_id: ids[0], amount: "5" });
    declareIntent(db, intent.id);
    db.exec("UPDATE owner SET currency='USD'");
    const again = createImport(db, "json", content);
    assert.throws(
      () => commitImport(db, again, [{ index: 0, gift }]),
      /Doublon/,
    );
    assert.throws(
      () => commitImport(db, again, [{ index: 0, gift, replace: true }]),
      /Plusieurs envies/,
    );
    const [copy] = commitImport(db, again, [
      { index: 0, gift: { ...gift, allow_duplicate: true } },
    ]);
    assert.equal(listGifts(db).find((g) => g.id === copy)!.currency, "USD");
    assert.equal(listGifts(db).find((g) => g.id === copy)!.funded, 0);
    assert.equal(listGifts(db).find((g) => g.id === ids[0])!.funded, 500);
    const unique = { ...gift, url: "https://example.com/unique" };
    const uniqueId = saveGift(db, unique);
    const replacement = createImport(
      db,
      "json",
      JSON.stringify([{ ...unique, price: "10" }]),
    );
    assert.throws(
      () =>
        commitImport(db, replacement, [
          {
            index: 0,
            replace: true,
            gift: { ...unique, allow_duplicate: true },
          },
        ]),
      /pas les deux/,
    );
    assert.deepEqual(
      commitImport(db, replacement, [
        { index: 0, replace: true, gift: { ...unique, quantity: 5 } },
      ]),
      [uniqueId],
    );
    assert.equal(listGifts(db).find((g) => g.id === uniqueId)!.target, 5000);
  } finally {
    db.close();
  }
});
