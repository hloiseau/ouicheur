import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  utimesSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";
import { DatabaseSync } from "node:sqlite";
import { extract } from "tar";
import { openDatabase } from "../lib/db";
import { initializeOwner } from "../lib/auth";
import { listGifts, saveGift } from "../lib/gifts";
import {
  accessFromCookies,
  canReadImage,
  resolveShare,
  rotateShare,
  saveList,
  shareCookie,
  listLists,
} from "../lib/lists";
import {
  createReservation,
  updateReservation,
  reservationStatus,
  reservedQuantity,
} from "../lib/reservations";
import {
  createIntent,
  declareIntent,
  reviewContribution,
  confirmManual,
} from "../lib/payments";
import {
  backupHistory,
  createBackup,
  diagnostics,
  downloadBackup,
  runMaintenance,
} from "../lib/operations";
import { restoreInstance } from "../lib/backup";
import { getSettings, saveSettings } from "../lib/settings";
import {
  enqueueNotification,
  deliverNotifications,
} from "../lib/notifications";
import { refreshProduct, applyProductPrice } from "../lib/product-refresh";
import { cleanup, cleanupPreview, assertImageSpace } from "../lib/storage";
import { parseMetadata } from "../lib/metadata";

const input = {
  title: "Private test gift",
  url: "https://example.com/private",
  target: "25.00",
  quantity: 2,
};
async function fixture(path = ":memory:") {
  const db = openDatabase(path);
  await initializeOwner(db, "Synthetic owner", "test-only-password-2026", {
    paypal: "FictionalTestOnly",
    currency: "EUR",
  });
  return db;
}
test("upgrade from all nine existing migrations preserves the public list and legacy totals", () => {
  const root = mkdtempSync(join(tmpdir(), "ouicheur-upgrade-"));
  const path = join(root, "wishlist.sqlite");
  let db = new DatabaseSync(path);
  db.exec("CREATE TABLE migrations(name TEXT PRIMARY KEY) STRICT");
  for (const name of readdirSync("migrations")
    .filter((n) => n.endsWith(".sql") && n < "010")
    .sort()) {
    db.exec(readFileSync(join("migrations", name), "utf8"));
    db.prepare("INSERT INTO migrations VALUES (?)").run(name);
  }
  db.exec(
    "INSERT INTO owner(id,password_hash,name) VALUES(1,'test-hash','Existing owner'); INSERT INTO gifts(id,url,title,target,currency,visibility,created_at,updated_at) VALUES('old','https://example.com','Old wish',2500,'EUR','visible','2026-01-01','2026-01-01')",
  );
  db.close();
  db = openDatabase(path);
  try {
    assert.equal(listGifts(db)[0].list_id, "default");
    assert.equal(listGifts(db)[0].target, 2500);
    assert.equal(
      db.prepare("SELECT strict_contributions FROM owner").get()!
        .strict_contributions,
      0,
    );
    assert.equal(listLists(db).length, 1);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});
test("private and revoked lists protect gifts, funding, reservations and media", async () => {
  const db = await fixture();
  try {
    const id = saveList(db, { name: "Secret event", visibility: "private" });
    const image = `/media/${"a".repeat(64)}.webp`;
    const gift = saveGift(db, { ...input, list_id: id, image });
    assert.equal(listGifts(db).length, 0);
    assert.equal(canReadImage(db, image), false);
    assert.throws(
      () => createIntent(db, { gift_id: gift, amount: "1" }),
      /introuvable/,
    );
    assert.throws(
      () => createReservation(db, { gift_id: gift, quantity: 1 }),
      /introuvable/,
    );
    assert.throws(() => rotateShare(db, id));
    saveList(db, { id, name: "Secret event", visibility: "unlisted" });
    const token = rotateShare(db, id)!;
    const cookie = {
      get: (name: string) =>
        name === shareCookie(id) ? { value: token } : undefined,
    };
    const access = () => accessFromCookies(db, cookie);
    assert.equal(listGifts(db, false, access()).length, 1);
    assert.equal(canReadImage(db, image, access()), true);
    assert.equal(resolveShare(db, token)!.id, id);
    assert.ok(
      !JSON.stringify(db.prepare("SELECT * FROM lists").all()).includes(token),
    );
    rotateShare(db, id, true);
    assert.equal(resolveShare(db, token), undefined);
    assert.equal(canReadImage(db, image, access()), false);
    assert.equal(listGifts(db, false, access()).length, 0);
    saveList(db, {
      id,
      name: "Secret event",
      visibility: "public",
      archived: true,
    });
    assert.equal(listGifts(db).length, 0);
  } finally {
    db.close();
  }
});
test("strict mode waits for approval and preserves the payment ledger", async () => {
  const db = await fixture();
  try {
    const gift = saveGift(db, { ...input, quantity: 1 });
    const { id } = createIntent(db, { gift_id: gift, amount: "25" });
    declareIntent(db, id);
    assert.equal(listGifts(db)[0].funded, 2500);
    db.exec("UPDATE owner SET strict_contributions=1");
    assert.equal(listGifts(db)[0].funded, 0);
    assert.equal(listGifts(db)[0].declared, 2500);
    reviewContribution(db, { id, approved: true });
    assert.equal(listGifts(db)[0].funded, 2500);
    assert.equal(listGifts(db)[0].declared, 0);
    confirmManual(db, {
      contribution_id: id,
      transaction_ref: "TEST-STRICT",
      gross: "25",
      fee: "1",
      currency: "EUR",
      reason: "Synthetic approved payment",
      event_id: randomUUID(),
      recipient_checked: true,
      association_checked: true,
      received_checked: true,
    });
    assert.equal(listGifts(db)[0].funded, 2400);
    assert.equal(listGifts(db)[0].confirmed, 2400);
  } finally {
    db.close();
  }
});
test("reservations expire, cancel and confirm without creating payments or exceeding quantity", async () => {
  const db = await fixture();
  try {
    const gift = saveGift(db, input);
    const first = createReservation(db, { gift_id: gift, quantity: 1 });
    assert.equal(reservedQuantity(db, gift), 1);
    assert.throws(
      () => createReservation(db, { gift_id: gift, quantity: 2 }),
      /réservée/,
    );
    assert.throws(
      () => createIntent(db, { gift_id: gift, amount: "1" }),
      /réservée/,
    );
    db.exec("UPDATE reservations SET expires_at='2000-01-01'");
    assert.equal(reservationStatus(db, first.token).state, "expired");
    assert.throws(() =>
      updateReservation(db, first.token, { state: "purchased" }),
    );
    const second = createReservation(db, { gift_id: gift, quantity: 2 });
    updateReservation(db, second.token, { state: "cancelled" });
    assert.equal(reservedQuantity(db, gift), 0);
    const last = createReservation(db, { gift_id: gift, quantity: 2 });
    updateReservation(db, last.token, { state: "purchased" });
    assert.equal(reservedQuantity(db, gift), 2);
    assert.throws(
      () => saveGift(db, { ...input, quantity: 1 }, gift),
      /quantité/,
    );
    assert.equal(db.prepare("SELECT COUNT(*) n FROM payments").get()!.n, 0);
    assert.ok(
      !JSON.stringify(db.prepare("SELECT * FROM reservations").all()).includes(
        last.token,
      ),
    );
  } finally {
    db.close();
  }
});
test("two concurrent visitors cannot reserve the final item twice", async () => {
  const folder = mkdtempSync(join(tmpdir(), "ouicheur-reserve-"));
  const path = join(folder, "wishlist.sqlite");
  const db = await fixture(path);
  try {
    const gift = saveGift(db, { ...input, quantity: 1 });
    const run = () =>
      new Promise((resolve, reject) => {
        const worker = new Worker(
          new URL("./reserve-worker.mjs", import.meta.url),
          {
            workerData: { path, input: { gift_id: gift, quantity: 1 } },
            execArgv: ["--import", "tsx"],
          },
        );
        worker.on("message", resolve);
        worker.on("error", reject);
        worker.on("exit", (code) => {
          if (code) reject(new Error(`worker ${code}`));
        });
      });
    const results = await Promise.all([run(), run()]);
    assert.deepEqual(results.sort(), [409, "reserved"]);
    assert.equal(reservedQuantity(db, gift), 1);
  } finally {
    db.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
test("durable notifications retry with generic event-only payloads and deduplicate declarations", async () => {
  const db = await fixture();
  try {
    enqueueNotification(db, "declaration", "off");
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM notification_jobs").get()!.n,
      0,
    );
    saveSettings(db, { ...getSettings(db), notifications: true });
    const gift = saveGift(db, input);
    const { id } = createIntent(db, {
      gift_id: gift,
      amount: "5",
      nickname: "Do not leak me",
    });
    declareIntent(db, id);
    declareIntent(db, id);
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM notification_jobs").get()!.n,
      1,
    );
    await deliverNotifications(db, async () => {
      throw new Error("Test network failure with a secret");
    });
    assert.equal(
      db.prepare("SELECT attempts FROM notification_jobs").get()!.attempts,
      1,
    );
    db.exec("UPDATE notification_jobs SET next_attempt=0");
    const delivered: string[] = [];
    await deliverNotifications(db, async (kind) => {
      delivered.push(kind);
    });
    assert.deepEqual(delivered, ["declaration"]);
    assert.equal(
      db.prepare("SELECT state FROM notification_jobs").get()!.state,
      "sent",
    );
    assert.doesNotMatch(
      JSON.stringify(db.prepare("SELECT * FROM notification_jobs").all()),
      /Do not leak|secret/,
    );
  } finally {
    db.close();
  }
});
test("price refresh requires explicit confirmation and rejects stale goals or another currency", async () => {
  const db = await fixture();
  try {
    const gift = saveGift(db, input);
    const metadata = parseMetadata(
      '<script type="application/ld+json">{"@type":"Product","name":"Test","offers":{"price":"30","priceCurrency":"EUR","availability":"https://schema.org/InStock"}}</script>',
      input.url,
    );
    const check = await refreshProduct(db, gift, async () => metadata);
    assert.equal(check.availability, "in_stock");
    assert.equal(listGifts(db)[0].target, 5000);
    applyProductPrice(db, String(check.id));
    assert.equal(listGifts(db)[0].target, 6000);
    assert.throws(() => applyProductPrice(db, String(check.id)));
    const foreign = await refreshProduct(db, gift, async () => ({
      ...metadata,
      currency: "USD",
    }));
    assert.throws(() => applyProductPrice(db, String(foreign.id)), /changé/);
    const stale = await refreshProduct(db, gift, async () => metadata);
    db.prepare("UPDATE gifts SET quantity=3 WHERE id=?").run(gift);
    assert.throws(() => applyProductPrice(db, String(stale.id)));
    const failed = await refreshProduct(db, gift, async () => {
      throw new Error("merchant error");
    });
    assert.equal(failed.state, "failed");
    assert.equal(listGifts(db)[0].target, 6000);
  } finally {
    db.close();
  }
});
test("complete managed backups restore images, settings and lists, and prune only after success", async () => {
  const folder = mkdtempSync(join(tmpdir(), "ouicheur-backup-"));
  const db = await fixture(join(folder, "data", "wishlist.sqlite"));
  const root = join(folder, "backups");
  try {
    mkdirSync(join(folder, "data", "images"));
    const name = "a".repeat(64) + ".webp";
    writeFileSync(join(folder, "data", "images", name), "synthetic image");
    const list = saveList(db, {
      name: "Private backup event",
      visibility: "private",
    });
    saveGift(db, { ...input, list_id: list, image: "/media/" + name });
    saveSettings(db, { ...getSettings(db), backup_keep: 1 });
    const first = await createBackup(db, join(folder, "data"), root);
    assert.equal(backupHistory(db)[0].state, "done");
    assert.ok(
      (await downloadBackup(db, first, root).arrayBuffer()).byteLength > 0,
    );
    assert.throws(() => downloadBackup(db, "../wishlist.sqlite", root));
    const second = await createBackup(db, join(folder, "data"), root);
    assert.equal(existsSync(join(root, first + ".tar.gz")), false);
    assert.equal(backupHistory(db).filter((b) => b.state === "done").length, 1);
    const unpacked = join(folder, "unpacked");
    mkdirSync(unpacked);
    await extract({ cwd: unpacked, file: join(root, second + ".tar.gz") });
    const restored = restoreInstance(unpacked, join(folder, "restored"));
    const check = openDatabase(join(restored, "wishlist.sqlite"));
    try {
      assert.equal(listGifts(check, true)[0].list_id, list);
      assert.equal(
        readFileSync(join(restored, "images", name), "utf8"),
        "synthetic image",
      );
      assert.equal(getSettings(check).backup_keep, 1);
    } finally {
      check.close();
    }
    assert.doesNotMatch(
      JSON.stringify(diagnostics(db, join(folder, "data"))),
      /Synthetic owner|FictionalTestOnly|password_hash|Private backup event/,
    );
  } finally {
    db.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
test("cleanup protects referenced and recent images, active imports, backups and financial entries", async () => {
  const folder = mkdtempSync(join(tmpdir(), "ouicheur-cleanup-"));
  const db = await fixture(join(folder, "wishlist.sqlite"));
  try {
    mkdirSync(join(folder, "images"));
    const names = ["a", "b", "c"].map((c) => c.repeat(64) + ".webp");
    for (const name of names)
      writeFileSync(join(folder, "images", name), "test");
    for (const name of names.slice(0, 2))
      utimesSync(join(folder, "images", name), new Date(0), new Date(0));
    const gift = saveGift(db, { ...input, image: "/media/" + names[0] });
    const intent = createIntent(db, { gift_id: gift, amount: "5" });
    declareIntent(db, intent.id);
    db.exec(
      "UPDATE contributions SET created_at='2000-01-01',expires_at='2000-01-01'",
    );
    assert.equal(cleanupPreview(db, folder).images, 1);
    db.prepare(
      "INSERT INTO backup_jobs(id,state,created_at) VALUES (?,'running',?)",
    ).run(randomUUID(), new Date().toISOString());
    assert.equal(cleanupPreview(db, folder).images, 0);
    db.exec("DELETE FROM backup_jobs");
    assert.throws(() => cleanup(db, folder, "0".repeat(64)), /changé/);
    cleanup(db, folder, cleanupPreview(db, folder).token);
    assert.equal(existsSync(join(folder, "images", names[0])), true);
    assert.equal(existsSync(join(folder, "images", names[1])), false);
    assert.equal(existsSync(join(folder, "images", names[2])), true);
    assert.equal(
      db.prepare("SELECT state FROM contributions WHERE id=?").get(intent.id)!
        .state,
      "declared",
    );
    assert.throws(
      () => assertImageSpace(db, 3 * 1024 * 1024 * 1024, folder),
      /Stockage/,
    );
  } finally {
    db.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test("scheduled backups catch up once after downtime and respect the next due date", async () => {
  const folder = mkdtempSync(join(tmpdir(), "ouicheur-schedule-"));
  const db = await fixture(join(folder, "data", "wishlist.sqlite"));
  const previous = {
    data: process.env.DATA_DIR,
    backup: process.env.BACKUP_DIR,
  };
  process.env.DATA_DIR = join(folder, "data");
  process.env.BACKUP_DIR = join(folder, "backups");
  try {
    saveSettings(db, { ...getSettings(db), backup_hours: 24 });
    await runMaintenance(db);
    assert.equal(backupHistory(db).length, 1);
    await runMaintenance(db);
    assert.equal(backupHistory(db).length, 1);
    db.exec("UPDATE backup_jobs SET created_at='2000-01-01T00:00:00.000Z'");
    await runMaintenance(db);
    assert.equal(backupHistory(db).length, 2);
    await runMaintenance(db);
    assert.equal(backupHistory(db).length, 2);
  } finally {
    if (previous.data === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous.data;
    if (previous.backup === undefined) delete process.env.BACKUP_DIR;
    else process.env.BACKUP_DIR = previous.backup;
    db.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
