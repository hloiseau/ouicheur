import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { openDatabase } from "../lib/db";
import { initializeOwner } from "../lib/auth";
import { listGifts, saveGift } from "../lib/gifts";

test("la migration désactive la recherche au Japon pour les envies existantes", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync("migrations/001-initial.sql", "utf8"));
    db.prepare(
      "INSERT INTO gifts(id,url,title,target,currency,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
    ).run(
      "old",
      "https://example.com/old",
      "Ancienne envie",
      8900,
      "EUR",
      "2026-09-24",
      "2026-09-24",
    );
    db.exec(readFileSync("migrations/004-gift-japan-search.sql", "utf8"));
    const gift = db.prepare("SELECT * FROM gifts WHERE id='old'").get()!;
    assert.equal(gift.japan_search, 0);
    assert.equal(gift.title, "Ancienne envie");
    assert.equal(gift.target, 8900);
    assert.throws(() => db.exec("UPDATE gifts SET japan_search=2"));
  } finally {
    db.close();
  }
});

test("les anciennes options Japon restent compatibles sans être exposées", async () => {
  const db = openDatabase(":memory:");
  try {
    await initializeOwner(db, "Test", "test-only-password-2026");
    const input = {
      title: "Appareil photo",
      url: "https://example.com/camera",
      target: "89",
    };
    const id = saveGift(db, { ...input, japan_search: true });
    assert.equal(
      db.prepare("SELECT japan_search FROM gifts WHERE id=?").get(id)!
        .japan_search,
      0,
    );
    db.prepare("UPDATE gifts SET japan_search=1 WHERE id=?").run(id);
    assert.ok(!("japan_search" in listGifts(db)[0]));
    saveGift(db, input, id);
    assert.equal(
      db.prepare("SELECT japan_search FROM gifts WHERE id=?").get(id)!
        .japan_search,
      1,
    );
    assert.equal(listGifts(db)[0].title, input.title);
  } finally {
    db.close();
  }
});
