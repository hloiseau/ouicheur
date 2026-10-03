import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { openDatabase, atomic } from "../lib/db";
import { initializeOwner } from "../lib/auth";
import { saveList, publicAccess } from "../lib/lists";
import { queryWishlist } from "../lib/wishlist-query";
import { boundedWork } from "../lib/bounded-work";

async function fixture(count = 55) {
  const db = openDatabase(":memory:");
  await initializeOwner(db, "Performance", "test-only-performance-password");
  const privateId = saveList(db, {
    name: "PRIVATE_LIST",
    visibility: "private",
  });
  db.prepare("INSERT INTO categories(id,name) VALUES (?,?)").run(
    "books",
    "Books",
  );
  db.prepare("INSERT INTO categories(id,name) VALUES (?,?)").run(
    "hidden",
    "PRIVATE_CATEGORY",
  );
  const add = db.prepare(
    "INSERT INTO gifts(id,title,url,target,currency,list_id,category_id,visibility,created_at,updated_at) VALUES (?,?,?,1000,'EUR',?,?,'visible','2026-01-01','2026-01-01')",
  );
  atomic(db, () => {
    for (let i = 0; i < count; i++)
      add.run(
        randomUUID(),
        `Édition ${i}`,
        `https://example.org/book/${i}`,
        "default",
        "books",
      );
    add.run(
      randomUUID(),
      "PRIVATE_GIFT",
      "https://example.org/private",
      privateId,
      "hidden",
    );
  });
  return { db, privateId };
}
test("pagination filters and counters cover the whole authorized list without exposing private categories or cursors", async () => {
  const { db, privateId } = await fixture();
  try {
    const input = { sort: "title", locale: "fr" };
    const first = queryWishlist(db, input, publicAccess);
    assert.equal(first.items.length, 24);
    assert.equal(first.total, 55);
    assert.equal(first.counts.all, 55);
    assert.equal(first.categories[0].count, 55);
    assert.doesNotMatch(JSON.stringify(first), /PRIVATE_/);
    const all = [...first.items];
    let next = first.next;
    while (next) {
      const page = queryWishlist(db, { ...input, cursor: next }, publicAccess);
      all.push(...page.items);
      next = page.next;
    }
    assert.equal(all.length, 55);
    assert.equal(new Set(all.map((g) => g.id)).size, 55);
    assert.equal(all[54].title, "Édition 54");
    assert.equal(
      queryWishlist(db, { search: "edition 54" }, publicAccess).items[0].title,
      "Édition 54",
    );
    assert.throws(
      () => queryWishlist(db, { list: privateId }, publicAccess),
      /introuvable/,
    );
    assert.throws(
      () => queryWishlist(db, { mode: "owner" }, publicAccess),
      /Connexion/,
    );
    assert.throws(
      () => queryWishlist(db, { mode: "team" }, publicAccess),
      /Connexion/,
    );
    assert.throws(
      () =>
        queryWishlist(db, { ...input, cursor: first.next + "x" }, publicAccess),
      /Actualisez/,
    );
    db.prepare("UPDATE gifts SET title='PRIVATE_CHANGED' WHERE list_id=?").run(
      privateId,
    );
    assert.equal(queryWishlist(db, input, publicAccess).version, first.version);
    assert.equal(
      queryWishlist(db, { ...input, cursor: first.next }, publicAccess).items
        .length,
      24,
    );
    db.prepare("UPDATE gifts SET title='Changed' WHERE id=?").run(
      first.items[0].id,
    );
    assert.throws(
      () => queryWishlist(db, { ...input, cursor: first.next }, publicAccess),
      /Actualisez/,
    );
    const member = {
      owner: false,
      lists: [],
      memberId: "fixture",
      managedLists: [privateId],
    };
    assert.equal(queryWishlist(db, { mode: "team" }, member).total, 1);
    assert.equal(
      queryWishlist(db, { mode: "team" }, { ...member, managedLists: [] })
        .total,
      0,
    );
  } finally {
    db.close();
  }
});
test("10,000 wishes send one bounded page while retaining exact server-side search and counts", async (t) => {
  const { db } = await fixture(10000);
  try {
    const start = performance.now();
    const result = queryWishlist(
      db,
      { sort: "title", locale: "fr" },
      publicAccess,
    );
    const elapsed = Math.round(performance.now() - start);
    const bytes = Buffer.byteLength(JSON.stringify(result));
    t.diagnostic(
      JSON.stringify({
        wishes: 10000,
        first_page_ms: elapsed,
        response_bytes: bytes,
      }),
    );
    assert.equal(result.total, 10000);
    assert.equal(result.items.length, 24);
    assert.ok(bytes < 100000, `Unexpected response size: ${bytes}`);
    assert.ok(
      elapsed < 10000,
      `Query exceeded generous CI guard: ${elapsed}ms`,
    );
    const match = queryWishlist(db, { search: "edition 9999" }, publicAccess);
    assert.equal(match.total, 1);
    assert.equal(match.items[0].title, "Édition 9999");
  } finally {
    db.close();
  }
});
test("bounded work limits concurrency, rejects overflow and releases failed or expired queue entries", async () => {
  const run = boundedWork(1, 1, 20);
  let release!: () => void;
  const held = run(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const timedOut = assert.rejects(
    run(async () => 1),
    /occupé/,
  );
  await assert.rejects(
    run(async () => 2),
    /occupé/,
  );
  await timedOut;
  release();
  await held;
  await assert.rejects(
    run(async () => {
      throw Error("failure");
    }),
    /failure/,
  );
  assert.equal(await run(async () => 3), 3);
});
