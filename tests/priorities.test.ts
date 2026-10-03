import test from "node:test";
import assert from "node:assert/strict";
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
import { initializeOwner } from "../lib/auth";
import { listGifts, saveGift } from "../lib/gifts";
import { listPriorities, savePriorities } from "../lib/priorities";
import { priorityLabel } from "../lib/priority-labels";
import { createI18n } from "../lib/i18n";
import { filterWishlist } from "../lib/wishlist-filters";
import { backupInstance, restoreInstance } from "../lib/backup";

const input = {
  title: "Envie",
  url: "https://example.com/priority",
  target: "50",
};
test("migration keeps all existing gift fields, contribution references", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys=ON");
    for (const name of readdirSync("migrations")
      .filter((n) => n.endsWith(".sql") && n < "013")
      .sort())
      db.exec(readFileSync(`migrations/${name}`, "utf8"));
    db.exec(
      "INSERT INTO gifts(id,url,title,target,currency,priority,purchased,created_at,updated_at) VALUES ('old','https://example.com/old','Ancienne envie',5000,'EUR',2,1,'before','before')",
    );
    db.exec(
      "INSERT INTO contributions(id,gift_id,amount,currency,state,created_at,expires_at) VALUES ('contribution','old',1000,'EUR','declared','before','after')",
    );
    const before = db.prepare("SELECT * FROM gifts").get()!;
    db.exec(readFileSync("migrations/013-gift-priorities.sql", "utf8"));
    const { priority_id, ...after } = db.prepare("SELECT * FROM gifts").get()!;
    assert.equal(priority_id, 2);
    assert.deepEqual(after, { ...before });
    assert.equal(
      db.prepare("SELECT gift_id FROM contributions").get()!.gift_id,
      "old",
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    assert.deepEqual(
      listPriorities(db).map((p) => p.id),
      [2, 1, 0],
    );
  } finally {
    db.close();
  }
});

test("renamed and added priorities sort by configuration, reject stale edits and survive backup", async () => {
  mkdirSync(".local", { recursive: true });
  const folder = mkdtempSync(".local/priority-test-");
  const db = openDatabase(join(folder, "wishlist.sqlite"));
  try {
    await initializeOwner(db, "Test", "test-only-password-2026");
    const previous = listPriorities(db);
    const original = saveGift(db, { ...input, priority: 2 });
    const value = {
      previous,
      featured: 1,
      priorities: [
        { id: 0, name: "À découvrir" },
        { name: "Pour bientôt" },
        { id: 2, name: "Mes favoris" },
        { id: 1, name: null },
      ],
    };
    const priorities = savePriorities(db, value);
    const added = priorities.find((p) => p.name === "Pour bientôt")!;
    assert.ok(added.id > 2);
    assert.equal(added.featured, 1);
    const custom = saveGift(db, {
      ...input,
      url: input.url + "/custom",
      priority: added.id,
    });
    const base = saveGift(db, {
      ...input,
      url: input.url + "/base",
      priority: 0,
    });
    const gifts = listGifts(db);
    assert.deepEqual(
      gifts.map((g) => g.id),
      [base, custom, original],
    );
    assert.deepEqual(
      filterWishlist([...gifts].reverse(), {
        search: "",
        currency: "",
        basis: "unit",
        minimum: null,
        maximum: null,
        availableOnly: false,
        sort: "priority",
        locale: "fr",
        priorityOrder: Object.fromEntries(
          priorities.map((p) => [p.id, p.position]),
        ),
      }).map((g) => g.id),
      [base, custom, original],
    );
    assert.equal(priorityLabel(added, createI18n("en").t), "Pour bientôt");
    assert.equal(
      priorityLabel(
        priorities.find((p) => p.id === 1)!,
        createI18n("en").t,
      ),
      "Would really love this",
    );
    assert.throws(() => savePriorities(db, value), /priorités ont changé/);
    for (const priority of [999, -1, 1.5, "3"])
      assert.throws(() => saveGift(db, { ...input, priority }, original));
    assert.throws(
      () =>
        savePriorities(db, {
          previous: priorities,
          priorities: [...priorities, { name: "pour BIENTÔT" }],
          featured: 1,
        }),
      /nom différent/,
    );
    assert.throws(() =>
      savePriorities(db, {
        previous: priorities,
        priorities: [...priorities, { name: " " }],
        featured: 1,
      }),
    );
    assert.throws(
      () =>
        savePriorities(db, {
          previous: priorities,
          priorities: [...priorities, { name: null }],
          featured: 1,
        }),
      /Donnez un nom/,
    );
    assert.deepEqual(listPriorities(db), priorities);
    backupInstance(db, folder, join(folder, "backup"));
    restoreInstance(join(folder, "backup"), join(folder, "restored"));
    const restored = openDatabase(join(folder, "restored", "wishlist.sqlite"));
    try {
      assert.deepEqual(listPriorities(restored), priorities);
      assert.deepEqual(listGifts(restored), gifts);
    } finally {
      restored.close();
    }
  } finally {
    db.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
