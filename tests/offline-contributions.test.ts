import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openDatabase } from "../lib/db";
import { initializeOwner } from "../lib/auth";
import { listGifts, publicProfile, saveGift } from "../lib/gifts";
import { saveList } from "../lib/lists";
import { cleanup, cleanupPreview } from "../lib/storage";
import { createReservation, updateReservation } from "../lib/reservations";
import {
  createIntent,
  contributionStatus,
  declareIntent,
  expireIntents,
  reviewContribution,
  cancelPledge,
} from "../lib/payments";

async function fixture() {
  const db = openDatabase(":memory:");
  await initializeOwner(db, "Test owner", "offline-test-password");
  const gift = saveGift(db, {
    title: "Test gift",
    url: "https://example.com/offline",
    target: "100",
    visibility: "visible",
  });
  return { db, gift, totals: () => listGifts(db).find((g) => g.id === gift)! };
}

test("virement sans PayPal : centimes, déclaration, validation et refus sans double comptage", async () => {
  const { db, gift, totals } = await fixture();
  try {
    assert.equal(publicProfile(db)?.payments_enabled, 1);
    assert.equal(publicProfile(db)?.paypal_enabled, 0);
    assert.throws(
      () => createIntent(db, { gift_id: gift, amount: "12.50" }),
      /PayPal/,
    );
    const c = createIntent(db, {
      gift_id: gift,
      amount: "12,50",
      method: "bank_transfer",
      approved: 1,
    });
    assert.equal(c.paypal_url, null);
    const status = contributionStatus(db, c.id);
    assert.equal(status.method, "bank_transfer");
    assert.equal(status.state, "declared");
    assert.equal(status.approved, 0);
    assert.equal(status.payment, null);
    assert.equal(status.paypal_url, null);
    assert.equal(totals().funded, 1250);
    assert.equal(totals().confirmed, 0);
    declareIntent(db, c.id);
    reviewContribution(db, { id: c.id, approved: true });
    reviewContribution(db, { id: c.id, approved: true });
    assert.equal(totals().funded, 1250);
    reviewContribution(db, { id: c.id, approved: false });
    assert.equal(totals().funded, 0);
    assert.equal(totals().declared, 0);
  } finally {
    db.close();
  }
});

test("promesse persistante, séparée du financement, puis versée et confirmée une seule fois", async () => {
  const { db, gift, totals } = await fixture();
  try {
    const c = createIntent(db, {
      gift_id: gift,
      amount: "25",
      method: "pledge",
      nickname: "Private donor",
      message: "Private message",
    });
    db.prepare(
      "UPDATE contributions SET expires_at='2000-01-01' WHERE id=?",
    ).run(c.id);
    expireIntents(db);
    assert.equal(contributionStatus(db, c.id).state, "intent");
    assert.equal(contributionStatus(db, c.id).paypal_url, null);
    assert.equal(totals().promised, 2500);
    assert.equal(totals().funded, 0);
    assert.doesNotMatch(
      JSON.stringify(totals()),
      /Private donor|Private message/,
    );
    // Pledges do not consume the funding budget, but direct purchase must not clash.
    const full = createIntent(db, {
      gift_id: gift,
      amount: "100",
      method: "pledge",
    });
    assert.throws(
      () => createReservation(db, { gift_id: gift, quantity: 1 }),
      /contributions existent/,
    );
    cancelPledge(db, full.id);
    declareIntent(db, c.id);
    declareIntent(db, c.id);
    assert.equal(totals().promised, 0);
    assert.equal(totals().funded, 2500);
    reviewContribution(db, { id: c.id, approved: true });
    assert.equal(totals().funded, 2500);
    assert.throws(() => cancelPledge(db, c.id), /non versée/);
  } finally {
    db.close();
  }
});

test("mode strict : virements et promesses attendent la confirmation du propriétaire", async () => {
  const { db, gift, totals } = await fixture();
  try {
    db.exec("UPDATE owner SET strict_contributions=1");
    const transfer = createIntent(db, {
      gift_id: gift,
      amount: "10",
      method: "bank_transfer",
    });
    const pledge = createIntent(db, {
      gift_id: gift,
      amount: "20",
      method: "pledge",
    });
    assert.equal(totals().funded, 0);
    assert.equal(totals().declared, 1000);
    assert.equal(totals().promised, 2000);
    declareIntent(db, pledge.id);
    assert.equal(totals().funded, 0);
    assert.equal(totals().promised, 0);
    assert.equal(totals().declared, 3000);
    reviewContribution(db, { id: transfer.id, approved: true });
    reviewContribution(db, { id: pledge.id, approved: true });
    assert.equal(totals().funded, 3000);
    assert.equal(totals().declared, 0);
    const received = createIntent(db, {
      gift_id: gift,
      amount: "5",
      method: "pledge",
    });
    reviewContribution(db, { id: received.id, approved: true });
    assert.equal(totals().promised, 0);
    assert.equal(totals().funded, 3500);
  } finally {
    db.close();
  }
});

