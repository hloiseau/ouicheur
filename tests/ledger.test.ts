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
  reviewContribution,
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

test("un envoi déclaré compte immédiatement, une seule fois, et reste corrigeable", async () => {
  const { db, a, b } = await fixture();
  const total = () => listGifts(db).find((gift) => gift.id === a)!;
  try {
    const sent = createIntent(db, { gift_id: a, amount: "25" });
    const rejected = createIntent(db, { gift_id: a, amount: "75" });
    const expired = createIntent(db, { gift_id: a, amount: "10" });
    db.prepare(
      "UPDATE contributions SET expires_at='2000-01-01' WHERE id=?",
    ).run(expired.id);
    expireIntents(db);
    const detected = createIntent(db, { gift_id: a, amount: "10" });
    db.prepare("UPDATE contributions SET state='detected' WHERE id=?").run(
      detected.id,
    );
    assert.equal(total().funded, 0);

    declareIntent(db, sent.id);
    declareIntent(db, sent.id);
    assert.equal(total().funded, 2500);
    assert.equal(total().confirmed, 0);
    assert.equal(contributionStatus(db, sent.id).payment, null);
    assert.equal(listGifts(db).find((gift) => gift.id === b)!.funded, 0);
    assert.throws(
      () => createIntent(db, { gift_id: a, amount: "75.01" }),
      /montant restant/,
    );
    declareIntent(db, rejected.id);
    assert.equal(total().funded, 10000);
    assert.throws(
      () => createIntent(db, { gift_id: a, amount: "1" }),
      /terminé/,
    );
    db.prepare("UPDATE contributions SET state='rejected' WHERE id=?").run(
      rejected.id,
    );
    declareIntent(db, rejected.id);
    assert.equal(total().funded, 2500);
    assert.ok(createIntent(db, { gift_id: a, amount: "75" }).id);

    const confirmation = { ...confirm(sent.id), fee: "" };
    const payment = confirmManual(db, confirmation);
    confirmManual(db, confirmation);
    assert.equal(total().funded, 2500);
    assert.equal(total().unknown_gross, 2500);
    const correction = {
      payment_id: payment,
      event_id: randomUUID(),
      revision: 1,
      gross: "25",
      fee: "1",
      refunded: "10",
      net_reversed: "10",
      disputed: false,
      reason: "Remboursement partiel vérifié",
    };
    correctPayment(db, correction);
    correctPayment(db, correction);
    assert.equal(total().funded, 1400);
    correctPayment(db, {
      ...correction,
      event_id: randomUUID(),
      revision: 2,
      fee: "",
      refunded: "0",
    });
    assert.equal(total().funded, 1500);
    assert.equal(total().unknown_gross, 1500);
    correctPayment(db, {
      ...correction,
      event_id: randomUUID(),
      revision: 3,
      refunded: "25",
      net_reversed: "24",
    });
    declareIntent(db, sent.id);
    assert.equal(total().funded, 0);
    declareIntent(db, expired.id);
    assert.equal(total().funded, 1000);
  } finally {
    db.close();
  }
});
test("le propriétaire valide ou refuse en un clic sans inventer de transaction", async () => {
  const { db, a } = await fixture();
  const total = () => listGifts(db).find((gift) => gift.id === a)!.funded;
  try {
    const { id } = createIntent(db, { gift_id: a, amount: "25" });
    declareIntent(db, id);
    assert.equal(contributionStatus(db, id).approved, 0);
    reviewContribution(db, {
      id,
      approved: true,
      amount: "500",
      provenance: "verified",
    });
    reviewContribution(db, { id, approved: true });
    assert.equal(total(), 2500);
    assert.equal(contributionStatus(db, id).approved, 1);
    assert.equal(contributionStatus(db, id).payment, null);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM payments").get()!.n, 0);
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) n FROM audit WHERE action='contribution.review'",
        )
        .get()!.n,
      1,
    );
    reviewContribution(db, { id, approved: false });
    reviewContribution(db, { id, approved: false });
    declareIntent(db, id);
    assert.equal(total(), 0);
    assert.equal(contributionStatus(db, id).approved, 0);
    assert.equal(contributionStatus(db, id).state, "rejected");
    reviewContribution(db, { id, approved: true });
    assert.equal(total(), 2500);
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) n FROM audit WHERE action='contribution.review'",
        )
        .get()!.n,
      3,
    );
    assert.throws(() => reviewContribution(db, { id, approved: "yes" }));
    assert.throws(
      () => reviewContribution(db, { id: "0".repeat(64), approved: true }),
      /introuvable/,
    );
    confirmManual(db, confirm(id));
    assert.equal(total(), 2400);
    assert.throws(
      () => reviewContribution(db, { id, approved: false }),
      /correction/,
    );
    assert.equal(total(), 2400);
  } finally {
    db.close();
  }
});

test("une intention ne dépasse ni le prix du cadeau ni le reste à financer", async () => {
  const { db, a } = await fixture();
  try {
    db.prepare("UPDATE gifts SET target=795 WHERE id=?").run(a);
    for (const amount of ["7.96", "10", "25", "50"])
      assert.throws(
        () => createIntent(db, { gift_id: a, amount }),
        /montant restant à financer/,
      );
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM contributions").get()!.n,
      0,
    );
    const full = createIntent(db, { gift_id: a, amount: "7,95" });
    assert.match(full.paypal_url, /\/7\.95EUR$/);
    const first = createIntent(db, { gift_id: a, amount: "5" });
    const payment = confirmManual(db, {
      ...confirm(first.id),
      gross: "5",
      fee: "0.50",
    });
    assert.throws(
      () => createIntent(db, { gift_id: a, amount: "3.46" }),
      /montant restant à financer/,
    );
    const rest = createIntent(db, { gift_id: a, amount: "3.45" });
    assert.match(rest.paypal_url, /\/3\.45EUR$/);
    confirmManual(db, {
      ...confirm(rest.id, "TEST-REMAINING"),
      gross: "3.44",
      fee: "0",
    });
    assert.throws(
      () => createIntent(db, { gift_id: a, amount: "0.02" }),
      /montant restant à financer/,
    );
    const cent = createIntent(db, { gift_id: a, amount: "0.01" });
    confirmManual(db, {
      ...confirm(cent.id, "TEST-LAST-CENT"),
      gross: "0.01",
      fee: "0",
    });
    assert.throws(
      () => createIntent(db, { gift_id: a, amount: "0.01" }),
      /terminé/,
    );
    correctPayment(db, {
      payment_id: payment,
      event_id: randomUUID(),
      revision: 1,
      gross: "5",
      fee: "0.50",
      refunded: "1",
      net_reversed: "1",
      disputed: false,
      reason: "Remboursement partiel vérifié",
    });
    assert.throws(
      () => createIntent(db, { gift_id: a, amount: "1.01" }),
      /montant restant à financer/,
    );
    assert.match(
      createIntent(db, { gift_id: a, amount: "1" }).paypal_url,
      /\/1\.00EUR$/,
    );
  } finally {
    db.close();
  }
});
test("frais inconnus, dépassement, fermeture et devises préservent les montants", async () => {
  const { db, a } = await fixture();
  try {
    const first = createIntent(db, { gift_id: a, amount: "100" });
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
