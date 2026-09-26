import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { openDatabase } from "../lib/db";
import { initializeOwner } from "../lib/auth";
import { listGifts, saveGift } from "../lib/gifts";
import { createImport, commitImport } from "../lib/imports";

test("les anciennes envies sont publiées, les archives conservées et les nouvelles envies directement visibles", async () => {
  const legacy = new DatabaseSync(":memory:");
  try {
    legacy.exec(readFileSync("migrations/001-initial.sql", "utf8"));
    const insert = legacy.prepare(
      "INSERT INTO gifts(id,url,title,target,currency,visibility,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
    );
    insert.run(
      "old",
      "https://example.com/old",
      "Ancienne envie",
      2990,
      "EUR",
      "draft",
      "before",
      "before",
    );
    insert.run(
      "archive",
      "https://example.com/archive",
      "Archive",
      5000,
      "EUR",
      "archived",
      "before",
      "before",
    );
    const before = legacy.prepare("SELECT * FROM gifts WHERE id='old'").get()!;
    legacy.exec(readFileSync("migrations/006-publish-wishes.sql", "utf8"));
    const after = legacy.prepare("SELECT * FROM gifts WHERE id='old'").get()!;
    assert.equal(after.visibility, "visible");
    assert.deepEqual(
      {
        ...after,
        visibility: before.visibility,
        updated_at: before.updated_at,
      },
      { ...before },
    );
    assert.equal(
      legacy.prepare("SELECT visibility FROM gifts WHERE id='archive'").get()!
        .visibility,
      "archived",
    );
    insert.run(
      "legacy-client",
      "https://example.com/client",
      "Ancien client",
      1000,
      "EUR",
      "draft",
      "now",
      "now",
    );
    assert.equal(
      legacy
        .prepare("SELECT visibility FROM gifts WHERE id='legacy-client'")
        .get()!.visibility,
      "visible",
    );
    legacy.exec("UPDATE gifts SET visibility='draft' WHERE id='old'");
    assert.equal(
      legacy.prepare("SELECT visibility FROM gifts WHERE id='old'").get()!
        .visibility,
      "visible",
    );
  } finally {
    legacy.close();
  }
  const db = openDatabase(":memory:");
  try {
    await initializeOwner(db, "Test", "test-only-password-2026");
    const gift = {
      title: "Envie",
      url: "https://example.com/new",
      target: "29.90",
    };
    const id = saveGift(db, gift);
    assert.equal(listGifts(db).find((g) => g.id === id)!.visibility, "visible");
    const job = createImport(
      db,
      "json",
      JSON.stringify([
        {
          ...gift,
          url: "https://example.com/import",
          price: "29.90",
          currency: "EUR",
        },
      ]),
    );
    const [imported] = commitImport(db, job, [
      { index: 0, gift: { ...gift, url: "https://example.com/import" } },
    ]);
    assert.equal(
      listGifts(db).find((g) => g.id === imported)!.visibility,
      "visible",
    );
    saveGift(db, { ...gift, visibility: "archived" }, id);
    assert.ok(!listGifts(db).some((g) => g.id === id));
  } finally {
    db.close();
  }
});
