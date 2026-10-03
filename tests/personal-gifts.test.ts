import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../lib/db";
import { createSession, initializeOwner } from "../lib/auth";
import { saveGift, listGifts } from "../lib/gifts";
import { saveList, rotateShare } from "../lib/lists";
import {
  createReservation,
  reservationStatus,
  reservedQuantity,
} from "../lib/reservations";
import {
  donorReservations,
  saveDonorReservation,
  changeDonorReservation,
  receivedGifts,
  saveReceivedGift,
} from "../lib/personal-gifts";
import {
  acceptInvitation,
  inviteMember,
  saveFamilyProfile,
  assignFamilyProfile,
} from "../lib/family";
import { createTemplateList } from "../lib/list-templates";
import { listTemplates, templateWishes } from "../lib/list-template-data";
import { english } from "../lib/messages";
const password = "test-only-tracking-password";
async function fixture() {
  const db = openDatabase(":memory:");
  await initializeOwner(db, "Owner", password);
  return db;
}
async function member(
  db: ReturnType<typeof openDatabase>,
  login: string,
  lists: string[],
) {
  const invitation = inviteMember(db, {
    login,
    name: login,
    lists,
    confirm: true,
  });
  const token = await acceptInvitation(db, {
    token: invitation.token,
    password,
    confirmation: password,
  });
  return { ...invitation, token };
}
test("donor tracking requires a personal capability, is opt-in and never gives an owner access to another account's gifts", async () => {
  const db = await fixture();
  try {
    const owner = createSession(db),
      alice = await member(db, "alice", []),
      bob = await member(db, "bob", []),
      id = saveGift(db, {
        title: "Known title",
        url: "https://example.org/item",
        target: "20",
      }),
      r = createReservation(db, { gift_id: id, quantity: 1 });
    assert.equal(donorReservations(db, alice.token).total, 0);
    assert.throws(() =>
      saveDonorReservation(db, alice.token, { token: "alice", confirm: true }),
    );
    saveDonorReservation(db, alice.token, { token: r.token, confirm: true });
    saveDonorReservation(db, alice.token, { token: r.token, confirm: true });
    assert.equal(donorReservations(db, alice.token).total, 1);
    assert.equal(donorReservations(db, owner).total, 0);
    assert.throws(
      () =>
        saveDonorReservation(db, bob.token, { token: r.token, confirm: true }),
      /autre compte/,
    );
    const saved = donorReservations(db, alice.token).items[0];
    assert.throws(
      () =>
        changeDonorReservation(db, owner, {
          id: saved.id,
          action: "cancelled",
          confirm: true,
        }),
      /introuvable/,
    );
    db.prepare(
      "UPDATE gifts SET title='New confidential title' WHERE id=?",
    ).run(id);
    assert.equal(
      donorReservations(db, alice.token).items[0].details!.title,
      "Known title",
    );
    assert.doesNotMatch(
      JSON.stringify(donorReservations(db, alice.token)),
      /token|New confidential/,
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM donor_reservations").get()!.n,
      1,
    );
    changeDonorReservation(db, alice.token, {
      id: saved.id,
      action: "forget",
      confirm: true,
    });
    assert.equal(donorReservations(db, alice.token).total, 0);
    assert.equal(reservationStatus(db, r.token).state, "reserved");
  } finally {
    db.close();
  }
});
test("saved reservations can be cancelled after share revocation, including declared purchases, without creating payments", async () => {
  const db = await fixture();
  try {
    const owner = createSession(db),
      list = saveList(db, { name: "Private occasion", visibility: "unlisted" });
    rotateShare(db, list);
    const id = saveGift(db, {
        title: "Gift",
        url: "https://example.org/item",
        target: "20",
        list_id: list,
      }),
      r = createReservation(
        db,
        { gift_id: id, quantity: 1 },
        { owner: false, lists: [list] },
      );
    saveDonorReservation(db, owner, { token: r.token, confirm: true });
    const saved = donorReservations(db, owner).items[0];
    rotateShare(db, list, true);
    db.prepare("UPDATE lists SET visibility='private' WHERE id=?").run(list);
    changeDonorReservation(db, owner, {
      id: saved.id,
      action: "purchased",
      confirm: true,
    });
    assert.equal(reservedQuantity(db, id), 1);
    changeDonorReservation(db, owner, {
      id: saved.id,
      action: "cancelled",
      confirm: true,
    });
    assert.equal(reservedQuantity(db, id), 0);
    assert.throws(
      () =>
        changeDonorReservation(db, owner, {
          id: saved.id,
          action: "purchased",
          confirm: true,
        }),
      /plus active/,
    );
    assert.equal(db.prepare("SELECT COUNT(*) n FROM payments").get()!.n, 0);
  } finally {
    db.close();
  }
});
test("received journals are account-private, independent of commitments and recheck recipient grants", async () => {
  const db = await fixture();
  try {
    const owner = createSession(db),
      list = saveList(db, {
        name: "Occasion",
        visibility: "public",
        surprise_mode: true,
      }),
      alice = await member(db, "alice", [list]),
      bob = await member(db, "bob", [list]);
    const profile = saveFamilyProfile(db, {
      name: "Alice",
      kind: "adult",
      recipient: alice.id,
    });
    assignFamilyProfile(db, {
      list_id: list,
      profile_id: profile,
      confirm: true,
    });
    const gift = saveGift(db, {
      title: "Book",
      url: "https://example.org/book",
      target: "12",
      list_id: list,
    });
    saveReceivedGift(db, alice.token, {
      gift_id: gift,
      received: true,
      received_on: "2026-10-03",
      note: "Private memory",
      thanks: "Personal message",
      thanked: true,
    });
    assert.equal(
      receivedGifts(db, alice.token).items[0].note,
      "Private memory",
    );
    assert.equal(
      receivedGifts(db, owner).items.find((g) => g.id === gift)!.note,
      "",
    );
    assert.equal(receivedGifts(db, bob.token).total, 0);
    assert.throws(
      () => saveReceivedGift(db, bob.token, { gift_id: gift, received: true }),
      /introuvable/,
    );
    assert.equal(listGifts(db, true)[0].purchased, null);
    assert.equal(
      db.prepare("SELECT purchased FROM gifts WHERE id=?").get(gift)!.purchased,
      0,
    );
    assert.doesNotMatch(
      JSON.stringify(listGifts(db)),
      /Private memory|Personal message/,
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM notification_jobs").get()!.n,
      0,
    );
    db.prepare("DELETE FROM member_lists WHERE member_id=?").run(alice.id);
    assert.equal(receivedGifts(db, alice.token).total, 0);
    assert.throws(
      () =>
        saveReceivedGift(db, alice.token, { gift_id: gift, received: false }),
      /introuvable/,
    );
  } finally {
    db.close();
  }
});
test("occasion templates are private drafts with editable examples, no existing commitments and complete translations", async () => {
  const db = await fixture();
  try {
    for (const [key, template] of Object.entries(listTemplates)) {
      assert.ok(english[template.name]);
      const { id } = createTemplateList(db, {
        template: key,
        name: template.name,
        locale: "en",
        confirm: true,
      });
      assert.equal(
        db.prepare("SELECT visibility FROM lists WHERE id=?").get(id)!
          .visibility,
        "private",
      );
      const gifts = db
        .prepare(
          "SELECT title,visibility,budget_mode FROM gifts WHERE list_id=?",
        )
        .all(id);
      assert.equal(gifts.length, 3);
      assert.ok(gifts.every((g) => g.visibility === "visible"));
      assert.ok(gifts.some((g) => g.budget_mode !== "fixed"));
    }
    assert.equal(listGifts(db).length, 0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM reservations").get()!.n, 0);
    for (const v of Object.values(templateWishes)) {
      assert.ok(english[v.title]);
      assert.ok(english[v.description]);
    }
    const count = db.prepare("SELECT COUNT(*) n FROM lists").get()!.n;
    assert.throws(() =>
      createTemplateList(db, {
        template: "birthday",
        name: "Invalid",
        locale: "en",
        confirm: false,
      }),
    );
    assert.equal(db.prepare("SELECT COUNT(*) n FROM lists").get()!.n, count);
  } finally {
    db.close();
  }
});