test("annulation idempotente d’une promesse : pas de versement ni de résurrection", async () => {
  const { db, gift, totals } = await fixture();
  try {
    const c = createIntent(db, {
      gift_id: gift,
      amount: "25",
      method: "pledge",
    });
    cancelPledge(db, c.id);
    cancelPledge(db, c.id);
    assert.equal(contributionStatus(db, c.id).state, "expired");
    assert.equal(totals().promised, 0);
    assert.equal(totals().funded, 0);
    assert.throws(() => declareIntent(db, c.id), /annulée/);
    const transfer = createIntent(db, {
      gift_id: gift,
      amount: "10",
      method: "bank_transfer",
    });
    assert.throws(() => cancelPledge(db, transfer.id), /non versée/);
    assert.throws(() => cancelPledge(db, "a".repeat(64)), /introuvable/);
  } finally {
    db.close();
  }
});

test("le nettoyage ne supprime pas les promesses encore actives", async () => {
  const { db, gift } = await fixture();
  const folder = mkdtempSync(join(tmpdir(), "ouicheur-pledge-cleanup-"));
  try {
    const pledge = createIntent(db, {
      gift_id: gift,
      amount: "25",
      method: "pledge",
    });
    db.prepare(
      "UPDATE contributions SET expires_at='2000-01-01' WHERE id=?",
    ).run(pledge.id);
    assert.equal(cleanupPreview(db, folder).intents, 0);
    cleanup(db, folder);
    assert.equal(contributionStatus(db, pledge.id).state, "intent");
    cancelPledge(db, pledge.id);
    assert.equal(cleanupPreview(db, folder).intents, 0);
  } finally {
    db.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test("les deux alternatives conservent les limites de montant, devise, accès et réservation", async () => {
  const { db, gift } = await fixture();
  try {
    const privateList = saveList(db, {
      name: "Private list",
      visibility: "private",
    });
    const hidden = saveGift(db, {
      title: "Hidden",
      url: "https://example.com/hidden",
      target: "100",
      list_id: privateList,
    });
    const { token } = createReservation(db, { gift_id: gift, quantity: 1 });
    for (const method of ["pledge", "bank_transfer"]) {
      assert.throws(
        () => createIntent(db, { gift_id: gift, amount: "1", method }),
        /réservée/,
      );
      assert.throws(
        () => createIntent(db, { gift_id: hidden, amount: "1", method }),
        /introuvable/,
      );
    }
    updateReservation(db, token, { state: "cancelled" });
    for (const method of ["pledge", "bank_transfer"]) {
      for (const amount of ["0", "-1", "1.001", "1e2", "100.01"]) {
        assert.throws(() =>
          createIntent(db, { gift_id: gift, amount, method }),
        );
      }
      db.exec("UPDATE owner SET currency='USD'");
      assert.throws(
        () => createIntent(db, { gift_id: gift, amount: "1", method }),
        /ancienne devise/,
      );
      db.exec("UPDATE owner SET currency='EUR'");
      db.prepare("UPDATE gifts SET closed=1 WHERE id=?").run(gift);
      assert.throws(
        () => createIntent(db, { gift_id: gift, amount: "1", method }),
        /terminé/,
      );
      db.prepare("UPDATE gifts SET closed=0 WHERE id=?").run(gift);
    }
    createIntent(db, { gift_id: gift, amount: "90", method: "bank_transfer" });
    for (const method of ["pledge", "bank_transfer"])
      assert.throws(
        () => createIntent(db, { gift_id: gift, amount: "10.01", method }),
        /montant restant/,
      );
    assert.throws(() =>
      createIntent(db, { gift_id: gift, amount: "1", method: "unexpected" }),
    );
  } finally {
    db.close();
  }
});

test("migration 1.2 : liens PayPal et montants historiques sont préservés", () => {
  const folder = mkdtempSync(join(tmpdir(), "ouicheur-offline-upgrade-"));
  const path = join(folder, "wishlist.sqlite");
  let db = new DatabaseSync(path);
  try {
    db.exec("CREATE TABLE migrations(name TEXT PRIMARY KEY) STRICT");
    for (const name of readdirSync("migrations")
      .filter((n) => n.endsWith(".sql") && n < "024")
      .sort()) {
      db.exec(readFileSync(join("migrations", name), "utf8"));
      db.prepare("INSERT INTO migrations VALUES (?)").run(name);
    }
    db.exec(
      "INSERT INTO owner(id,password_hash,name) VALUES (1,'test-hash','Test owner')",
    );
    db.exec(
      "INSERT INTO gifts(id,url,title,target,currency,visibility,created_at,updated_at) VALUES ('old','https://example.com/old','Old gift',10000,'EUR','visible','2026-01-01','2026-01-01')",
    );
    const id = "a".repeat(64);
    db.prepare(
      "INSERT INTO contributions(id,gift_id,amount,currency,state,created_at,expires_at,paypal_recipient) VALUES (?,'old',2500,'EUR','intent','2026-01-01','2099-01-01','OriginalRecipient')",
    ).run(id);
    db.close();
    db = openDatabase(path);
    assert.equal(contributionStatus(db, id).method, "paypal");
    assert.equal(
      contributionStatus(db, id).paypal_url,
      "https://paypal.me/OriginalRecipient/25.00EUR",
    );
    declareIntent(db, id);
    assert.equal(listGifts(db)[0].funded, 2500);
    assert.equal(listGifts(db)[0].promised, 0);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
