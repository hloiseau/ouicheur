import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { openDatabase } from "../lib/db";
import { initializeOwner } from "../lib/auth";
import { listGifts, saveGift } from "../lib/gifts";
import {
  confirmManual,
  correctPayment,
  createIntent,
  declareIntent,
  expireIntents,
  contributionStatus,
} from "../lib/payments";
import { money, paypalLink } from "../lib/validation";

async function fixture(path = ":memory:") {
  const db = openDatabase(path);
  await initializeOwner(db, "Camille Test", "test-only-password-2026");
  db.prepare("UPDATE owner SET paypal='FictionalTestOnly'").run();
  const a = saveGift(db, {
    title: "Cadeau A",
    url: "https://example.com/a",
    target: "100.00",
    visibility: "visible",
  });
  const b = saveGift(db, {
    title: "Cadeau B",
    url: "https://example.com/b",
    target: "100.00",
    visibility: "visible",
  });
  return { db, a, b };
}
const confirm = (id: string, ref = "TEST-TRANSACTION-1") => ({
  contribution_id: id,
  transaction_ref: ref,
  gross: "25.00",
  fee: "1.00",
  currency: "EUR",
  reason: "Vérifié dans les données fictives",
  event_id: randomUUID(),
  recipient_checked: true,
  association_checked: true,
  received_checked: true,
});
test("les centimes et le lien PayPal.Me sont exacts, sans référence inventée", () => {
  assert.equal(money("0,29"), 29);
  assert.equal(money("1000000.00"), 100000000);
  for (const amount of ["1e3", "-1", "0", "1.001", "NaN", "1000001.00"])
    assert.throws(() => money(amount));
  assert.equal(
    paypalLink("FictionalTestOnly", 29, "EUR"),
    "https://paypal.me/FictionalTestOnly/0.29EUR",
  );
});
test("deux intentions de même montant ne sont jamais rapprochées arbitrairement", async () => {
  const { db, a, b } = await fixture();
  try {
    const first = createIntent(db, { gift_id: a, amount: "25" });
    const second = createIntent(db, { gift_id: b, amount: "25" });
    assert.notEqual(first.id, second.id);
    assert.equal(first.id.length, 64);
    db.prepare("UPDATE owner SET paypal='ChangedTestRecipient'").run();
    assert.ok(
      String(contributionStatus(db, first.id).paypal_url).includes(
        "FictionalTestOnly",
      ),
    );
    declareIntent(db, first.id);
    db.prepare("UPDATE contributions SET state='detected' WHERE id=?").run(
      second.id,
    );
    assert.deepEqual(
      listGifts(db).map((g) => g.confirmed),
      [0, 0],
    );
    db.prepare(
      "UPDATE contributions SET state='intent',expires_at='2000-01-01' WHERE id=?",
    ).run(second.id);
    expireIntents(db);
    assert.equal(
      db.prepare("SELECT state FROM contributions WHERE id=?").get(second.id)!
        .state,
      "expired",
    );
    const v = { ...confirm(first.id), provenance: "verified" };
    const payment = confirmManual(db, v);
    assert.equal(confirmManual(db, v), payment);
    assert.throws(
      () => confirmManual(db, confirm(second.id)),
      /déjà confirmée/,
    );
    assert.equal(listGifts(db).find((g) => g.id === a)!.confirmed, 2400);
    assert.equal(listGifts(db).find((g) => g.id === b)!.confirmed, 0);
    confirmManual(db, confirm(second.id, "LATE-TRANSACTION"));
    assert.equal(listGifts(db).find((g) => g.id === b)!.confirmed, 2400);
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM payment_events").get()!.n,
      2,
    );
    assert.equal(
      db.prepare("SELECT provenance FROM payments WHERE id=?").get(payment)!
        .provenance,
      "manual",
    );
    const refunded = {
      payment_id: payment,
      event_id: randomUUID(),
      revision: 1,
      gross: "25",
      fee: "1",
      refunded: "10",
      net_reversed: "10",
      disputed: false,
      reason: "Remboursement partiel constaté",
    };
    correctPayment(db, refunded);
    correctPayment(db, refunded);
    assert.equal(listGifts(db).find((g) => g.id === a)!.confirmed, 1400);
    assert.throws(
      () => correctPayment(db, { ...refunded, event_id: randomUUID() }),
      /autre correction/,
    );
    correctPayment(db, {
      ...refunded,
      event_id: randomUUID(),
      revision: 2,
      disputed: true,
    });
    assert.equal(
      listGifts(db).find((g) => g.id === a)!.confirmed,
      1400,
      "un litige ne rembourse rien à lui seul",
    );
    correctPayment(db, {
      ...refunded,
      event_id: randomUUID(),
      revision: 3,
      refunded: "25",
      net_reversed: "24",
      disputed: false,
    });
    assert.equal(listGifts(db).find((g) => g.id === a)!.confirmed, 0);
    assert.equal(
      db
        .prepare("SELECT COUNT(*) n FROM payment_events WHERE payment_id=?")
        .get(payment)!.n,
      4,
    );
    assert.throws(
      () =>
        correctPayment(db, {
          ...refunded,
          event_id: randomUUID(),
          revision: 4,
          refunded: "26",
        }),
      /dépassent/,
    );
  } finally {
    db.close();
  }
});
test("frais inconnus, dépassement, fermeture et devises préservent les montants", async () => {
  const { db, a } = await fixture();
  try {
    const first = createIntent(db, { gift_id: a, amount: "120" });
    const late = createIntent(db, { gift_id: a, amount: "25" });
    const v = { ...confirm(first.id), gross: "120", fee: "" };
    const id = confirmManual(db, v);
    assert.equal(listGifts(db)[1]?.confirmed ?? listGifts(db)[0].confirmed, 0);
    const g = listGifts(db).find((g) => g.id === a)!;
    assert.equal(g.unknown_gross, 12000);
    assert.equal(g.confirmed, 0);
    correctPayment(db, {
      payment_id: id,
      event_id: randomUUID(),
      revision: 1,
      gross: "120",
      fee: "0",
      refunded: "0",
      net_reversed: "0",
      disputed: false,
      reason: "Absence de frais vérifiée",
    });
    assert.throws(
      () => createIntent(db, { gift_id: a, amount: "1" }),
      /terminé/,
    );
    confirmManual(db, confirm(late.id, "LATE-OVERFUND"));
    assert.equal(listGifts(db).find((g) => g.id === a)!.confirmed, 14400);
    assert.equal(
      db.prepare("SELECT purchased FROM gifts WHERE id=?").get(a)!.purchased,
      0,
    );
    db.prepare("UPDATE owner SET currency='USD'").run();
    saveGift(
      db,
      {
        title: "Cadeau modifié",
        url: "https://example.com/a",
        target: "200",
        visibility: "visible",
      },
      a,
    );
    assert.equal(
      db.prepare("SELECT currency FROM gifts WHERE id=?").get(a)!.currency,
      "EUR",
    );
    assert.throws(
      () => createIntent(db, { gift_id: a, amount: "1" }),
      /ancienne devise/,
    );
  } finally {
    db.close();
  }
});
test("deux connexions concurrentes ne créditent la transaction qu’une fois", async () => {
  const folder = mkdtempSync(join(tmpdir(), "wishlister-race-"));
  const path = join(folder, "db.sqlite");
  const { db, a } = await fixture(path);
  try {
    const intent = createIntent(db, { gift_id: a, amount: "25" });
    const v = confirm(intent.id);
    const run = () =>
      new Promise((resolve, reject) => {
        const worker = new Worker(
          new URL("./confirm-worker.mjs", import.meta.url),
          { workerData: { path, input: v }, execArgv: ["--import", "tsx"] },
        );
        worker.on("message", resolve);
        worker.on("error", reject);
        worker.on("exit", (code) => {
          if (code) reject(new Error(`worker ${code}`));
        });
      });
    const values = await Promise.all([run(), run()]);
    assert.equal(values[0], values[1]);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM payments").get()!.n, 1);
    assert.equal(listGifts(db).find((g) => g.id === a)!.confirmed, 2400);
  } finally {
    db.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
