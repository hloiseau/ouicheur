import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { openDatabase } from "../lib/db";
import { initializeOwner } from "../lib/auth";
import { saveGift, listGifts } from "../lib/gifts";
import { saveList, rotateShare, publicAccess } from "../lib/lists";
import { createReservation } from "../lib/reservations";
import { bulkGifts, duplicateList, reorderGift } from "../lib/organization";
import { exportedList, listCsv } from "../lib/list-export";
import {
  createImport,
  getImport,
  commitImport,
  parseGeneric,
} from "../lib/imports";
import {
  readPreferences,
  savePreferences,
  sharedPreferences,
} from "../lib/preferences";
import { inviteMember, acceptInvitation, memberAccess } from "../lib/family";
const owner = { owner: true, lists: [], recipientLists: ["default"] };
async function fixture() {
  const db = openDatabase(":memory:");
  await initializeOwner(db, "Owner", "list-tools-only-password");
  return db;
}
const gift = {
  title: "A wish",
  url: "https://example.org/product",
  target: "20",
  quantity: 2,
};
test("bulk changes are atomic, scoped to the selected list, explicit and preserve reservations", async () => {
  const db = await fixture();
  try {
    const a = saveGift(db, gift),
      b = saveGift(db, { ...gift, url: "https://example.org/other" });
    const other = saveList(db, { name: "Private", visibility: "private" });
    createReservation(db, { gift_id: a, quantity: 1 });
    assert.throws(
      () =>
        bulkGifts(
          db,
          {
            list_id: "default",
            ids: [a, randomUUID()],
            action: "archive",
            confirm: true,
          },
          owner,
        ),
      /sélection a changé/,
    );
    assert.equal(listGifts(db).find((g) => g.id === a)!.visibility, "visible");
    assert.throws(
      () =>
        bulkGifts(
          db,
          { list_id: "default", ids: [a], action: "archive", confirm: true },
          publicAccess,
        ),
      /Connexion/,
    );
    bulkGifts(
      db,
      {
        list_id: "default",
        ids: [a, b],
        action: "list",
        value: other,
        confirm: true,
      },
      owner,
    );
    assert.equal(listGifts(db).length, 0);
    assert.equal(listGifts(db, true).find((g) => g.id === a)!.reserved, 1);
    assert.throws(
      () =>
        bulkGifts(
          db,
          { list_id: "default", ids: [a], action: "restore", confirm: true },
          owner,
        ),
      /sélection/,
    );
    bulkGifts(
      db,
      { list_id: other, ids: [a, b], action: "archive", confirm: true },
      owner,
    );
    assert.ok(listGifts(db, true).every((g) => g.visibility === "archived"));
  } finally {
    db.close();
  }
});
test("manual order is stable and a duplicated occasion starts private without past commitments", async () => {
  const db = await fixture();
  try {
    const a = saveGift(db, gift),
      b = saveGift(db, {
        ...gift,
        url: "https://example.org/other",
        purchased: true,
      });
    createReservation(db, { gift_id: a, quantity: 1 });
    reorderGift(db, { id: b, direction: "up" }, owner);
    const ordered = () =>
      listGifts(db, true)
        .sort((a, b) => a.position! - b.position!)
        .map((g) => g.id);
    assert.deepEqual(ordered(), [b, a]);
    const copy = duplicateList(
      db,
      {
        id: "default",
        name: "Next year",
        event_date: "2027-12-25",
        confirm: true,
      },
      owner,
    );
    const rows = listGifts(db, true).filter((g) => g.list_id === copy.id);
    assert.equal(copy.count, 2);
    assert.ok(
      rows.every(
        (g) =>
          ![a, b].includes(g.id) &&
          g.reserved === 0 &&
          g.purchased === 0 &&
          g.funded === 0 &&
          g.target === 4000 &&
          g.quantity === 2,
      ),
    );
    assert.equal(
      db.prepare("SELECT visibility FROM lists WHERE id=?").get(copy.id)!
        .visibility,
      "private",
    );
    assert.equal(db.prepare("SELECT COUNT(*) n FROM reservations").get()!.n, 1);
    assert.equal(
      db
        .prepare("SELECT COUNT(*) n FROM member_lists WHERE list_id=?")
        .get(copy.id)!.n,
      0,
    );
  } finally {
    db.close();
  }
});
test("selective CSV and JSON are portable, formula-safe and never expose donor or reservation data", async () => {
  const db = await fixture();
  try {
    const id = saveGift(db, {
      ...gift,
      title: '=HYPERLINK("https://example.org")',
      size: "M",
      model: "2026",
      offers: [
        {
          url: "https://example.org/used",
          condition: "used",
          price: 1400,
          currency: "EUR",
        },
      ],
    });
    createReservation(db, { gift_id: id, quantity: 1 });
    const exported = exportedList(db, "default", publicAccess),
      csv = listCsv(exported);
    for (const key of [
      "reservations",
      "funded",
      "nickname",
      "token_hash",
      "purchased",
      "closed",
    ])
      assert.equal(Object.hasOwn(exported.gifts[0], key), false);
    assert.match(csv, /'=HYPERLINK/);
    for (const [format, content] of [
      ["csv", csv],
      ["json", JSON.stringify(exported)],
    ] as const) {
      const parsed = parseGeneric(content, format);
      assert.equal(parsed[0].title, '=HYPERLINK("https://example.org")');
      assert.equal(parsed[0].price, "20.00");
      assert.equal(parsed[0].quantity, 2);
      assert.equal(parsed[0].offers![0].price, 1400);
      const job = createImport(db, format, content);
      const i = getImport(db, job).items[0];
      const [copy] = commitImport(db, job, [
        { index: 0, gift: { ...i, target: i.price, allow_duplicate: true } },
      ]);
      const g = listGifts(db, true).find((g) => g.id === copy)!;
      assert.equal(g.quantity, 2);
      assert.equal(g.target, 4000);
      assert.equal(g.reserved, 0);
    }
    const privateId = saveList(db, { name: "Private", visibility: "unlisted" });
    const share = rotateShare(db, privateId)!;
    assert.throws(
      () => exportedList(db, privateId, publicAccess),
      /introuvable/,
    );
    // Old cookies are resolved against the current share hash in the route.
    assert.equal(
      exportedList(db, privateId, { owner: false, lists: [privateId] }).gifts
        .length,
      0,
    );
    rotateShare(db, privateId, true);
    assert.equal(
      db.prepare("SELECT share_hash FROM lists WHERE id=?").get(privateId)!
        .share_hash,
      null,
    );
    assert.ok(share);
  } finally {
    db.close();
  }
});
test("preferences disclose only explicitly shared fields; organizer notes stay in their author's account", async () => {
  const db = await fixture();
  try {
    savePreferences(
      db,
      {
        list_id: "default",
        fields: [
          { field: "interests", value: "Gardening", visibility: "shared" },
          { field: "sizes", value: "PRIVATE_SIZE", visibility: "private" },
        ],
      },
      owner,
    );
    assert.deepEqual(
      sharedPreferences(db, "default", publicAccess).map((p) => p.value),
      ["Gardening"],
    );
    assert.throws(
      () => readPreferences(db, "default", publicAccess),
      /introuvable/,
    );
    const invite = inviteMember(db, {
      name: "Alex",
      login: "alex",
      lists: ["default"],
      confirm: true,
    });
    const token = await acceptInvitation(db, {
      token: invite.token,
      password: "preferences-only-password",
      confirmation: "preferences-only-password",
    });
    const member = memberAccess(db, token);
    assert.equal(
      JSON.stringify(readPreferences(db, "default", member)).includes(
        "PRIVATE_SIZE",
      ),
      false,
    );
    assert.throws(
      () => savePreferences(db, { list_id: "default", fields: [] }, member),
      /Seul le destinataire/,
    );
    savePreferences(db, { list_id: "default", note: "PRIVATE_PLAN" }, member);
    assert.equal(readPreferences(db, "default", member).note, "PRIVATE_PLAN");
    assert.equal(readPreferences(db, "default", owner).note, "");
    assert.equal(
      JSON.stringify(exportedList(db, "default", publicAccess)).includes(
        "PRIVATE_PLAN",
      ),
      false,
    );
    savePreferences(db, { list_id: "default", fields: [] }, owner);
    assert.deepEqual(sharedPreferences(db, "default", publicAccess), []);
  } finally {
    db.close();
  }
});
